/**
 * Valutazione di un vano — AFU FR-M3-05, FR-M3-08, FR-M3-10, FR-M3-12, FR-M3-13.
 */
import { D, dec, out, sum, type Dec } from './decimal.js';
import { findCoveringDerogation, type DerogationContext } from './derogations.js';
import { computeOpening, type OpeningComputation } from './opening.js';
import { validateRoom } from './validation.js';
import type {
  AppliedDerogation,
  CheckId,
  CheckStatus,
  EvaluationContext,
  Note,
  Outcome,
  RatioCheck,
  RegulationProfile,
  RoomClass,
  RoomInput,
  RoomResult,
  RoomUse,
  ThresholdCheck,
  VentilationCheck,
} from './types.js';

const SERVICE_USES: ReadonlySet<RoomUse> = new Set(['BATHROOM', 'WC']);
const ACCESSORY_USES: ReadonlySet<RoomUse> = new Set([
  'LAUNDRY',
  'STORAGE',
  'WALK_IN_CLOSET',
  'HALLWAY',
  'CORRIDOR',
  'STAIRWELL',
  'TECHNICAL',
  'ATTIC_NON_HABITABLE',
  'OTHER_ACCESSORY',
]);

/** La classe deriva dalla destinazione e non è modificabile a mano (FR-M3-03). */
export function roomClassOf(use: RoomUse): RoomClass {
  if (SERVICE_USES.has(use)) return 'SERVICE';
  if (ACCESSORY_USES.has(use)) return 'ACCESSORY';
  return 'HABITABLE';
}

/** Ordine di gravità: il primo è il peggiore (usato anche per le unità). */
export const OUTCOME_SEVERITY: readonly Outcome[] = [
  'INVALID_INPUT',
  'NON_COMPLIANT',
  'INCOMPLETE',
  'SUBJECT_TO_ATTESTATION',
  'COMPLIANT',
  'NOT_REQUIRED',
];

export function worstOutcome(outcomes: readonly Outcome[]): Outcome {
  for (const candidate of OUTCOME_SEVERITY) {
    if (outcomes.includes(candidate)) return candidate;
  }
  return 'NOT_REQUIRED';
}

interface CheckState {
  appliedDerogations: AppliedDerogation[];
  notes: Note[];
  derogationCtx: DerogationContext;
  derogations: RoomInput['derogations'];
}

/** Stato di una verifica: PASSED, oppure FAILED/COVERED secondo le deroghe. */
function resolveStatus(passed: boolean, check: CheckId, state: CheckState): CheckStatus {
  if (passed) return 'PASSED';
  const covering = findCoveringDerogation(
    check,
    state.derogations ?? [],
    state.derogationCtx,
    state.notes,
  );
  if (!covering) return 'FAILED';
  state.appliedDerogations.push(covering);
  state.notes.push({
    code: 'DEROGATION_APPLIED',
    message: `Verifica ${check} coperta dalla deroga ${covering.code}.`,
  });
  return 'COVERED_BY_DEROGATION';
}

function ratioCheck(
  check: 'RAI_ILLUMINATING' | 'RAI_VENTILATING',
  total: Dec,
  computableArea: Dec,
  requiredRatio: string,
  state: CheckState,
): RatioCheck {
  const minimum = computableArea.times(requiredRatio);
  const delta = total.minus(minimum);
  return {
    check,
    status: resolveStatus(total.greaterThanOrEqualTo(minimum), check, state),
    total: out(total),
    requiredRatio: out(dec(requiredRatio)),
    minimum: out(minimum),
    delta: out(delta),
    ratio: out(total.dividedBy(computableArea).toDecimalPlaces(6)),
  };
}

function averageHeight(room: RoomInput): Dec {
  const { ceiling } = room;
  switch (ceiling.type) {
    case 'FLAT':
      return dec(ceiling.height);
    case 'SLOPED':
      return dec(ceiling.minHeight).plus(ceiling.maxHeight).dividedBy(2);
    case 'MANUAL':
      return dec(ceiling.averageHeight);
  }
}

