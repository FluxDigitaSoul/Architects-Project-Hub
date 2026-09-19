import { describe, expect, it } from 'vitest';
import { isValidProjectCodePattern, nextProjectCode } from '../src/project-code.js';

const in2026 = new Date('2026-09-18T10:00:00Z');
const in2027 = new Date('2027-01-05T10:00:00Z');

describe('nextProjectCode (AC-FR-M0-11-1)', () => {
  it('proposes the next number within the same year', () => {
    expect(nextProjectCode('{YYYY}-{NNN}', ['2026-013', '2026-014', '2025-090'], in2026)).toBe('2026-015');
  });

  it('restarts from 001 in a new year', () => {
    expect(nextProjectCode('{YYYY}-{NNN}', ['2026-014'], in2027)).toBe('2027-001');
  });

  it('starts from 001 with no previous codes', () => {
    expect(nextProjectCode('{YYYY}-{NNN}', [], in2026)).toBe('2026-001');
  });

  it('ignores codes typed by hand that do not match the pattern', () => {
    expect(nextProjectCode('{YYYY}-{NNN}', ['VILLA-ROSSI', '2026-7', '2026-002'], in2026)).toBe('2026-008');
  });

  it('supports custom patterns with prefix and short year', () => {
    expect(nextProjectCode('C{YY}/{NN}', ['C26/09', 'c26/10'], in2026)).toBe('C26/11');
  });

  it('falls back to the default pattern when the tenant pattern is invalid', () => {
    expect(isValidProjectCodePattern('{YYYY}-{XX}')).toBe(false);
    expect(nextProjectCode('{YYYY}-{XX}', [], in2026)).toBe('2026-001');
  });
});
