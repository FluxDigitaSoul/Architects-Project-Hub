import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import { type StudioScope, assertProjectWritable, assertUuid, loadVisibleProject } from '../studio/studio-scope';
import type {
  BuildingInput,
  DerogationInputDto,
  OpeningInputDto,
  OpeningTypeInputDto,
  RoomInputDto,
  UnitInputDto,
} from './rai.schemas';

type Level = 'building' | 'unit' | 'room' | 'opening';
export type RaiEntity = Level | 'opening-type' | 'derogation';

const nullable = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);

/** Solo i campi presenti nell'input diventano colonne da aggiornare (PATCH parziale). */
function pick<I extends object>(input: I, map: Partial<Record<keyof I, string>>, json: Array<keyof I> = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map) as Array<[keyof I, string]>) {
    const value = input[key];
    if (value !== undefined) out[column] = json.includes(key) ? JSON.stringify(value) : value;
  }
  return out;
}

const ROOM_COLUMNS: Partial<Record<keyof RoomInputDto, string>> = {
  name: 'name', code: 'code', use: 'use', floorArea: 'floor_area', nonComputableArea: 'non_computable_area', ceiling: 'ceiling',
  isWindowless: 'is_windowless', mechanicalVentilation: 'mechanical_ventilation', notes: 'notes', sortOrder: 'sort_order',
};
const OPENING_COLUMNS: Partial<Record<keyof OpeningInputDto, string>> = {
  label: 'label', kind: 'kind', openingTypeId: 'opening_type_id', orientation: 'orientation', quantity: 'quantity',
  width: 'width', height: 'height', sillHeight: 'sill_height', glassWidth: 'glass_width', glassHeight: 'glass_height',
  operability: 'operability', openableArea: 'openable_area', overhangDepth: 'overhang_depth',
  facesSuitableSpace: 'faces_suitable_space', notes: 'notes', sortOrder: 'sort_order',
};
const TYPE_DIMENSIONS: Partial<Record<keyof OpeningTypeInputDto, string>> = {
  kind: 'kind', width: 'width', height: 'height', sillHeight: 'sill_height', glassWidth: 'glass_width',
  glassHeight: 'glass_height', operability: 'operability', openableArea: 'openable_area',
};
const BUILDING_COLUMNS: Partial<Record<keyof BuildingInput, string>> = {
  name: 'name', address: 'address', floors: 'floors', yearBuilt: 'year_built', constraints: 'constraints', sortOrder: 'sort_order',
};
const UNIT_COLUMNS: Partial<Record<keyof UnitInputDto, string>> = {
  name: 'name', floor: 'floor', cadastral: 'cadastral', unitType: 'unit_type', occupants: 'occupants', isAttic: 'is_attic',
  regulationProfileVersionId: 'regulation_profile_version_id', sortOrder: 'sort_order',
};

/** Anagrafica R.A.I. persistente (FR-M3-02..07, FR-M3-12). Ogni scrittura verifica la catena fino alla commessa. */
@Injectable()
export class RaiStructureService {
  constructor(private readonly audit: AuditService) {}

  private async writableProject(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertProjectWritable(project);
    return project;
  }

  /** Verifica che l'elemento appartenga alla commessa (BR-04: altrimenti 404). */
  private async assertInProject(tx: Tx, projectId: string, level: Level, id: string): Promise<void> {
    assertUuid(id);
    let found: unknown;
    if (level === 'building') {
      found = await tx.selectFrom('buildings').select('id').where('id', '=', id).where('project_id', '=', projectId).executeTakeFirst();
    } else if (level === 'unit') {
      found = await tx.selectFrom('dwelling_units as u').innerJoin('buildings as b', 'b.id', 'u.building_id')
        .select('u.id').where('u.id', '=', id).where('b.project_id', '=', projectId).executeTakeFirst();
    } else if (level === 'room') {
      found = await tx.selectFrom('rooms as r').innerJoin('dwelling_units as u', 'u.id', 'r.unit_id')
        .innerJoin('buildings as b', 'b.id', 'u.building_id')
        .select('r.id').where('r.id', '=', id).where('b.project_id', '=', projectId).executeTakeFirst();
    } else {
      found = await tx.selectFrom('openings as o').innerJoin('rooms as r', 'r.id', 'o.room_id')
        .innerJoin('dwelling_units as u', 'u.id', 'r.unit_id').innerJoin('buildings as b', 'b.id', 'u.building_id')
        .select('o.id').where('o.id', '=', id).where('b.project_id', '=', projectId).executeTakeFirst();
    }
    if (!found) throw new AppError('NOT_FOUND', 'Elemento non trovato.');
  }

