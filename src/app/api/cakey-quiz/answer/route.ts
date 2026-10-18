import {
  answerMatches,
  isAdjustmentEligible,
  publicQuestion,
  scorePlacement,
  type QuizAnswer,
  type StoredQuizQuestion,
} from '@/lib/cakey-quiz/core';
import { requireQuizContext } from '@/lib/cakey-quiz/server';

const SESSION_TTL_MS = 30 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const context = await requireQuizContext();
  if (context instanceof Response) return context;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!raw || typeof raw !== 'object') {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const response = typeof body.response === 'string' ? body.response.trim() : '';
  if (!sessionId || !questionId || !response) {
    return Response.json({ error: 'sessionId, questionId, and response required' }, { status: 400 });
  }

  const { data: session, error } = await context.sb
    .from('cakey_quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('kid_id', context.kidId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!session) return Response.json({ error: 'quiz not found' }, { status: 404 });
  const questions = session.questions as StoredQuizQuestion[];
  const answers = (session.answers ?? []) as QuizAnswer[];
  const priorAnswer = answers.find((answer) => answer.questionId === questionId);

  // Network retries are idempotent. Return the already-recorded outcome rather
  // than treating the same tap as an answer to the next question.
  if (priorAnswer) {
    const priorQuestion = questions.find((question) => question.id === questionId);
    if (!priorQuestion) return Response.json({ error: 'quiz question not found' }, { status: 409 });
    if (session.status === 'completed') {
      return Response.json({
        correct: priorAnswer.correct,
        correctAnswer: priorQuestion.answer,
        complete: true,
        mathScore: session.math_score,
        readingScore: session.reading_score,
        startingMathTier: session.starting_math_tier,
        startingReadingTier: session.starting_reading_tier,
        mathTier: session.result_math_tier,
        readingTier: session.result_reading_tier,
        adjustmentApplied: session.adjustment_applied,
        guest: context.guest,
      });
    }
    return Response.json({
      correct: priorAnswer.correct,
      correctAnswer: priorQuestion.answer,
      complete: false,
      nextQuestion: publicQuestion(questions[answers.length]),
      questionNumber: answers.length + 1,
      totalQuestions: questions.length,
    });
  }
  if (session.status !== 'in_progress') {
    return Response.json({ error: 'quiz is no longer active' }, { status: 409 });
  }
  if (Date.now() - new Date(session.started_at as string).getTime() > SESSION_TTL_MS) {
    await context.sb.from('cakey_quiz_sessions').update({ status: 'expired' }).eq('id', sessionId);
    return Response.json({ error: 'quiz expired; start a new one' }, { status: 410 });
  }

  const question = questions[answers.length];
  if (!question) return Response.json({ error: 'quiz has no next question' }, { status: 409 });
  if (question.id !== questionId) {
    return Response.json({ error: 'answer does not match the current question' }, { status: 409 });
  }

  const correct = answerMatches(question, response);
  const nextAnswers: QuizAnswer[] = [
    ...answers,
    {
      questionId: question.id,
      response,
      correct,
      answeredAt: new Date().toISOString(),
    },
  ];
  const complete = nextAnswers.length === questions.length;

  if (!complete) {
    const { error: updateError } = await context.sb
      .from('cakey_quiz_sessions')
      .update({ answers: nextAnswers })
      .eq('id', sessionId)
      .eq('status', 'in_progress');
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
    return Response.json({
      correct,
      correctAnswer: question.answer,
      complete: false,
      nextQuestion: publicQuestion(questions[nextAnswers.length]),
      questionNumber: nextAnswers.length + 1,
      totalQuestions: questions.length,
    });
  }

  const mathScore = nextAnswers.filter((answer) => answer.questionId.startsWith('math-') && answer.correct).length;
  const readingScore = nextAnswers.filter((answer) => answer.questionId.startsWith('reading-') && answer.correct).length;
  const startingMath = session.starting_math_tier as number;
  const startingReading = session.starting_reading_tier as number;
  let adjustmentApplied = false;
  let mathTier = startingMath;
  let readingTier = startingReading;
  const now = new Date();

  if (!context.guest && session.adjustment_eligible) {
    const { data: currentRows } = await context.sb
      .from('kid_subject_placements')
      .select('subject, current_tier, last_assessed_at')
      .eq('kid_id', context.kidId);
    const latest = (currentRows ?? [])
      .map((row) => row.last_assessed_at as string | null)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    if (isAdjustmentEligible(latest, now)) {
      mathTier = scorePlacement(startingMath, mathScore);
      readingTier = scorePlacement(startingReading, readingScore);
      const { error: placementError } = await context.sb
        .from('kid_subject_placements')
        .upsert(
          [
            {
              kid_id: context.kidId,
              family_id: context.familyId,
              subject: 'math',
              current_tier: mathTier,
              last_assessed_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
            {
              kid_id: context.kidId,
              family_id: context.familyId,
              subject: 'reading',
              current_tier: readingTier,
              last_assessed_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          ],
          { onConflict: 'kid_id,subject' },
        );
      if (placementError) {
        return Response.json({ error: placementError.message }, { status: 500 });
      }
      adjustmentApplied = true;
    }
  }

  const completedAt = now.toISOString();
  const { error: completionError } = await context.sb
    .from('cakey_quiz_sessions')
    .update({
      status: 'completed',
      answers: nextAnswers,
      math_score: mathScore,
      reading_score: readingScore,
      result_math_tier: mathTier,
      result_reading_tier: readingTier,
      adjustment_applied: adjustmentApplied,
      completed_at: completedAt,
    })
    .eq('id', sessionId)
    .eq('status', 'in_progress');
  if (completionError) return Response.json({ error: completionError.message }, { status: 500 });

  return Response.json({
    correct,
    correctAnswer: question.answer,
    complete: true,
    mathScore,
    readingScore,
    startingMathTier: startingMath,
    startingReadingTier: startingReading,
    mathTier,
    readingTier,
    adjustmentApplied,
    guest: context.guest,
  });
}
