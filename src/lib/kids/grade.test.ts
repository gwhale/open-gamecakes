import { describe, it, expect } from 'vitest';
import { schoolYearOf, currentGrade, currentGradeOf } from './grade';

const at = (iso: string) => new Date(iso);

describe('schoolYearOf', () => {
  it('names a school year by its start year', () => {
    expect(schoolYearOf(at('2026-08-01T00:00:00Z'))).toBe(2026);
    expect(schoolYearOf(at('2026-12-25T00:00:00Z'))).toBe(2026);
    expect(schoolYearOf(at('2027-07-31T23:59:59Z'))).toBe(2026);
  });

  it('rolls over on 1 August, not 1 January', () => {
    expect(schoolYearOf(at('2026-07-31T23:59:59Z'))).toBe(2025);
    expect(schoolYearOf(at('2026-08-01T00:00:00Z'))).toBe(2026);
  });
});

describe('currentGrade', () => {
  it('returns the asserted grade during its own school year', () => {
    expect(currentGrade(3, 2026, at('2026-08-28T00:00:00Z'))).toBe(3);
    expect(currentGrade(1, 2026, at('2027-05-01T00:00:00Z'))).toBe(1);
  });

  it('advances by one each August', () => {
    expect(currentGrade(3, 2026, at('2027-08-01T00:00:00Z'))).toBe(4);
    expect(currentGrade(3, 2026, at('2028-08-01T00:00:00Z'))).toBe(5);
    expect(currentGrade(1, 2026, at('2029-09-15T00:00:00Z'))).toBe(4);
  });

  it('reproduces the real staleness this fixes', () => {
    // 0015 asserted grades 2 and 0 for school year 2025.
    // On 2026-08-28 those kids are in 3rd and 1st - confirmed by the parent.
    expect(currentGrade(2, 2025, at('2026-08-28T00:00:00Z'))).toBe(3);
    expect(currentGrade(0, 2025, at('2026-08-28T00:00:00Z'))).toBe(1);
  });

  it('clamps to the 0..12 range kids.grade is checked against', () => {
    expect(currentGrade(11, 2026, at('2030-08-01T00:00:00Z'))).toBe(12);
    expect(currentGrade(2, 2030, at('2026-08-01T00:00:00Z'))).toBe(0);
  });

  it('treats a null grade as unknown rather than zero', () => {
    expect(currentGrade(null, 2026, at('2030-08-01T00:00:00Z'))).toBeNull();
    expect(currentGrade(undefined, 2026, at('2030-08-01T00:00:00Z'))).toBeNull();
  });

  it('trusts an unanchored grade instead of guessing', () => {
    expect(currentGrade(3, null, at('2030-08-01T00:00:00Z'))).toBe(3);
  });
});

describe('currentGradeOf', () => {
  it('reads a supabase-shaped row', () => {
    expect(currentGradeOf({ grade: 3, grade_year: 2026 }, at('2027-08-01T00:00:00Z'))).toBe(4);
  });

  it('survives the null row a failed query returns', () => {
    expect(currentGradeOf(null, at('2027-08-01T00:00:00Z'))).toBeNull();
    expect(currentGradeOf(undefined, at('2027-08-01T00:00:00Z'))).toBeNull();
  });
});
