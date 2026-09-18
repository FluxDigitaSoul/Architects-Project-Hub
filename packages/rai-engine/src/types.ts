/**
 * Tipi del motore R.A.I. — AFU cap. 5.3 (FR-M3-*), glossario cap. 3.3.
 * Tutti i valori dimensionali sono stringhe decimali in metri / metri quadrati (ADR-010).
 */

/** Numero decimale come stringa, es. "2.70". Mai `number` per non perdere precisione. */
export type DecimalString = string;

// ---------------------------------------------------------------------------
// Vani
// ---------------------------------------------------------------------------

export const ROOM_USES = [
  // abitabili
  'LIVING_ROOM',
  'SINGLE_BEDROOM',
  'DOUBLE_BEDROOM',
  'KITCHEN',
  'LIVING_WITH_KITCHENETTE',
  'DINING',
  'STUDY',
  'STUDIO_ROOM',
  'OTHER_HABITABLE',
  // servizi
  'BATHROOM',
  'WC',
  // accessori
  'LAUNDRY',
  'STORAGE',
  'WALK_IN_CLOSET',
  'HALLWAY',
  'CORRIDOR',
  'STAIRWELL',
  'TECHNICAL',
  'ATTIC_NON_HABITABLE',
  'OTHER_ACCESSORY',
] as const;
export type RoomUse = (typeof ROOM_USES)[number];

export type RoomClass = 'HABITABLE' | 'SERVICE' | 'ACCESSORY';

export type MechanicalVentilation = 'NONE' | 'EXTRACTION' | 'MVHR_CENTRAL' | 'MVHR_LOCAL';

export type Ceiling =
  | { type: 'FLAT'; height: DecimalString }
  | { type: 'SLOPED'; minHeight: DecimalString; maxHeight: DecimalString }
  /** Geometrie complesse: altezza media = volume netto / superficie, calcolata dall'utente. */
  | { type: 'MANUAL'; averageHeight: DecimalString };

// ---------------------------------------------------------------------------
// Aperture
// ---------------------------------------------------------------------------

export const OPENING_KINDS = [
  'WINDOW',
  'FRENCH_WINDOW',
  'ROOF_WINDOW',
  'SKYLIGHT',
  'FIXED_GLAZING',
  'TRANSOM',
] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

export type Operability = 'FULL' | 'PARTIAL' | 'FIXED';

export interface OpeningInput {
  id: string;
  label: string;
  kind: OpeningKind;
  quantity: number;
  /** Larghezza in luce architettonica [m]. */
  width: DecimalString;
  /** Altezza in luce architettonica [m]. */
  height: DecimalString;
  /** Quota del davanzale dal pavimento finito [m]; obbligatoria per le aperture verticali. */
  sillHeight?: DecimalString;
  /** Dimensioni del vetro netto, usate se il profilo misura `NET_GLASS`. */
  glassWidth?: DecimalString;
  glassHeight?: DecimalString;
  operability: Operability;
  /** Superficie apribile per singola apertura [mq], obbligatoria se `PARTIAL`. */
  openableArea?: DecimalString;
  /** Profondità dell'aggetto sovrastante (balcone, gronda) [m]. */
  overhangDepth?: DecimalString;
  /** Falso se l'apertura dà su cavedio/chiostrina non idonei: non si computa (EC-11). */
  facesSuitableSpace?: boolean;
}

// ---------------------------------------------------------------------------
// Verifiche e deroghe
// ---------------------------------------------------------------------------

export type CheckId =
  | 'RAI_ILLUMINATING'
  | 'RAI_VENTILATING'
  | 'HEIGHT'
  | 'MIN_AREA'
  | 'VENTILATION'
  | 'STUDIO_APARTMENT_AREA'
  | 'OCCUPANCY_AREA';

export type DerogationCode = 'D-01' | 'D-02' | 'D-03' | 'D-99';

export interface DerogationInput {
  code: DerogationCode;
  covers: CheckId[];
  /** Motivazione tecnica, almeno 50 caratteri (FR-M3-12). */
  justification: string;
  legalReference?: string;
}

export interface RoomInput {
  id: string;
  name: string;
  use: RoomUse;
  /** Superficie netta calpestabile Sp [mq]. */
  floorArea: DecimalString;
  /** Parte non computabile (es. sottotetto sotto l'altezza minima) [mq]. */
  nonComputableArea?: DecimalString;
  ceiling: Ceiling;
  isWindowless?: boolean;
  mechanicalVentilation?: MechanicalVentilation;
  openings: OpeningInput[];
  derogations?: DerogationInput[];
}

export interface EvaluationContext {
  /** Altitudine della commessa [m s.l.m.] per la riduzione montana delle altezze. */
  altitude?: number | null;
  /** L'unità immobiliare è un sottotetto. */
  isAttic?: boolean;
}

// ---------------------------------------------------------------------------
// Profilo normativo (FR-M3-01)
// ---------------------------------------------------------------------------

export interface RatioPair {
  illuminating: DecimalString;
  ventilating: DecimalString;
}

