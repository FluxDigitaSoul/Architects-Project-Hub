/**
 * Verifiche d'insieme dell'unità immobiliare — AFU FR-M3-14 (art. 2 e art. 3 D.M. 1975,
 * deroga D-01 per le monostanze).
 */
import { dec, out } from './decimal.js';
import { findCoveringDerogation } from './derogations.js';
import { evaluateRoom, sumDecimals, worstOutcome } from './room.js';
import type {
  AppliedDerogation,
  CheckStatus,
  DerogationInput,
  EvaluationContext,
  Note,
  Outcome,
  RegulationProfile,
  RoomInput,
  RoomResult,
  ThresholdCheck,
} from './types.js';

export type UnitType = 'DWELLING' | 'STUDIO_APARTMENT' | 'OTHER';

export interface UnitInput {
  id: string;
  unitType: UnitType;
  occupants?: number;
  isAttic?: boolean;
  rooms: RoomInput[];
  derogations?: DerogationInput[];
}

export interface UnitResult {
  unitId: string;
  rooms: RoomResult[];
  totals: { computableArea: string; illuminatingArea: string; ventilatingArea: string };
  studioApartment: ThresholdCheck | null;
  occupancy: ThresholdCheck | null;
  appliedDerogations: AppliedDerogation[];
  counts: Record<Outcome, number>;
  outcome: Outcome;
  notes: Note[];
}

function countOutcomes(rooms: readonly RoomResult[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = {
    COMPLIANT: 0,
    NON_COMPLIANT: 0,
    SUBJECT_TO_ATTESTATION: 0,
    INCOMPLETE: 0,
    NOT_REQUIRED: 0,
    INVALID_INPUT: 0,
  };
  for (const room of rooms) counts[room.outcome] += 1;
  return counts;
}

export function evaluateUnit(
  unit: UnitInput,
  profile: RegulationProfile,
  ctx: EvaluationContext = {},
): UnitResult {
  const roomCtx: EvaluationContext = { ...ctx, isAttic: unit.isAttic ?? ctx.isAttic ?? false };
  const rooms = unit.rooms.map((room) => evaluateRoom(room, profile, roomCtx));
  const validRooms = rooms.filter((r) => r.outcome !== 'INVALID_INPUT');

  const totals = {
    computableArea: out(sumDecimals(validRooms.map((r) => r.computableArea))),
    illuminatingArea: out(sumDecimals(validRooms.map((r) => r.illuminating?.total ?? '0'))),
    ventilatingArea: out(sumDecimals(validRooms.map((r) => r.ventilating?.total ?? '0'))),
  };

  const notes: Note[] = [];
  const appliedDerogations: AppliedDerogation[] = [];
  const derogationCtx = { profile, mechanicalVentilation: 'NONE' as const };

  const resolve = (
    passed: boolean,
    check: 'STUDIO_APARTMENT_AREA' | 'OCCUPANCY_AREA',
  ): CheckStatus => {
    if (passed) return 'PASSED';
    const covering = findCoveringDerogation(check, unit.derogations ?? [], derogationCtx, notes);
    if (!covering) return 'FAILED';
    appliedDerogations.push(covering);
    return 'COVERED_BY_DEROGATION';
  };

  // Art. 3 D.M. 1975 / art. 24 c. 5-bis DPR 380/2001: monostanza (1 o 2 persone).
  let studioApartment: ThresholdCheck | null = null;
  if (unit.unitType === 'STUDIO_APARTMENT') {
    const twoPersons = (unit.occupants ?? 1) >= 2;
    const value = dec(totals.computableArea);
    const standardMin = dec(
      twoPersons ? profile.studioApartment.twoPersons : profile.studioApartment.onePerson,
    );
    const salvaCasaMin = dec(
      twoPersons
        ? profile.studioApartment.salvaCasaTwoPersons
        : profile.studioApartment.salvaCasaOnePerson,
    );
    if (value.greaterThanOrEqualTo(standardMin)) {
      studioApartment = {
        check: 'STUDIO_APARTMENT_AREA',
        status: 'PASSED',
        value: out(value),
        minimum: out(standardMin),
      };
    } else {
      // Con D-01 il minimo diventa quello "Salva Casa"; sotto di esso la deroga non basta.
      const status = value.greaterThanOrEqualTo(salvaCasaMin)
        ? resolve(false, 'STUDIO_APARTMENT_AREA')
        : 'FAILED';
      const minimum = status === 'COVERED_BY_DEROGATION' ? salvaCasaMin : standardMin;
      studioApartment = {
        check: 'STUDIO_APARTMENT_AREA',
        status,
        value: out(value),
        minimum: out(minimum),
      };
    }
  }

  // Art. 2 D.M. 1975: 14 mq per abitante per i primi 4, 10 mq per ciascuno dei successivi.
  let occupancy: ThresholdCheck | null = null;
  if (unit.unitType === 'DWELLING' && unit.occupants !== undefined && unit.occupants > 0) {
    const habitableArea = sumDecimals(
      validRooms.filter((r) => r.roomClass === 'HABITABLE').map((r) => r.computableArea),
    );
    const firstFour = Math.min(unit.occupants, 4);
    const additional = Math.max(unit.occupants - 4, 0);
    const minimum = dec(profile.perInhabitant.firstFour)
      .times(firstFour)
      .plus(dec(profile.perInhabitant.additional).times(additional));
    occupancy = {
      check: 'OCCUPANCY_AREA',
      status: resolve(habitableArea.greaterThanOrEqualTo(minimum), 'OCCUPANCY_AREA'),
      value: out(habitableArea),
      minimum: out(minimum),
    };
  }

  const unitOutcomes: Outcome[] = [studioApartment, occupancy]
    .filter((c): c is ThresholdCheck => c !== null)
    .map((c) =>
      c.status === 'FAILED'
        ? 'NON_COMPLIANT'
        : c.status === 'COVERED_BY_DEROGATION'
          ? 'SUBJECT_TO_ATTESTATION'
          : 'COMPLIANT',
    );

  return {
    unitId: unit.id,
    rooms,
    totals,
    studioApartment,
    occupancy,
    appliedDerogations: [...rooms.flatMap((r) => r.appliedDerogations), ...appliedDerogations],
    counts: countOutcomes(rooms),
    outcome: worstOutcome([...rooms.map((r) => r.outcome), ...unitOutcomes]),
    notes,
  };
}
