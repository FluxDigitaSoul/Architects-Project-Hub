/**
 * Profili normativi di sistema — AFU FR-M3-01.
 *
 * ⚠️ I valori dei profili locali variano da regolamento a regolamento: il modello
 * LOCAL_REGULATION_TEMPLATE va adattato e validato da un professionista con il
 * riferimento puntuale agli articoli prima di essere usato per asseverare.
 */
import type { DerogationRule, RegulationProfile, RoomUse } from './types.js';

const RAI_REQUIRED_USES: RoomUse[] = [
  'LIVING_ROOM',
  'SINGLE_BEDROOM',
  'DOUBLE_BEDROOM',
  'KITCHEN',
  'LIVING_WITH_KITCHENETTE',
  'DINING',
  'STUDY',
  'STUDIO_ROOM',
  'OTHER_HABITABLE',
];

/** Art. 5 D.M. 1975: servizi, disimpegni, corridoi, vani scala e ripostigli non richiedono illuminazione diretta. */
const WINDOWLESS_ALLOWED_USES: RoomUse[] = [
  'BATHROOM',
  'WC',
  'LAUNDRY',
  'STORAGE',
  'WALK_IN_CLOSET',
  'HALLWAY',
  'CORRIDOR',
  'STAIRWELL',
  'TECHNICAL',
  'ATTIC_NON_HABITABLE',
  'OTHER_ACCESSORY',
];

/** Art. 7 D.M. 1975: bagno con apertura all'esterno o aspirazione meccanica. */
const VENTILATION_REQUIRED_USES: RoomUse[] = ['BATHROOM', 'WC'];

const D01_SALVA_CASA: DerogationRule = {
  code: 'D-01',
  label: 'Salva Casa — art. 24 c. 5-bis DPR 380/2001 (L. 105/2024)',
  legalReference: 'Art. 24, comma 5-bis, D.P.R. 380/2001 (D.L. 69/2024 conv. L. 105/2024)',
  // Non copre il R.A.I. (AFU README, nota di revisione 2).
  covers: ['HEIGHT', 'STUDIO_APARTMENT_AREA'],
};

const D02_LOCAL: DerogationRule = {
  code: 'D-02',
  label: 'Deroga da regolamento locale (immobili vincolati / centro storico)',
  legalReference: 'Regolamento edilizio comunale — articolo da indicare',
  covers: ['RAI_ILLUMINATING', 'RAI_VENTILATING', 'HEIGHT'],
};

const D03_MECHANICAL: DerogationRule = {
  code: 'D-03',
  label: "Ventilazione meccanica in sostituzione dell'aerazione naturale",
  legalReference: 'Regolamento locale — articolo da indicare',
  covers: ['RAI_VENTILATING'],
  requiresMechanicalVentilation: true,
};

const D99_OTHER: DerogationRule = {
  code: 'D-99',
  label: 'Altra deroga documentata dal progettista',
  legalReference: '',
  covers: [
    'RAI_ILLUMINATING',
    'RAI_VENTILATING',
    'HEIGHT',
    'MIN_AREA',
    'VENTILATION',
    'STUDIO_APARTMENT_AREA',
    'OCCUPANCY_AREA',
  ],
};

export const NATIONAL_DM_1975: RegulationProfile = {
  id: 'IT-DM-1975',
  version: 1,
  name: 'Nazionale — D.M. Sanità 5 luglio 1975',
  legalReferences: ['D.M. Sanità 5 luglio 1975, artt. 1–7'],
  checks: { illuminating: true, ventilating: true },
  ratios: {
    standard: { illuminating: '0.125', ventilating: '0.125' },
    attic: null,
    atticRoofShareThreshold: '0.5',
  },
  measurement: {
    basis: 'ARCHITECTURAL_OPENING',
    frameCoefficient: '1',
    exclusionHeightFromFloor: '0',
    overhang: { method: 'NONE', thresholdDepth: '0', factor: '0' },
    roofOpeningCoefficient: '1',
  },
  heights: {
    habitable: '2.70',
    nonHabitable: '2.40',
    mountain: { altitudeThreshold: 1000, habitable: '2.55' },
    salvaCasaMinimum: '2.40',
  },
  minimumAreas: { singleBedroom: '9', doubleBedroom: '14', livingRoom: '14' },
  studioApartment: {
    onePerson: '28',
    twoPersons: '38',
    salvaCasaOnePerson: '20',
    salvaCasaTwoPersons: '28',
  },
  perInhabitant: { firstFour: '14', additional: '10' },
  raiRequiredUses: RAI_REQUIRED_USES,
  windowlessAllowedUses: WINDOWLESS_ALLOWED_USES,
  ventilationRequiredUses: VENTILATION_REQUIRED_USES,
  allowedDerogations: [D99_OTHER],
};

export const NATIONAL_SALVA_CASA: RegulationProfile = {
  ...NATIONAL_DM_1975,
  id: 'IT-DM-1975-SALVA-CASA',
  name: 'Nazionale — D.M. 1975 + Salva Casa (art. 24 c. 5-bis DPR 380/2001)',
  legalReferences: [
    ...NATIONAL_DM_1975.legalReferences,
    'Art. 24, commi 5-bis e seguenti, D.P.R. 380/2001 (L. 105/2024)',
  ],
  allowedDerogations: [D01_SALVA_CASA, D99_OTHER],
};

export const LOCAL_REGULATION_TEMPLATE: RegulationProfile = {
  ...NATIONAL_DM_1975,
  id: 'LOCAL-TEMPLATE',
  name: 'Modello "regolamento locale tipo" (da adattare e validare)',
  isTemplate: true,
  legalReferences: [
    ...NATIONAL_DM_1975.legalReferences,
    'Regolamento edilizio comunale — articoli da indicare',
  ],
  measurement: {
    basis: 'ARCHITECTURAL_OPENING',
    frameCoefficient: '1',
    exclusionHeightFromFloor: '0.60',
    overhang: { method: 'EXCLUDE_TOP_BAND', thresholdDepth: '1.20', factor: '0.5' },
    roofOpeningCoefficient: '1',
  },
  allowedDerogations: [D02_LOCAL, D03_MECHANICAL, D99_OTHER],
};

export const SYSTEM_PROFILES: readonly RegulationProfile[] = [
  NATIONAL_DM_1975,
  NATIONAL_SALVA_CASA,
  LOCAL_REGULATION_TEMPLATE,
];
