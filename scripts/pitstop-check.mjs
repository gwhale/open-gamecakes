// Cakey Pit Stop — damage model + difficulty curve self-check.
//
//   node scripts/pitstop-check.mjs
//
// `src/lib/games/three/pitstop/damage.ts` imports nothing, so node's type
// stripping loads it directly. If it grows an import this stops running, which
// is the intended alarm.
//
// Two classes of assertion here:
//
//   1. SOLVABILITY — walked, not reasoned about. A car always has something to
//      do, never more mandatory work than the cap, and always banks within two
//      visits. These are the promises that stop a five-year-old getting stuck
//      or spiralling.
//
//   2. THE DIFFICULTY CURVE, AS ARITHMETIC. This is the important one. The whole
//      redesign rests on the claim that skipping work is a real decision — and
//      that claim is false unless some difficulty actually makes fixing
//      everything impossible. Asserting it here means a tuning change that
//      quietly turns the strategy into decoration fails the check instead of
//      shipping.

import assert from 'node:assert/strict';
import {
  JOB_ORDER, JOBS, NO_DAMAGE, TUNING, CAR_LIVERIES,
  createDamageGenerator, escalate, canLeave, countState,
  workMsFor, fullFixMs, puntMs, carsForRound, starsForRun, parCars,
  resolvePitStopTuning,
} from '../src/lib/games/three/pitstop/damage.ts';

const DIFFS = ['easy', 'medium', 'hard'];
/** Deterministic RNG so any failure is reproducible from its seed. */
const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- roster ----
assert.equal(JOB_ORDER.length, 4);
assert.equal(new Set(JOB_ORDER).size, 4, 'job kinds must be distinct');
for (const k of JOB_ORDER) {
  assert.ok(JOBS[k], `${k} missing from JOBS`);
  assert.ok(JOBS[k].label && JOBS[k].glyph, `${k} needs a label + glyph`);
  assert.ok(JOBS[k].workMs > 0);
}
// The jack is GONE as a question — it implied an ordering dependency, and
// dependencies poison free-choice tapping.
assert.ok(!JOB_ORDER.includes('jack'), 'the jack must not be a job any more');

// ---- liveries: now load-bearing identity for returning cars ----
assert.ok(CAR_LIVERIES.length >= 8, 'need 8+ liveries so in-lane cars never share one');
assert.equal(new Set(CAR_LIVERIES.map((l) => l.body)).size, CAR_LIVERIES.length,
  'livery bodies must be distinct — this is how a kid recognises a returned car');

// ---- generation: solvable by construction ----
for (const diff of DIFFS) {
  const tuning = TUNING[diff];
  for (let seed = 0; seed < 300; seed++) {
    const gen = createDamageGenerator(diff, tuning, mulberry(seed * 7919));
    let prevKey = null;
    for (let car = 0; car < 25; car++) {
      const d = gen.roll(car);
      const damaged = JOB_ORDER.filter((k) => d[k] !== 'ok').length;

      // G1 — never a blank car.
      assert.ok(damaged >= 1 && damaged <= 4,
        `[${diff} seed${seed} car${car}] ${damaged} damaged jobs`);
      // G2 — mandatory work is capped, so a cheap punt always exists.
      assert.ok(countState(d, 'broken') <= tuning.maxBroken,
        `[${diff} seed${seed} car${car}] ${countState(d, 'broken')} broken > cap ${tuning.maxBroken}`);
      // G3 — easy never shows two red tyres at once, and has no optional work.
      if (diff === 'easy') {
        assert.ok(!(d['tyre-front'] === 'broken' && d['tyre-rear'] === 'broken'),
          `[easy seed${seed} car${car}] two red tyres is the one ambiguous read`);
        assert.equal(countState(d, 'worn'), 0,
          `[easy seed${seed} car${car}] easy must have no optional work`);
      }
      // G4 — consecutive cars must not look identical.
      const key = JOB_ORDER.map((k) => d[k][0]).join('');
      if (car > 3 && prevKey !== null) {
        assert.notEqual(key, prevKey, `[${diff} seed${seed} car${car}] repeated pattern ${key}`);
      }
      prevKey = key;

      // ---- the two-visit promise, WALKED ----
      let cur = d;
      let visits = 1;
      for (const k of JOB_ORDER) if (cur[k] === 'broken') cur = { ...cur, [k]: 'ok' };
      assert.ok(canLeave(cur), 'fixing every red must always allow departure');
      if (countState(cur, 'worn') > 0) {
        cur = escalate(cur);
        visits += 1;
        assert.equal(countState(cur, 'worn'), 0, 'escalate must leave no amber');
        for (const k of JOB_ORDER) if (cur[k] === 'broken') cur = { ...cur, [k]: 'ok' };
      }
      assert.ok(visits <= 2,
        `[${diff} seed${seed} car${car}] needed ${visits} visits — punting must defer, never forfeit`);
      assert.ok(canLeave(cur));
    }
  }
}

