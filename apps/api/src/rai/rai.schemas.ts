import { MIN_JUSTIFICATION_LENGTH, OPENING_KINDS, ROOM_USES } from '@aph/rai-engine';
import { z } from 'zod';

/**
 * Input del Modulo 3 (FR-M3-02..07, FR-M3-12). Le misure sono decimali in metri o metri quadrati
 * con al massimo 3 cifre decimali (BR-22): si accettano numeri o stringhe e si salvano come stringhe.
 */
const decimal = (max: number) =>
  z
    .union([z.string().trim(), z.number()])
    .transform((v) => String(v).replace(',', '.'))
    .refine((v) => /^\d{1,5}(\.\d{1,3})?$/.test(v), 'Valore non valido (max 3 decimali)')
    .refine((v) => Number(v) >= 0 && Number(v) <= max, `Valore fuori intervallo (0–${max})`);
const positiveDecimal = (max: number) => decimal(max).refine((v) => Number(v) > 0, 'Il valore deve essere maggiore di zero');

export const ceilingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FLAT'), height: positiveDecimal(20) }),
  z.object({ type: z.literal('SLOPED'), minHeight: decimal(20), maxHeight: positiveDecimal(20) }),
  z.object({ type: z.literal('MANUAL'), averageHeight: positiveDecimal(20) }),
]).refine((c) => c.type !== 'SLOPED' || Number(c.maxHeight) >= Number(c.minHeight), {
  message: 'L’altezza massima deve essere maggiore o uguale alla minima',
  path: ['maxHeight'],
});

export const buildingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(300).optional().nullable(),
  floors: z.number().int().min(1).max(200).optional().nullable(),
  yearBuilt: z.number().int().min(1000).max(2100).optional().nullable(),
  constraints: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const unitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  floor: z.string().trim().max(20).optional().nullable(),
  cadastral: z.record(z.string(), z.string().max(30)).optional().nullable(),
  unitType: z.enum(['DWELLING', 'STUDIO_APARTMENT', 'OTHER']).default('DWELLING'),
  occupants: z.number().int().min(1).max(50).optional().nullable(),
  isAttic: z.boolean().default(false),
  regulationProfileVersionId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).optional().nullable(),
  use: z.enum(ROOM_USES),
  floorArea: positiveDecimal(10_000),
  nonComputableArea: decimal(10_000).optional().nullable(),
  ceiling: ceilingSchema,
  isWindowless: z.boolean().default(false),
  mechanicalVentilation: z.enum(['NONE', 'EXTRACTION', 'MVHR_CENTRAL', 'MVHR_LOCAL']).default('NONE'),
  notes: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

const openingDimensions = {
  kind: z.enum(OPENING_KINDS),
  width: positiveDecimal(20),
  height: positiveDecimal(20),
  sillHeight: decimal(5).optional().nullable(),
  glassWidth: decimal(20).optional().nullable(),
  glassHeight: decimal(20).optional().nullable(),
  operability: z.enum(['FULL', 'PARTIAL', 'FIXED']),
  openableArea: decimal(400).optional().nullable(),
};
const partialNeedsArea = (o: { operability: string; openableArea?: string | null }) =>
  o.operability !== 'PARTIAL' || Boolean(o.openableArea);
const partialMessage = { message: 'Con apribilità parziale indica la superficie apribile', path: ['openableArea'] };

const openingBase = z.object({
  ...openingDimensions,
  label: z.string().trim().min(1).max(30),
  openingTypeId: z.string().uuid().optional().nullable(),
  orientation: z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).optional().nullable(),
  quantity: z.number().int().min(1).max(50).default(1),
  overhangDepth: decimal(10).optional().nullable(),
  facesSuitableSpace: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
const openingTypeBase = z.object({ ...openingDimensions, label: z.string().trim().min(1).max(20) });

// AC-FR-M3-06-1: con apribilità "Parziale" la superficie apribile è obbligatoria.
export const openingSchema = openingBase.refine(partialNeedsArea, partialMessage);
export const openingTypeSchema = openingTypeBase.refine(partialNeedsArea, partialMessage);

/** Nelle modifiche parziali la regola vale se l'apribilità diventa "Parziale" nello stesso aggiornamento. */
const partialPatchRule = (o: { operability?: string; openableArea?: string | null }) =>
  o.operability !== 'PARTIAL' || Boolean(o.openableArea);
export const openingPatchSchema = openingBase.partial().refine(partialPatchRule, partialMessage);
export const openingTypePatchSchema = openingTypeBase.partial().refine(partialPatchRule, partialMessage);

export const derogationSchema = z.object({
  code: z.enum(['D-01', 'D-02', 'D-03', 'D-99']),
  covers: z.array(z.enum(['RAI_ILLUMINATING', 'RAI_VENTILATING', 'HEIGHT', 'MIN_AREA', 'VENTILATION', 'STUDIO_APARTMENT_AREA', 'OCCUPANCY_AREA'])).min(1),
  justification: z.string().trim().min(MIN_JUSTIFICATION_LENGTH, `La motivazione deve avere almeno ${MIN_JUSTIFICATION_LENGTH} caratteri`).max(5000),
  legalReference: z.string().trim().max(300).optional().nullable(),
});

export const snapshotSchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
});

export type BuildingInput = z.infer<typeof buildingSchema>;
export type UnitInputDto = z.infer<typeof unitSchema>;
export type RoomInputDto = z.infer<typeof roomSchema>;
export type OpeningInputDto = z.infer<typeof openingSchema>;
export type OpeningTypeInputDto = z.infer<typeof openingTypeSchema>;
export type DerogationInputDto = z.infer<typeof derogationSchema>;
