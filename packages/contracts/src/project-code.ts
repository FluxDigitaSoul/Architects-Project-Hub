/**
 * Codice progressivo della commessa secondo il pattern del tenant (FR-M0-11, AC-FR-M0-11-1).
 * Segnaposto: {YYYY} anno a 4 cifre, {YY} anno a 2 cifre, {N…N} progressivo con zeri (la
 * lunghezza dei N fissa le cifre minime). Il progressivo riparte da 1 quando cambia l'anno,
 * perché i codici di anni diversi hanno un prefisso diverso.
 * Esempio: pattern "{YYYY}-{NNN}", ultimo codice 2026 "2026-014" → "2026-015"; primo 2027 → "2027-001".
 */
export const DEFAULT_PROJECT_CODE_PATTERN = '{YYYY}-{NNN}';

const SEQ_TOKEN = /\{(N+)\}/;

export function isValidProjectCodePattern(pattern: string): boolean {
  const seq = pattern.match(new RegExp(SEQ_TOKEN.source, 'g'));
  return pattern.length <= 30 && seq?.length === 1 && !/[{}]/.test(pattern.replace(/\{(YYYY|YY|N+)\}/g, ''));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nextProjectCode(pattern: string, existingCodes: readonly string[], now: Date): string {
  const effective = isValidProjectCodePattern(pattern) ? pattern : DEFAULT_PROJECT_CODE_PATTERN;
  const year = now.getFullYear().toString();
  const withYear = effective.replace('{YYYY}', year).replace('{YY}', year.slice(2));
  const match = withYear.match(SEQ_TOKEN);
  if (!match || match.index === undefined) return withYear;

  const digits = match[1]?.length ?? 3;
  const before = withYear.slice(0, match.index);
  const after = withYear.slice(match.index + match[0].length);
  const regex = new RegExp(`^${escapeRegExp(before)}(\\d+)${escapeRegExp(after)}$`, 'i');

  const max = existingCodes.reduce((acc, code) => {
    const m = code.match(regex);
    return m?.[1] ? Math.max(acc, Number.parseInt(m[1], 10)) : acc;
  }, 0);
  return `${before}${String(max + 1).padStart(digits, '0')}${after}`;
}
