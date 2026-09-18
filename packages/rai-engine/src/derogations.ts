/**
 * Applicazione delle deroghe — AFU FR-M3-12, BR-06.
 * Una deroga copre una verifica fallita solo se: è ammessa dal profilo, la regola del
 * profilo copre quella verifica, la motivazione è sufficiente e, se richiesto,
 * sono soddisfatte le condizioni tecniche (es. ventilazione meccanica per D-03).
 */
import type {
  AppliedDerogation,
  CheckId,
  DerogationInput,
  MechanicalVentilation,
  Note,
  RegulationProfile,
} from './types.js';

export const MIN_JUSTIFICATION_LENGTH = 50;

export interface DerogationContext {
  profile: RegulationProfile;
  mechanicalVentilation: MechanicalVentilation;
}

export interface DerogationMatch {
  applied: AppliedDerogation;
}

/** Cerca la prima deroga valida che copre la verifica. Registra nelle note quelle scartate. */
export function findCoveringDerogation(
  check: CheckId,
  derogations: readonly DerogationInput[],
  ctx: DerogationContext,
  notes: Note[],
): AppliedDerogation | null {
  for (const derogation of derogations) {
    if (!derogation.covers.includes(check)) {
      continue;
    }
    const reason = rejectionReason(check, derogation, ctx);
    if (reason) {
      notes.push({
        code: 'DEROGATION_IGNORED',
        message: `Deroga ${derogation.code} non applicata a ${check}: ${reason}`,
      });
      continue;
    }
    const rule = ctx.profile.allowedDerogations.find((r) => r.code === derogation.code);
    return {
      code: derogation.code,
      check,
      justification: derogation.justification,
      legalReference: derogation.legalReference ?? rule?.legalReference ?? '',
    };
  }
  return null;
}

function rejectionReason(
  check: CheckId,
  derogation: DerogationInput,
  ctx: DerogationContext,
): string | null {
  const rule = ctx.profile.allowedDerogations.find((r) => r.code === derogation.code);
  if (!rule) {
    return 'non prevista dal profilo normativo.';
  }
  if (!rule.covers.includes(check)) {
    return 'la deroga non riguarda questa verifica.';
  }
  if (derogation.justification.trim().length < MIN_JUSTIFICATION_LENGTH) {
    return `motivazione troppo breve (minimo ${MIN_JUSTIFICATION_LENGTH} caratteri).`;
  }
  if (derogation.code === 'D-99' && !derogation.legalReference?.trim()) {
    return 'serve il riferimento normativo.';
  }
  if (rule.requiresMechanicalVentilation && ctx.mechanicalVentilation === 'NONE') {
    return 'richiede un impianto di ventilazione meccanica.';
  }
  return null;
}
