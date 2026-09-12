// Strength and cost probe for the checkers bot.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/checkers-bot-probe.mjs [games]
//
// Two jobs, both of which the repo has no other way to do (there is no test
// runner here):
//
//   1. STRENGTH ORDERING. A deeper, better-configured bot must actually beat a
//      shallower one. If depth 6 does not win ~90%+ against depth 2, either the
//      evaluation or the quiescence search is wrong — and a broken quiescence is
//      invisible any other way, because the bot still plays legal, plausible
//      moves, it just hallucinates being a piece up after every trade.
//
//   2. COST. Prints nodes and ms per move per tier. The depth figures in the
//      ladder came from branching-factor arithmetic, not measurement, and want
//      an iPad pass before they are trusted. This is the desktop half of that.

import { initialState, legalMoves, applyMove, result, positionKey, material } from '../src/lib/games/checkers/rules.ts';
import { chooseBotMove, makeRng, searchCost } from '../src/lib/games/checkers/bot.ts';
import { OPPONENTS, opponentForLevel } from '../src/lib/games/checkers/opponents.ts';

const GAMES = Number(process.argv[2] ?? 50);
const TURN_CAP = 150;

const play = (cfgDark, cfgLight, seed) => {
  const rng = makeRng(seed);
  let s = initialState();
  const history = new Map([[positionKey(s), 1]]);
  for (let turn = 0; turn < TURN_CAP; turn += 1) {
    const done = result(s, history);
    if (done) return done;
    const move = chooseBotMove(s, s.turn === 'dark' ? cfgDark : cfgLight, rng);
    if (!move) return { kind: 'win', side: s.turn === 'dark' ? 'light' : 'dark' };
    s = applyMove(s, move);
    const k = positionKey(s);
    history.set(k, (history.get(k) ?? 0) + 1);
  }
  // Adjudicate on material, as the game shell does at its own turn cap.
  const m = material(s);
  const score = (x) => x.men + x.kings * 1.6;
  const d = score(m.dark) - score(m.light);
  if (Math.abs(d) < 0.5) return { kind: 'draw', reason: 'adjudicated' };
  return { kind: 'win', side: d > 0 ? 'dark' : 'light' };
};

// --- 1. Strength ordering ---------------------------------------------------

const weak = opponentForLevel(1).bot;
const strong = opponentForLevel(9).bot;

let strongWins = 0;
let weakWins = 0;
let draws = 0;
for (let g = 0; g < GAMES; g += 1) {
  // Alternate colours so neither side's first-move advantage decides it.
  const strongIsDark = g % 2 === 0;
  const r = play(strongIsDark ? strong : weak, strongIsDark ? weak : strong, 0x51ced + g * 7919);
  if (r.kind === 'draw') draws += 1;
  else if ((r.side === 'dark') === strongIsDark) strongWins += 1;
  else weakWins += 1;
}

const decisive = strongWins + weakWins;
const rate = decisive === 0 ? 0 : strongWins / decisive;
console.log(`Strength: ${OPPONENTS[4].name} (lv9) vs ${OPPONENTS[0].name} (lv1) over ${GAMES} games`);
console.log(`  strong ${strongWins} · weak ${weakWins} · draw ${draws}   → ${(rate * 100).toFixed(0)}% of decisive games`);

// --- 1b. Ladder monotonicity ------------------------------------------------
//
// The extremes beating each other proves very little on its own — it would still
// pass if the middle three tiers were indistinguishable, which is exactly the
// failure a kid feels as "levels 5, 6, 7 and 8 are all the same". Each rung must
// beat the one below it.

console.log('\nLadder (each tier vs the one below, half the games as each colour):');
let ladderOk = true;
for (let i = 1; i < OPPONENTS.length; i += 1) {
  const lower = OPPONENTS[i - 1];
  const upper = OPPONENTS[i];
  let up = 0;
  let down = 0;
  let tie = 0;
  const n = Math.max(10, Math.round(GAMES / 2));
  for (let g = 0; g < n; g += 1) {
    const upperIsDark = g % 2 === 0;
    const r = play(
      upperIsDark ? upper.bot : lower.bot,
      upperIsDark ? lower.bot : upper.bot,
      0x9a5e1 + i * 104729 + g * 7919,
    );
    if (r.kind === 'draw') tie += 1;
    else if ((r.side === 'dark') === upperIsDark) up += 1;
    else down += 1;
  }
  const dec = up + down;
  const pct = dec === 0 ? 0 : up / dec;
  const verdict = pct >= 0.6 ? 'ok' : 'TOO CLOSE';
  if (pct < 0.6) ladderOk = false;
  console.log(
    `  ${upper.name.padEnd(12)} over ${lower.name.padEnd(12)} ` +
      `${String(up).padStart(3)}-${String(down).padEnd(3)} (${tie} tie)  ${(pct * 100).toFixed(0)}%  ${verdict}`,
  );
}

// --- 2. Cost ----------------------------------------------------------------

// A middlegame-ish position: play 16 random turns off the opening first, so the
// board is open and the branching factor is realistic.
const rng = makeRng(0xbadca7);
let mid = initialState();
for (let i = 0; i < 16; i += 1) {
  const moves = legalMoves(mid);
  if (moves.length === 0) break;
  mid = applyMove(mid, moves[Math.floor(rng() * moves.length)]);
}

console.log('\nCost per move (desktop node, 16-turn midgame):');
for (const o of OPPONENTS) {
  const { nodes, ms } = searchCost(mid, o.bot.depth, o.bot);
  const levels = o.levels.join('-');
  console.log(
    `  lv ${levels.padEnd(5)} ${o.name.padEnd(12)} depth ${String(o.bot.depth).padEnd(2)} ` +
      `${String(nodes).padStart(7)} nodes  ${ms.toFixed(1).padStart(7)} ms`,
  );
}

if (rate < 0.9 && decisive > 0) {
  console.error(`\nFAIL: strong bot won only ${(rate * 100).toFixed(0)}% of decisive games, want >=90%.`);
  console.error('Suspect the quiescence search or the evaluation weights.');
  process.exit(1);
}
if (!ladderOk) {
  console.error('\nFAIL: two adjacent tiers are within noise of each other.');
  console.error('A kid would feel that as "these levels are all the same". Re-tune the knobs between them.');
  process.exit(1);
}
console.log('\nOK');
