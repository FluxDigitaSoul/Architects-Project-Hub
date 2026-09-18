/**
 * @aph/rai-engine — motore di calcolo R.A.I. e requisiti igienico-sanitari (ADR-010).
 * API pubblica: valutazione di vani e unità, validazione, profili di sistema, formattazione.
 */
export * from './types.js';
export { evaluateRoom, roomClassOf, worstOutcome, OUTCOME_SEVERITY } from './room.js';
export { evaluateUnit, type UnitInput, type UnitResult, type UnitType } from './unit.js';
export { validateRoom } from './validation.js';
export { MIN_JUSTIFICATION_LENGTH } from './derogations.js';
export {
  NATIONAL_DM_1975,
  NATIONAL_SALVA_CASA,
  LOCAL_REGULATION_TEMPLATE,
  SYSTEM_PROFILES,
} from './profiles.js';
export { formatDecimalIt, ratioAsFraction } from './decimal.js';