  private async assertProfileVersion(tx: Tx, id: string): Promise<void> {
    assertUuid(id, 'Profilo normativo');
    const v = await tx.selectFrom('regulation_profile_versions').select('id').where('id', '=', id).where('published_at', 'is not', null).executeTakeFirst();
    if (!v) throw new AppError('NOT_FOUND', 'Profilo normativo non trovato.');
  }

  private async assertTypeInProject(tx: Tx, projectId: string, typeId: string): Promise<void> {
    assertUuid(typeId, 'Tipo di serramento');
    const t = await tx.selectFrom('opening_types').select('id').where('id', '=', typeId).where('project_id', '=', projectId).executeTakeFirst();
    if (!t) throw new AppError('NOT_FOUND', 'Tipo di serramento non trovato.');
  }

  private log(tx: Tx, scope: StudioScope, action: string, objectType: string, objectId: string, meta: RequestMeta, details?: Record<string, unknown>) {
    return this.audit.record(tx, { tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action, objectType, objectId, details, meta });
  }

  // ---- Fabbricati e unità -----------------------------------------------------------------------

  async createBuilding(tx: Tx, scope: StudioScope, projectId: string, input: BuildingInput, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    const row = await tx.insertInto('buildings').values({
      tenant_id: scope.tenantId, project_id: project.id, name: input.name, address: nullable(input.address),
      floors: nullable(input.floors), year_built: nullable(input.yearBuilt), constraints: nullable(input.constraints),
      sort_order: input.sortOrder,
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_BUILDING_CREATED', 'BUILDING', row.id, meta);
    return row;
  }

  async updateBuilding(tx: Tx, scope: StudioScope, projectId: string, id: string, input: Partial<BuildingInput>, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'building', id);
    const patch = pick(input, BUILDING_COLUMNS);
    if (Object.keys(patch).length) await tx.updateTable('buildings').set(patch).where('id', '=', id).execute();
    await this.log(tx, scope, 'RAI_BUILDING_UPDATED', 'BUILDING', id, meta);
  }

  async createUnit(tx: Tx, scope: StudioScope, projectId: string, buildingId: string, input: UnitInputDto, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'building', buildingId);
    if (input.regulationProfileVersionId) await this.assertProfileVersion(tx, input.regulationProfileVersionId);
    const row = await tx.insertInto('dwelling_units').values({
      tenant_id: scope.tenantId, building_id: buildingId, name: input.name, floor: nullable(input.floor),
      cadastral: JSON.stringify(input.cadastral ?? null), unit_type: input.unitType, occupants: nullable(input.occupants),
      is_attic: input.isAttic, regulation_profile_version_id: nullable(input.regulationProfileVersionId), sort_order: input.sortOrder,
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_UNIT_CREATED', 'DWELLING_UNIT', row.id, meta);
    return row;
  }

  async updateUnit(tx: Tx, scope: StudioScope, projectId: string, id: string, input: Partial<UnitInputDto>, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'unit', id);
    if (input.regulationProfileVersionId) await this.assertProfileVersion(tx, input.regulationProfileVersionId);
    const patch = pick(input, UNIT_COLUMNS, ['cadastral']);
    if (Object.keys(patch).length) await tx.updateTable('dwelling_units').set(patch).where('id', '=', id).execute();
    await this.log(tx, scope, 'RAI_UNIT_UPDATED', 'DWELLING_UNIT', id, meta);
  }

  // ---- Vani ------------------------------------------------------------------------------------

  async createRoom(tx: Tx, scope: StudioScope, projectId: string, unitId: string, input: RoomInputDto, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'unit', unitId);
    if (input.nonComputableArea && Number(input.nonComputableArea) >= Number(input.floorArea)) {
      throw new AppError('VALIDATION_FAILED', 'La parte non computabile deve essere minore della superficie del vano.');
    }
    const row = await tx.insertInto('rooms').values({
      tenant_id: scope.tenantId, unit_id: unitId, name: input.name, code: nullable(input.code), use: input.use,
      floor_area: input.floorArea, non_computable_area: nullable(input.nonComputableArea), ceiling: JSON.stringify(input.ceiling),
      is_windowless: input.isWindowless, mechanical_ventilation: input.mechanicalVentilation, notes: nullable(input.notes),
      sort_order: input.sortOrder,
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_ROOM_CREATED', 'ROOM', row.id, meta);
    return row;
  }

  async updateRoom(tx: Tx, scope: StudioScope, projectId: string, id: string, input: Partial<RoomInputDto>, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'room', id);
    const patch = pick(input, ROOM_COLUMNS, ['ceiling']);
    if (Object.keys(patch).length) await tx.updateTable('rooms').set(patch).where('id', '=', id).execute();
    await this.log(tx, scope, 'RAI_ROOM_UPDATED', 'ROOM', id, meta);
  }

  // ---- Aperture e abaco -----------------------------------------------------------------------

  async createOpening(tx: Tx, scope: StudioScope, projectId: string, roomId: string, input: OpeningInputDto, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'room', roomId);
    if (input.openingTypeId) await this.assertTypeInProject(tx, project.id, input.openingTypeId);
    const row = await tx.insertInto('openings').values({
      tenant_id: scope.tenantId, room_id: roomId, label: input.label, kind: input.kind, opening_type_id: nullable(input.openingTypeId),
      orientation: nullable(input.orientation), quantity: input.quantity, width: input.width, height: input.height,
      sill_height: nullable(input.sillHeight), glass_width: nullable(input.glassWidth), glass_height: nullable(input.glassHeight),
      operability: input.operability, openable_area: nullable(input.openableArea), overhang_depth: nullable(input.overhangDepth),
      faces_suitable_space: input.facesSuitableSpace, notes: nullable(input.notes), sort_order: input.sortOrder,
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_OPENING_CREATED', 'OPENING', row.id, meta);
    return row;
  }

  async updateOpening(tx: Tx, scope: StudioScope, projectId: string, id: string, input: Partial<OpeningInputDto>, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertInProject(tx, project.id, 'opening', id);
    if (input.openingTypeId) await this.assertTypeInProject(tx, project.id, input.openingTypeId);
    const patch = pick(input, OPENING_COLUMNS);
    if (Object.keys(patch).length) await tx.updateTable('openings').set(patch).where('id', '=', id).execute();
    await this.log(tx, scope, 'RAI_OPENING_UPDATED', 'OPENING', id, meta);
  }

  async listOpeningTypes(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await tx.selectFrom('opening_types as t')
      .select((eb) => ['t.id', 't.label', 't.kind', 't.width', 't.height', 't.sill_height', 't.glass_width', 't.glass_height',
        't.operability', 't.openable_area',
        eb.selectFrom('openings as o').select((e) => e.fn.count<string>('o.room_id').distinct().as('n'))
          .whereRef('o.opening_type_id', '=', 't.id').as('rooms_using')])
      .where('t.project_id', '=', project.id).orderBy('t.label').execute();
    return rows.map((t) => ({
      id: t.id, label: t.label, kind: t.kind, width: t.width, height: t.height, sillHeight: t.sill_height, glassWidth: t.glass_width,
      glassHeight: t.glass_height, operability: t.operability, openableArea: t.openable_area, roomsUsing: Number(t.rooms_using ?? 0),
    }));
  }

  async createOpeningType(tx: Tx, scope: StudioScope, projectId: string, input: OpeningTypeInputDto, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    const row = await tx.insertInto('opening_types').values({
      tenant_id: scope.tenantId, project_id: project.id, label: input.label, kind: input.kind, width: input.width, height: input.height,
      sill_height: nullable(input.sillHeight), glass_width: nullable(input.glassWidth), glass_height: nullable(input.glassHeight),
      operability: input.operability, openable_area: nullable(input.openableArea),
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_OPENING_TYPE_CREATED', 'OPENING_TYPE', row.id, meta);
    return row;
  }

  /** AC-FR-M3-07-1: la modifica del tipo si propaga alle aperture collegate; si restituisce quanti vani cambiano. */
  async updateOpeningType(tx: Tx, scope: StudioScope, projectId: string, id: string, input: Partial<OpeningTypeInputDto>, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    await this.assertTypeInProject(tx, project.id, id);
    const dims = pick(input, TYPE_DIMENSIONS);
    const patch = { ...dims, ...(input.label !== undefined ? { label: input.label } : {}) };
    if (Object.keys(patch).length) await tx.updateTable('opening_types').set(patch).where('id', '=', id).execute();
    const updated = Object.keys(dims).length
      ? await tx.updateTable('openings').set(dims).where('opening_type_id', '=', id).returning('room_id').execute()
      : [];
    const roomsRecalculated = new Set(updated.map((u) => u.room_id)).size;
    await this.log(tx, scope, 'RAI_OPENING_TYPE_UPDATED', 'OPENING_TYPE', id, meta, { roomsRecalculated });
    return { roomsRecalculated };
  }

  // ---- Deroghe ----------------------------------------------------------------------------------

  async addDerogation(
    tx: Tx, scope: StudioScope, projectId: string, target: { roomId?: string; unitId?: string },
    input: DerogationInputDto, meta: RequestMeta,
  ) {
    const project = await this.writableProject(tx, scope, projectId);
    if (Boolean(target.roomId) === Boolean(target.unitId)) throw new AppError('VALIDATION_FAILED', 'Indica il vano oppure l’unità.');
    if (target.roomId) await this.assertInProject(tx, project.id, 'room', target.roomId);
    if (target.unitId) await this.assertInProject(tx, project.id, 'unit', target.unitId);
    const row = await tx.insertInto('derogations').values({
      tenant_id: scope.tenantId, room_id: target.roomId ?? null, unit_id: target.unitId ?? null, code: input.code,
      covers: input.covers, justification: input.justification, legal_reference: nullable(input.legalReference), created_by: scope.userId,
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'RAI_DEROGATION_ADDED', 'DEROGATION', row.id, meta, { code: input.code, covers: input.covers });
    return row;
  }

  // ---- Eliminazioni (a cascata sui figli) -----------------------------------------------------

  async remove(tx: Tx, scope: StudioScope, projectId: string, kind: RaiEntity, id: string, meta: RequestMeta) {
    const project = await this.writableProject(tx, scope, projectId);
    assertUuid(id);
    if (kind === 'opening-type') {
      await this.assertTypeInProject(tx, project.id, id);
      await tx.deleteFrom('opening_types').where('id', '=', id).execute();
    } else if (kind === 'derogation') {
      const d = await tx.selectFrom('derogations').select(['room_id', 'unit_id']).where('id', '=', id).executeTakeFirst();
      if (!d) throw new AppError('NOT_FOUND', 'Deroga non trovata.');
      await this.assertInProject(tx, project.id, d.room_id ? 'room' : 'unit', (d.room_id ?? d.unit_id) as string);
      await tx.deleteFrom('derogations').where('id', '=', id).execute();
    } else {
      await this.assertInProject(tx, project.id, kind, id);
      if (kind === 'building') await tx.deleteFrom('buildings').where('id', '=', id).execute();
      if (kind === 'unit') await tx.deleteFrom('dwelling_units').where('id', '=', id).execute();
      if (kind === 'room') await tx.deleteFrom('rooms').where('id', '=', id).execute();
      if (kind === 'opening') await tx.deleteFrom('openings').where('id', '=', id).execute();
    }
    await this.log(tx, scope, `RAI_${kind.toUpperCase().replace('-', '_')}_DELETED`, kind.toUpperCase(), id, meta);
  }
}