// ---- escalate is idempotent and narrow ----
{
  const d = { ...NO_DAMAGE, engine: 'worn', syrup: 'broken' };
  const once = escalate(d);
  assert.deepEqual(once, escalate(once), 'escalate must be idempotent');
  assert.equal(countState(once, 'worn'), 0);
  assert.equal(once.syrup, 'broken', 'escalate must not touch already-red jobs');
  assert.equal(once['tyre-front'], 'ok', 'escalate must NEVER add new damage');
}

// ---- canLeave ----
assert.ok(canLeave(NO_DAMAGE));
assert.ok(canLeave({ ...NO_DAMAGE, syrup: 'worn' }), 'amber alone must not block departure');
assert.ok(!canLeave({ ...NO_DAMAGE, syrup: 'broken' }), 'red must block departure');

// ---- work time ----
for (const diff of DIFFS) {
  const t = TUNING[diff];
  for (const k of JOB_ORDER) {
    const clean = workMsFor(k, t, 0);
    assert.ok(workMsFor(k, t, 1) > clean, 'a wrong answer must cost time');
    assert.equal(workMsFor(k, t, 1) - clean, t.penaltyMs, 'penalty must be exactly one unit');
  }
  assert.ok(t.queueCap >= 2, 'need a slot reserved for a returning car');
}

// ---- THE DIFFICULTY CURVE ----
const avgCar = (diff) => {
  const d = { ...NO_DAMAGE };
  if (diff === 'easy') d.engine = 'broken';
  else if (diff === 'medium') { d.engine = 'broken'; d['tyre-front'] = 'worn'; }
  else { d.engine = 'broken'; d['tyre-front'] = 'worn'; d.syrup = 'worn'; }
  return d;
};
const worstCar = (diff) => {
  const t = TUNING[diff];
  const d = { ...NO_DAMAGE };
  let reds = t.maxBroken;
  for (const k of JOB_ORDER) d[k] = reds-- > 0 ? 'broken' : 'worn';
  return d;
};

