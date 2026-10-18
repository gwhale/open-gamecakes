-- One-off: translate stored kid_skills tiers from the OLD hand-rolled ladder
-- to the catalog scale, 2026-09-03.
--
-- WHY THIS IS NOT OPTIONAL
--
-- generate-challenge.ts was re-pointed at the skills catalog's tier scale (see
-- that file's header, and PR #292). The integers in kid_skills.current_tier were
-- earned against the OLD meaning, and the new meaning is harder at every rung
-- above 5. Leaving them alone silently promotes both kids:
--
--   a grade 1 kid on counting-to-20, tier 10, 148 attempts, 95% mastery
--   a grade 3 kid on add-within-20,   tier 10, 262 attempts, 95% mastery
--
-- Old tier 10 was "mixed of tiers 6-9" — double-digit add/sub and single-digit
-- multiplication. New tier 10 is a mix of 7-9: multiply and divide within 100,
-- three-digit by one-digit multiplication, long division. A first grader at 95%
-- on times tables would have opened their next session on long division and lost.
--
-- The adaptive engine WOULD walk them back down, one tier per bad window — but
-- that is several deliberately-failed sessions to fix a units error we
-- introduced. Translating once and letting the engine take over from a true
-- starting point is the same destination without the losing streak.
--
-- WHAT THE MAPPING PRESERVES
--
-- Content, not the number. Each kid keeps the questions they were actually
-- answering. Mastery windows are untouched, so the engine's next decision uses
-- the evidence it already had.
--
--   old  meaning (old ladder)      new  meaning (catalog scale)
--   ---  -------------------       ---  --------------------------------
--    1   a+1 / a+2, up to 12        2   add & subtract within 10
--    2   add within 10              2   add & subtract within 10
--    3   add within 20              3   add & subtract within 20
--    4   subtract within 10         2   add & subtract within 10
--    5   subtract within 20         3   add & subtract within 20
--    6   add, double-digit          5   add & subtract within 100
--    7   subtract, double-digit     5   add & subtract within 100
--    8   multiply 2-5               6   multiply within 25
--    9   multiply 2-9               7   multiply & divide within 100
--   10   mixed 6-9                  7   multiply & divide within 100
--
-- Old tiers 1 and 4 map UP, not down: the old ladder taught subtraction as a
-- separate later rung, and the catalog scale interleaves it from tier 2 the way
-- K.OA.A.2 and 1.OA.C.6 do.
--
-- MATH ONLY. The reading ladder did not change.
--
-- Rows with zero attempts are skipped — a default tier is not evidence, and
-- moving it would just be noise in the audit.
--
-- Applied once to the founding deployment on 2026-09-03, via the Management API.
-- Kept here as the record of exactly what ran, and as the explanation of why the
-- tier numbers in an older database mean something different.
--
-- DO NOT RUN THIS unless you have tiers that predate the catalog-scale change.
-- It is not idempotent — a second pass would remap already-remapped values — and
-- a fresh install has nothing to translate. That is why it is a dated one-off in
-- scripts/admin/ rather than a migration.

update kid_skills ks
set current_tier = r.new_tier
from (values
  (1, 2), (2, 2), (3, 3), (4, 2), (5, 3),
  (6, 5), (7, 5), (8, 6), (9, 7), (10, 7)
) as r(old_tier, new_tier)
where r.old_tier = ks.current_tier
  and ks.total_attempts > 0
  and ks.skill_id in (select id from skills where subject = 'math');