function heightCheck(
  room: RoomInput,
  roomClass: RoomClass,
  profile: RegulationProfile,
  ctx: EvaluationContext,
  state: CheckState,
): ThresholdCheck | null {
  if (room.use === 'ATTIC_NON_HABITABLE') return null;

  const value = averageHeight(room);
  let minimum = dec(
    roomClass === 'HABITABLE' ? profile.heights.habitable : profile.heights.nonHabitable,
  );
  const { mountain } = profile.heights;
  if (roomClass === 'HABITABLE' && mountain && (ctx.altitude ?? 0) > mountain.altitudeThreshold) {
    minimum = dec(mountain.habitable);
    state.notes.push({
      code: 'MOUNTAIN_HEIGHT_APPLIED',
      message: `Comune sopra ${mountain.altitudeThreshold} m s.l.m.: altezza minima ${out(minimum)} m.`,
    });
  }

  let status: CheckStatus;
  if (value.greaterThanOrEqualTo(minimum)) {
    status = 'PASSED';
  } else if (value.lessThan(profile.heights.salvaCasaMinimum)) {
    // Sotto il limite di 2,40 m nessuna deroga "Salva Casa" è possibile; restano solo D-02/D-99.
    const nonSalvaCasa = {
      ...state,
      derogations: (state.derogations ?? []).filter((d) => d.code !== 'D-01'),
    };
    status = resolveStatus(false, 'HEIGHT', nonSalvaCasa);
  } else {
    status = resolveStatus(false, 'HEIGHT', state);
  }

  return { check: 'HEIGHT', status, value: out(value), minimum: out(minimum) };
}

function minimumAreaCheck(
  room: RoomInput,
  computableArea: Dec,
  profile: RegulationProfile,
  state: CheckState,
): ThresholdCheck | null {
  const minimums: Partial<Record<RoomUse, string>> = {
    SINGLE_BEDROOM: profile.minimumAreas.singleBedroom,
    DOUBLE_BEDROOM: profile.minimumAreas.doubleBedroom,
    LIVING_ROOM: profile.minimumAreas.livingRoom,
  };
  const minimum = minimums[room.use];
  if (minimum === undefined) return null;
  return {
    check: 'MIN_AREA',
    status: resolveStatus(computableArea.greaterThanOrEqualTo(minimum), 'MIN_AREA', state),
    value: out(computableArea),
    minimum: out(dec(minimum)),
  };
}

function ventilationCheck(
  room: RoomInput,
  openings: readonly OpeningComputation[],
  state: CheckState,
): VentilationCheck {
  const hasOpenable = openings.some((o) => o.ventilatingArea.greaterThan(0));
  const hasMechanical = (room.mechanicalVentilation ?? 'NONE') !== 'NONE';
  const via = hasOpenable ? 'OPENING' : hasMechanical ? 'MECHANICAL' : 'NONE';
  return {
    check: 'VENTILATION',
    status: resolveStatus(via !== 'NONE', 'VENTILATION', state),
    via,
  };
}

/** Soglie del sottotetto se l'unità è un sottotetto e le aperture in falda prevalgono (EC-10). */
function selectRatios(
  profile: RegulationProfile,
  ctx: EvaluationContext,
  openings: readonly OpeningComputation[],
  illuminatingTotal: Dec,
  notes: Note[],
) {
  const { attic, standard, atticRoofShareThreshold } = profile.ratios;
  if (!ctx.isAttic || !attic || illuminatingTotal.isZero()) return standard;
  const roofShare = sum(
    openings.filter((o) => o.isRoofOpening).map((o) => o.illuminatingArea),
  ).dividedBy(illuminatingTotal);
  if (roofShare.lessThan(atticRoofShareThreshold)) return standard;
  notes.push({
    code: 'ATTIC_RATIO_APPLIED',
    message:
      'Sottotetto con aperture prevalentemente in falda: applicate le soglie del sottotetto.',
  });
  return attic;
}

function emptyResult(room: RoomInput, profile: RegulationProfile): RoomResult {
  return {
    roomId: room.id,
    roomClass: roomClassOf(room.use),
    raiRequired: profile.raiRequiredUses.includes(room.use),
    computableArea: '0',
    openings: [],
    illuminating: null,
    ventilating: null,
    height: null,
    minimumArea: null,
    ventilation: null,
    appliedDerogations: [],
    outcome: 'INVALID_INPUT',
    issues: [],
    notes: [],
    profile: { id: profile.id, version: profile.version },
  };
}