// The pressure in this game comes from ARRIVAL CADENCE, not from round length:
// cars queue up while you work. So the curve is asserted against `arrivalMs`,
// which is the mechanism, rather than against the round, which is only the
// duration. (Asserting worst-car-every-car against the round was the first cut
// and it was meaningless — no shift is 100% worst cars, and an overfull queue
// is not a loss state anyway, just fewer cars banked.)
const ROUNDS = [60000, 120000, 180000];
const report = [];
for (const diff of DIFFS) {
  const t = TUNING[diff];
  const avg = avgCar(diff);
  const worst = worstCar(diff);
  const fullMs = fullFixMs(avg, t);
  const punt = puntMs(avg, t);

  // DIGGABLE: punting the average car is always faster than the next arrival,
  // so a kid who punts can always stop the queue growing. This is the promise
  // that there is no unrecoverable state.
  assert.ok(punt < t.arrivalMs,
    `[${diff}] punting takes ${(punt / 1000).toFixed(1)}s but a car arrives every ${(t.arrivalMs / 1000).toFixed(1)}s — punting must always keep pace`);
  // Even the worst car must not take more than two arrival gaps to punt.
  assert.ok(puntMs(worst, t) < t.arrivalMs * 2,
    `[${diff}] the worst car takes ${(puntMs(worst, t) / 1000).toFixed(1)}s to punt vs a ${(t.arrivalMs / 1000).toFixed(1)}s cadence`);

  if (diff === 'easy') {
    // NEVER PRESSURED: on easy, doing every job still keeps pace. The youngest
    // can be thorough and calm and never fall behind.
    assert.ok(fullMs < t.arrivalMs,
      `[easy] full-fix ${(fullMs / 1000).toFixed(1)}s vs ${(t.arrivalMs / 1000).toFixed(1)}s cadence — easy must never pressure`);
  }
  if (diff === 'medium') {
    // Careful play roughly keeps pace — a little behind, recoverable.
    assert.ok(fullMs < t.arrivalMs * 1.15,
      `[medium] full-fix ${(fullMs / 1000).toFixed(1)}s is too far past the ${(t.arrivalMs / 1000).toFixed(1)}s cadence`);
  }
  if (diff === 'hard') {
    // THE headline assertion. Fixing everything CANNOT keep pace, so punting is
    // forced. Without this the strategy layer is decorative and no kid ever
    // discovers it.
    assert.ok(fullMs > t.arrivalMs,
      `[hard] full-fix ${(fullMs / 1000).toFixed(1)}s fits inside the ${(t.arrivalMs / 1000).toFixed(1)}s cadence — hard MUST make punting necessary`);
  }

  for (const roundMs of ROUNDS) {
    const cars = carsForRound(t, roundMs);
    assert.ok(cars >= 3, `[${diff} ${roundMs / 1000}s] shift of ${cars} is too short to teach anything`);
  }
  report.push(`   ${diff.padEnd(7)} arrive ${(t.arrivalMs / 1000).toFixed(0)}s · full-fix ${(fullMs / 1000).toFixed(1)}s · punt ${(punt / 1000).toFixed(1)}s · ${carsForRound(t, 120000)} cars/2min`);
}

// ---- stars ----
for (const budget of [6, 9, 11, 13, 16]) {
  const par = parCars(budget);
  assert.ok(par >= 1 && par < budget, `par ${par} out of range for budget ${budget}`);
  assert.equal(starsForRun(budget, budget), 3, 'a complete shift is 3 stars');
  assert.equal(starsForRun(0, budget), 0);
  let prev = -1;
  for (let b = 0; b <= budget; b++) {
    const s = starsForRun(b, budget);
    assert.ok(s >= prev, `stars must not fall as more cars bank (budget ${budget}, at ${b})`);
    prev = s;
  }
}

// ---- tuning ----
assert.deepEqual(resolvePitStopTuning(), TUNING.medium, 'medium is the default');
assert.equal(TUNING.easy.brokenChance, 1, 'easy must have NO optional work — strategy layer off');
assert.equal(TUNING.easy.returns, false, 'easy must never send a car back');
assert.ok(TUNING.hard.returns, 'hard is where the consequence lives');
assert.ok(TUNING.easy.arrivalMs > TUNING.hard.arrivalMs, 'easy must be calmer');

console.log(`✅ pit stop check passed
   jobs       ${JOB_ORDER.join(' · ')}   (no jack — it implied an ordering dependency)
   states     ok · worn (amber, optional) · broken (red, mandatory)
   promise    every car banks in ≤2 visits — punting defers, never forfeits
${report.join('\n')}
   curve      easy never pressures · medium rewards care · hard forces the choice`);
