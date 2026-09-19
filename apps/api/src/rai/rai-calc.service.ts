import { Injectable } from '@nestjs/common';
import {
  type Ceiling,
  type DerogationInput,
  type EvaluationContext,
  type OpeningInput,
  type RegulationProfile,
  type RoomInput,
  type UnitInput,
  type UnitResult,
  evaluateUnit,
} from '@aph/rai-engine';
import { sql } from 'kysely';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { sha256Hex } from '../common/crypto';
import type { Tx } from '../database/database';
import { type ProjectRow, type StudioScope, loadVisibleProject } from '../studio/studio-scope';

/** Numerico SQL "2.700" → "2.7": stesso valore, rappresentazione canonica per hash e confronti. */
export function canonicalDecimal(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
const dec = (v: string | null): string | undefined => (v === null ? undefined : canonicalDecimal(v));

export interface UnitTree {
  id: string;
  name: string;
  floor: string | null;
  profileVersionId: string | null;
  input: UnitInput;
}

export interface BuildingTree {
  id: string;
  name: string;
  address: string | null;
  units: UnitTree[];
}

export type RaiRows = Awaited<ReturnType<RaiCalcService['loadRows']>>;

interface ProfileRef {
  versionId: string;
  profile: RegulationProfile;
}

/** Stabile a parità di contenuto: chiavi ordinate, così lo stesso input dà lo stesso hash (BR-21). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Calcolo R.A.I. lato server con lo stesso motore del client (FR-M3-08/10, TC-R-99). */
@Injectable()
export class RaiCalcService {
  constructor(private readonly audit: AuditService) {}

  /** Righe della struttura R.A.I. della commessa (fabbricati, unità, vani, aperture, deroghe). */
  async loadRows(tx: Tx, projectId: string) {
    const buildings = await tx.selectFrom('buildings').selectAll()
      .where('project_id', '=', projectId).orderBy('sort_order').orderBy('created_at').execute();
    const units = buildings.length
      ? await tx.selectFrom('dwelling_units').selectAll()
        .where('building_id', 'in', buildings.map((b) => b.id)).orderBy('sort_order').orderBy('created_at').execute()
      : [];
    const unitIds = units.map((u) => u.id);
    const rooms = unitIds.length
      ? await tx.selectFrom('rooms').selectAll().where('unit_id', 'in', unitIds).orderBy('sort_order').orderBy('created_at').execute()
      : [];
    const roomIds = rooms.map((r) => r.id);
    const openings = roomIds.length
      ? await tx.selectFrom('openings').selectAll().where('room_id', 'in', roomIds).orderBy('sort_order').orderBy('created_at').execute()
      : [];
    const scopeIds = [...roomIds, ...unitIds];
    const derogations = scopeIds.length
      ? await tx.selectFrom('derogations').selectAll()
        .where((eb) => eb.or([eb('room_id', 'in', scopeIds), eb('unit_id', 'in', scopeIds)]))
        .orderBy('created_at').execute()
      : [];
    return { buildings, units, rooms, openings, derogations };
  }

  /** Carica fabbricati, unità, vani, aperture e deroghe e li converte negli input del motore. */
  async loadTree(tx: Tx, projectId: string): Promise<BuildingTree[]> {
    return this.treeFrom(await this.loadRows(tx, projectId));
  }

  private treeFrom({ buildings, units, rooms, openings, derogations }: RaiRows): BuildingTree[] {
    const toDerogation = (d: (typeof derogations)[number]): DerogationInput => ({
      code: d.code,
      covers: d.covers as DerogationInput['covers'],
      justification: d.justification,
      ...(d.legal_reference ? { legalReference: d.legal_reference } : {}),
    });
    const toOpening = (o: (typeof openings)[number]): OpeningInput => ({
      id: o.id,
      label: o.label,
      kind: o.kind as OpeningInput['kind'],
      quantity: o.quantity,
      width: canonicalDecimal(o.width),
      height: canonicalDecimal(o.height),
      operability: o.operability,
      facesSuitableSpace: o.faces_suitable_space,
      ...(o.sill_height !== null ? { sillHeight: dec(o.sill_height) } : {}),
      ...(o.glass_width !== null ? { glassWidth: dec(o.glass_width) } : {}),
      ...(o.glass_height !== null ? { glassHeight: dec(o.glass_height) } : {}),
      ...(o.openable_area !== null ? { openableArea: dec(o.openable_area) } : {}),
      ...(o.overhang_depth !== null ? { overhangDepth: dec(o.overhang_depth) } : {}),
    });
    const toRoom = (r: (typeof rooms)[number]): RoomInput => ({
      id: r.id,
      name: r.name,
      use: r.use as RoomInput['use'],
      floorArea: canonicalDecimal(r.floor_area),
      ...(r.non_computable_area !== null ? { nonComputableArea: dec(r.non_computable_area) } : {}),
      ceiling: r.ceiling as Ceiling,
      isWindowless: r.is_windowless,
      mechanicalVentilation: r.mechanical_ventilation as RoomInput['mechanicalVentilation'],
      openings: openings.filter((o) => o.room_id === r.id).map(toOpening),
      derogations: derogations.filter((d) => d.room_id === r.id).map(toDerogation),
    });

    return buildings.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      units: units.filter((u) => u.building_id === b.id).map((u) => ({
        id: u.id,
        name: u.name,
        floor: u.floor,
        profileVersionId: u.regulation_profile_version_id,
        input: {
          id: u.id,
          unitType: u.unit_type,
          ...(u.occupants ? { occupants: u.occupants } : {}),
          isAttic: u.is_attic,
          rooms: rooms.filter((r) => r.unit_id === u.id).map(toRoom),
          derogations: derogations.filter((d) => d.unit_id === u.id).map(toDerogation),
        },
      })),
    }));
  }

  /** Profilo applicato: quello dell'unità, altrimenti quello della commessa, altrimenti il predefinito. */
  private async profiles(tx: Tx, project: ProjectRow, tree: BuildingTree[]): Promise<{ project: ProfileRef; byVersion: Map<string, ProfileRef> }> {
    const ids = new Set<string>(tree.flatMap((b) => b.units.map((u) => u.profileVersionId).filter((v): v is string => Boolean(v))));
    let projectVersionId = project.regulation_profile_version_id;
    if (!projectVersionId) {
      const def = await tx.selectFrom('regulation_profile_versions as v').innerJoin('regulation_profiles as p', 'p.id', 'v.profile_id')
        .select('v.id').where('p.is_default', '=', true).where('v.published_at', 'is not', null)
        .orderBy('p.scope', 'desc').orderBy('v.version_number', 'desc').executeTakeFirst();
      if (!def) throw new AppError('INTERNAL_ERROR', 'Nessun profilo normativo disponibile.');
      projectVersionId = def.id;
    }
    ids.add(projectVersionId);
    const rows = await tx.selectFrom('regulation_profile_versions').select(['id', 'parameters']).where('id', 'in', [...ids]).execute();
    const byVersion = new Map(rows.map((r) => [r.id, { versionId: r.id, profile: r.parameters }]));
    const projectProfile = byVersion.get(projectVersionId);
    if (!projectProfile) throw new AppError('NOT_FOUND', 'Profilo normativo della commessa non trovato.');
    return { project: projectProfile, byVersion };
  }

  /** Esegue il calcolo di tutta la commessa (FR-M3-08, FR-M3-14, FR-M3-15). */
  async evaluate(tx: Tx, project: ProjectRow, rows?: RaiRows) {
    const tree = rows ? this.treeFrom(rows) : await this.loadTree(tx, project.id);
    const { project: projectProfile, byVersion } = await this.profiles(tx, project, tree);
    const context: EvaluationContext = { altitude: project.altitude_m };
    const buildings = tree.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      units: b.units.map((u) => {
        const ref = (u.profileVersionId ? byVersion.get(u.profileVersionId) : undefined) ?? projectProfile;
        return { id: u.id, name: u.name, floor: u.floor, profileVersionId: ref.versionId, input: u.input, result: evaluateUnit(u.input, ref.profile, context) };
      }),
    }));
    const p = projectProfile.profile;
    return { buildings, profile: { versionId: projectProfile.versionId, id: p.id, name: p.name, version: p.version }, context };
  }

  /** Riepilogo per il widget della commessa (AC-FR-M1-04-1): conteggi per esito e deficit totale in mq. */
  static summarize(units: Array<{ result: UnitResult }>) {
    const counts = { COMPLIANT: 0, NON_COMPLIANT: 0, SUBJECT_TO_ATTESTATION: 0, INCOMPLETE: 0, NOT_REQUIRED: 0, INVALID_INPUT: 0 };
    let deficitMicro = 0; // somma in milionesimi di mq interi: nessun errore di virgola mobile
    for (const { result } of units) {
      for (const room of result.rooms) {
        counts[room.outcome] += 1;
        if (room.outcome !== 'NON_COMPLIANT') continue;
        const deltas = [room.illuminating, room.ventilating]
          .filter((c) => c?.status === 'FAILED')
          .map((c) => Math.round(-Number(c?.delta ?? 0) * 1_000_000));
        deficitMicro += Math.max(0, ...deltas);
      }
    }
    const rooms = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, rooms, deficitSqm: (Math.round(deficitMicro / 10_000) / 100).toFixed(2) };
  }

  /** Calcolo e struttura completa per l'editor (id e campi descrittivi che il motore non usa). */
  async projectResults(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await this.loadRows(tx, project.id);
    const evaluated = await this.evaluate(tx, project, rows);
    return {
      ...evaluated,
      summary: RaiCalcService.summarize(evaluated.buildings.flatMap((b) => b.units)),
      structure: RaiCalcService.structureOf(rows),
      projectProfileVersionId: project.regulation_profile_version_id,
      altitudeM: project.altitude_m,
    };
  }

  static structureOf({ buildings, units, rooms, openings, derogations }: RaiRows) {
    const derogationDto = (d: RaiRows['derogations'][number]) => ({
      id: d.id, code: d.code, covers: d.covers, justification: d.justification, legalReference: d.legal_reference,
      createdAt: new Date(d.created_at).toISOString(),
    });
    return buildings.map((b) => ({
      id: b.id, name: b.name, address: b.address, floors: b.floors, yearBuilt: b.year_built, constraints: b.constraints,
      units: units.filter((u) => u.building_id === b.id).map((u) => ({
        id: u.id, name: u.name, floor: u.floor, unitType: u.unit_type, occupants: u.occupants, isAttic: u.is_attic,
        cadastral: u.cadastral, regulationProfileVersionId: u.regulation_profile_version_id,
        derogations: derogations.filter((d) => d.unit_id === u.id).map(derogationDto),
        rooms: rooms.filter((r) => r.unit_id === u.id).map((r) => ({
          id: r.id, name: r.name, code: r.code, use: r.use, floorArea: canonicalDecimal(r.floor_area),
          nonComputableArea: r.non_computable_area === null ? null : canonicalDecimal(r.non_computable_area),
          ceiling: r.ceiling, isWindowless: r.is_windowless, mechanicalVentilation: r.mechanical_ventilation, notes: r.notes,
          derogations: derogations.filter((d) => d.room_id === r.id).map(derogationDto),
          openings: openings.filter((o) => o.room_id === r.id).map((o) => ({
            id: o.id, label: o.label, kind: o.kind, quantity: o.quantity, width: canonicalDecimal(o.width), height: canonicalDecimal(o.height),
            sillHeight: dec(o.sill_height) ?? null, glassWidth: dec(o.glass_width) ?? null, glassHeight: dec(o.glass_height) ?? null,
            operability: o.operability, openableArea: dec(o.openable_area) ?? null, overhangDepth: dec(o.overhang_depth) ?? null,
            orientation: o.orientation, facesSuitableSpace: o.faces_suitable_space, openingTypeId: o.opening_type_id, notes: o.notes,
          })),
        })),
      })),
    }));
  }

  /**
   * FR-M3-16 / BR-21: snapshot immutabile di input e risultati con la versione del profilo.
   * Rev. 0 alla prima emissione; dalla Rev. 1 il motivo è obbligatorio (FR-M5-22).
   */
  async createSnapshot(tx: Tx, scope: StudioScope, projectId: string, reason: string | null, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    await sql`select 1 from app.projects where id = ${project.id}::uuid for update`.execute(tx);
    const evaluated = await this.evaluate(tx, project);
    if (!evaluated.buildings.some((b) => b.units.some((u) => u.input.rooms.length))) {
      throw new AppError('VALIDATION_FAILED', 'Inserisci almeno un vano prima di emettere il calcolo.');
    }
    const { max } = await tx.selectFrom('rai_snapshots').select((eb) => eb.fn.max('revision').as('max'))
      .where('project_id', '=', project.id).executeTakeFirstOrThrow();
    const revision = max === null ? 0 : Number(max) + 1;
    if (revision > 0 && (!reason || reason.trim().length < 5)) {
      throw new AppError('VALIDATION_FAILED', 'Indica il motivo della revisione.', { fields: [{ path: 'reason', message: 'Obbligatorio dalla Rev. 1' }] });
    }
    const inputs = {
      profileVersionId: evaluated.profile.versionId,
      context: evaluated.context,
      buildings: evaluated.buildings.map((b) => ({
        id: b.id, name: b.name, address: b.address,
        units: b.units.map((u) => ({ id: u.id, name: u.name, floor: u.floor, profileVersionId: u.profileVersionId, input: u.input })),
      })),
    };
    const summary = RaiCalcService.summarize(evaluated.buildings.flatMap((b) => b.units));
    const results = {
      profile: evaluated.profile,
      buildings: evaluated.buildings.map((b) => ({ id: b.id, units: b.units.map((u) => ({ id: u.id, result: u.result })) })),
      summary,
    };
    const snapshot = await tx.insertInto('rai_snapshots').values({
      tenant_id: scope.tenantId, project_id: project.id, revision, reason: reason?.trim() || null,
      profile_version_id: evaluated.profile.versionId, inputs: JSON.stringify(inputs), results: JSON.stringify(results),
      inputs_sha256: sha256Hex(canonicalJson(inputs)), created_by: scope.userId,
    }).returning(['id', 'created_at']).executeTakeFirstOrThrow();
    // BR-21: le versioni di profilo dello studio usate si bloccano; quelle di sistema sono già immutabili.
    const usedVersions = [...new Set([evaluated.profile.versionId, ...evaluated.buildings.flatMap((b) => b.units.map((u) => u.profileVersionId))])];
    await tx.updateTable('regulation_profile_versions').set({ locked_at: new Date() })
      .where('id', 'in', usedVersions).where('tenant_id', 'is not', null).where('locked_at', 'is', null).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'RAI_SNAPSHOT_CREATED',
      objectType: 'RAI_SNAPSHOT', objectId: snapshot.id, details: { revision, summary }, meta,
    });
    return { id: snapshot.id, revision, createdAt: new Date(snapshot.created_at).toISOString(), summary };
  }

  async listSnapshots(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await tx.selectFrom('rai_snapshots').select(['id', 'revision', 'reason', 'created_at', 'inputs_sha256', 'results'])
      .where('project_id', '=', project.id).orderBy('revision', 'desc').execute();
    return rows.map((r) => ({
      id: r.id, revision: r.revision, reason: r.reason, createdAt: new Date(r.created_at).toISOString(), inputsSha256: r.inputs_sha256,
      summary: (r.results as { summary?: unknown }).summary ?? null,
    }));
  }

  /** Profili disponibili: di sistema e dello studio, con l'ultima versione pubblicata (FR-M3-01). */
  async listProfiles(tx: Tx) {
    const rows = await tx.selectFrom('regulation_profiles as p')
      .innerJoin('regulation_profile_versions as v', 'v.profile_id', 'p.id')
      .select(['p.id', 'p.code', 'p.name', 'p.scope', 'p.is_template', 'p.is_default', 'v.id as version_id', 'v.version_number', 'v.legal_references', 'v.locked_at'])
      .where('v.published_at', 'is not', null)
      .orderBy('p.scope', 'desc').orderBy('p.name').orderBy('v.version_number', 'desc').execute();
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.id)) latest.set(r.id, r);
    return [...latest.values()].map((r) => ({
      id: r.id, code: r.code, name: r.name, scope: r.scope, isTemplate: r.is_template, isDefault: r.is_default,
      versionId: r.version_id, version: r.version_number, legalReferences: r.legal_references, locked: Boolean(r.locked_at),
    }));
  }
}