export function evaluateRoom(
  room: RoomInput,
  profile: RegulationProfile,
  ctx: EvaluationContext = {},
): RoomResult {
  const issues = validateRoom(room);
  if (issues.length > 0) {
    return { ...emptyResult(room, profile), issues };
  }

  const notes: Note[] = [];
  const state: CheckState = {
    appliedDerogations: [],
    notes,
    derogations: room.derogations,
    derogationCtx: { profile, mechanicalVentilation: room.mechanicalVentilation ?? 'NONE' },
  };

  const roomClass = roomClassOf(room.use);
  const raiRequired = profile.raiRequiredUses.includes(room.use);
  const ventilationRequired = profile.ventilationRequiredUses.includes(room.use);
  const computableArea = dec(room.floorArea).minus(room.nonComputableArea ?? '0');

  const openings = room.openings.map((o) => computeOpening(o, profile, notes));
  const illuminatingTotal = sum(openings.map((o) => o.illuminatingArea));
  const ventilatingTotal = sum(openings.map((o) => o.ventilatingArea));

  if (illuminatingTotal.greaterThan(computableArea.times(2))) {
    notes.push({
      code: 'UNUSUALLY_HIGH_VALUES',
      message:
        'Superficie finestrata insolitamente alta rispetto al vano: verifica le unità di misura.',
    });
  }

  let incomplete = false;
  let illuminating: RatioCheck | null = null;
  let ventilating: RatioCheck | null = null;

  if (raiRequired) {
    const missingOpenings = room.openings.length === 0 && !room.isWindowless;
    if (missingOpenings) {
      incomplete = true;
      notes.push({
        code: 'MISSING_OPENINGS',
        message: 'Vano abitabile senza aperture: inserisci le aperture o segnalo come vano cieco.',
      });
    } else {
      if (room.isWindowless) {
        notes.push({
          code: 'WINDOWLESS_HABITABLE_ROOM',
          message:
            "Vano abitabile cieco: l'art. 5 del D.M. 1975 richiede illuminazione naturale diretta.",
        });
      }
      const ratios = selectRatios(profile, ctx, openings, illuminatingTotal, notes);
      if (profile.checks.illuminating) {
        illuminating = ratioCheck(
          'RAI_ILLUMINATING',
          illuminatingTotal,
          computableArea,
          ratios.illuminating,
          state,
        );
      }
      if (profile.checks.ventilating) {
        ventilating = ratioCheck(
          'RAI_VENTILATING',
          ventilatingTotal,
          computableArea,
          ratios.ventilating,
          state,
        );
      }
    }
  }

  const height = heightCheck(room, roomClass, profile, ctx, state);
  const minimumArea = minimumAreaCheck(room, computableArea, profile, state);
  const ventilation = ventilationRequired ? ventilationCheck(room, openings, state) : null;

  const statuses = [illuminating, ventilating, height, minimumArea, ventilation]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => c.status);

  let outcome: Outcome;
  if (statuses.includes('FAILED')) {
    outcome = 'NON_COMPLIANT';
  } else if (incomplete) {
    outcome = 'INCOMPLETE';
  } else if (statuses.includes('COVERED_BY_DEROGATION')) {
    outcome = 'SUBJECT_TO_ATTESTATION';
  } else if (!raiRequired && !ventilationRequired) {
    outcome = 'NOT_REQUIRED';
  } else {
    outcome = 'COMPLIANT';
  }

  return {
    roomId: room.id,
    roomClass,
    raiRequired,
    computableArea: out(computableArea),
    openings: openings.map((o) => ({
      id: o.id,
      label: o.label,
      isRoofOpening: o.isRoofOpening,
      grossArea: out(o.grossArea),
      illuminatingHeight: out(o.illuminatingHeight),
      illuminatingArea: out(o.illuminatingArea),
      ventilatingArea: out(o.ventilatingArea),
    })),
    illuminating,
    ventilating,
    height,
    minimumArea,
    ventilation,
    appliedDerogations: state.appliedDerogations,
    outcome,
    issues: [],
    notes,
    profile: { id: profile.id, version: profile.version },
  };
}

/** Utility interna esportata per le unità: somma di stringhe decimali. */
export function sumDecimals(values: readonly string[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), new D(0));
}
