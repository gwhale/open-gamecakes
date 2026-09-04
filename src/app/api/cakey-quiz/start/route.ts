import { buildQuizQuestions, publicQuestion, type QuizAnswer, type StoredQuizQuestion } from '@/lib/cakey-quiz/core';
import { requireQuizContext, resolvePlacements } from '@/lib/cakey-quiz/server';

const SESSION_TTL_MS = 30 * 60 * 1000;

export async function POST(): Promise<Response> {
  const context = await requireQuizContext();
  if (context instanceof Response) return context;

  try {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
    const { data: active } = await context.sb
      .from('cakey_quiz_sessions')
      .select('id, questions, answers, adjustment_eligible, next_adjustment_at, started_at')
      .eq('kid_id', context.kidId)
      .eq('status', 'in_progress')
      .gt('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active) {
      const questions = active.questions as StoredQuizQuestion[];
      const answers = (active.answers ?? []) as QuizAnswer[];
      const next = questions[answers.length];
      if (next) {
        return Response.json({
          sessionId: active.id,
          question: publicQuestion(next),
          questionNumber: answers.length + 1,
          totalQuestions: questions.length,
          adjustmentEligible: active.adjustment_eligible as boolean,
          nextAdjustmentAt: active.next_adjustment_at as string | null,
          resumed: answers.length > 0,
          guest: context.guest,
        });
      }
    }

    const resolved = await resolvePlacements(context);
    const questions = buildQuizQuestions(resolved.placement);
    const { data: session, error } = await context.sb
      .from('cakey_quiz_sessions')
      .insert({
        kid_id: context.kidId,
        family_id: context.familyId,
        status: 'in_progress',
        adjustment_eligible: resolved.adjustmentEligible,
        next_adjustment_at: resolved.nextAdjustmentAt,
        starting_math_tier: resolved.placement.math,
        starting_reading_tier: resolved.placement.reading,
        questions,
        answers: [],
      })
      .select('id')
      .single();

    if (error || !session) {
      return Response.json({ error: error?.message ?? 'could not start quiz' }, { status: 500 });
    }

    return Response.json({
      sessionId: session.id,
      question: publicQuestion(questions[0]),
      questionNumber: 1,
      totalQuestions: questions.length,
      adjustmentEligible: resolved.adjustmentEligible,
      nextAdjustmentAt: resolved.nextAdjustmentAt,
      resumed: false,
      guest: context.guest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'could not start quiz';
    return Response.json({ error: message }, { status: 500 });
  }
}