export interface DerogationRule {
  code: DerogationCode;
  label: string;
  legalReference: string;
  /** Verifiche che la deroga può coprire. */
  covers: CheckId[];
  /** D-03: ammessa solo in presenza di ventilazione meccanica. */
  requiresMechanicalVentilation?: boolean;
}

export interface RegulationProfile {
  id: string;
  version: number;
  name: string;
  /** Vero per i modelli da adattare, che non si possono usare così come sono per asseverare. */
  isTemplate?: boolean;
  legalReferences: string[];
  checks: { illuminating: boolean; ventilating: boolean };
  ratios: {
    standard: RatioPair;
    /** Soglie per i sottotetti con aperture prevalentemente in falda; `null` = come standard. */
    attic: RatioPair | null;
    /** Quota minima della superficie illuminante in falda per applicare le soglie del sottotetto. */
    atticRoofShareThreshold: DecimalString;
  };
  measurement: {
    basis: 'ARCHITECTURAL_OPENING' | 'NET_GLASS';
    frameCoefficient: DecimalString;
    exclusionHeightFromFloor: DecimalString;
    overhang: {
      method: 'NONE' | 'EXCLUDE_TOP_BAND';
      thresholdDepth: DecimalString;
      factor: DecimalString;
    };
    roofOpeningCoefficient: DecimalString;
  };
  heights: {
    habitable: DecimalString;
    nonHabitable: DecimalString;
    mountain: { altitudeThreshold: number; habitable: DecimalString } | null;
    /** Limite inferiore asseverabile con D-01 (art. 24 c. 5-bis DPR 380/2001). */
    salvaCasaMinimum: DecimalString;
  };
  minimumAreas: {
    singleBedroom: DecimalString;
    doubleBedroom: DecimalString;
    livingRoom: DecimalString;
  };
  studioApartment: {
    onePerson: DecimalString;
    twoPersons: DecimalString;
    salvaCasaOnePerson: DecimalString;
    salvaCasaTwoPersons: DecimalString;
  };
  perInhabitant: { firstFour: DecimalString; additional: DecimalString };
  raiRequiredUses: RoomUse[];
  windowlessAllowedUses: RoomUse[];
  ventilationRequiredUses: RoomUse[];
  allowedDerogations: DerogationRule[];
}

// ---------------------------------------------------------------------------
// Risultati
// ---------------------------------------------------------------------------

export type Outcome =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'SUBJECT_TO_ATTESTATION'
  | 'INCOMPLETE'
  | 'NOT_REQUIRED'
  | 'INVALID_INPUT';

export type CheckStatus = 'PASSED' | 'FAILED' | 'COVERED_BY_DEROGATION';

export type NoteCode =
  | 'EXCLUDED_BOTTOM_BAND'
  | 'EXCLUDED_TOP_BAND_OVERHANG'
  | 'OPENING_BELOW_COMPUTATION_HEIGHT'
  | 'NOT_SUITABLE_SPACE'
  | 'ATTIC_RATIO_APPLIED'
  | 'MOUNTAIN_HEIGHT_APPLIED'
  | 'DEROGATION_IGNORED'
  | 'DEROGATION_APPLIED'
  | 'WINDOWLESS_HABITABLE_ROOM'
  | 'UNUSUALLY_HIGH_VALUES'
  | 'MISSING_OPENINGS';

export interface Note {
  code: NoteCode;
  message: string;
  refId?: string;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface OpeningResult {
  id: string;
  label: string;
  grossArea: DecimalString;
  illuminatingHeight: DecimalString;
  illuminatingArea: DecimalString;
  ventilatingArea: DecimalString;
  isRoofOpening: boolean;
}

export interface RatioCheck {
  check: 'RAI_ILLUMINATING' | 'RAI_VENTILATING';
  status: CheckStatus;
  total: DecimalString;
  requiredRatio: DecimalString;
  minimum: DecimalString;
  /** total − minimum, con segno, valore esatto. */
  delta: DecimalString;
  /** total / Sp computabile, 6 decimali (solo presentazione). */
  ratio: DecimalString;
}

export interface ThresholdCheck {
  check: 'HEIGHT' | 'MIN_AREA' | 'STUDIO_APARTMENT_AREA' | 'OCCUPANCY_AREA';
  status: CheckStatus;
  value: DecimalString;
  minimum: DecimalString;
}

export interface VentilationCheck {
  check: 'VENTILATION';
  status: CheckStatus;
  via: 'OPENING' | 'MECHANICAL' | 'NONE';
}

export interface AppliedDerogation {
  code: DerogationCode;
  check: CheckId;
  justification: string;
  legalReference: string;
}

export interface RoomResult {
  roomId: string;
  roomClass: RoomClass;
  raiRequired: boolean;
  computableArea: DecimalString;
  openings: OpeningResult[];
  illuminating: RatioCheck | null;
  ventilating: RatioCheck | null;
  height: ThresholdCheck | null;
  minimumArea: ThresholdCheck | null;
  ventilation: VentilationCheck | null;
  appliedDerogations: AppliedDerogation[];
  outcome: Outcome;
  issues: ValidationIssue[];
  notes: Note[];
  profile: { id: string; version: number };
}
