import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import type { ReportSection, Weather } from '../database/schema/field';
import { FileStorage, storageKeys } from '../storage/file-storage';
import { detectFileType } from '../storage/file-type';
import { type StudioScope, assertProjectWritable, assertUuid, loadVisibleProject, requireRole } from '../studio/studio-scope';

const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_MAX_BYTES = 100 * 1024 * 1024;

export interface VisitInput {
  id: string;
  visitType?: 'ORDINARY' | 'EXTRAORDINARY' | 'TESTING' | 'OTHER';
  startedAt: string;
  endedAt?: string | null;
  weather?: Weather | null;
  phase?: string | null;
  generalNotes?: string | null;
}

export interface AttendeeInput {
  kind: 'MEMBER' | 'CLIENT' | 'CONTRACTOR' | 'OTHER';
  refId?: string | null;
  name: string;
  qualification?: string | null;
  organization?: string | null;
  isDirector?: boolean;
}

export interface ItemInput {
  section: ReportSection;
  text: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  addressee?: string | null;
  dueDate?: string | null;
  needsVerification?: boolean;
  origin?: 'AI' | 'HUMAN' | 'AI_EDITED';
  photoRefs?: string[];
  sortOrder?: number;
}

export interface MediaInput {
  id: string;
  takenAt?: string | null;
  caption?: string | null;
  section?: ReportSection | null;
  durationSec?: number | null;
}

/** Diario di cantiere (Modulo 4): sopralluoghi, presenti, foto, audio, voci e finalizzazione. */
@Injectable()
export class FieldService {
  constructor(
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
  ) {}

  /**
   * BR-24: ogni operazione dalla coda offline porta un clientOpId; il server la applica una volta sola.
   * Se l'id è già stato visto, restituisce il risultato memorizzato.
   */
  async idempotent<T extends object>(tx: Tx, scope: StudioScope, clientOpId: string | undefined, operation: string, fn: () => Promise<T>): Promise<T> {
    if (!clientOpId) return fn();
    assertUuid(clientOpId, 'Operazione');
    const done = await tx.selectFrom('client_operations').select('result').where('client_op_id', '=', clientOpId).executeTakeFirst();
    if (done) return done.result as T;
    const result = await fn();
    await tx.insertInto('client_operations').values({
      tenant_id: scope.tenantId, client_op_id: clientOpId, user_id: scope.userId, operation, result: JSON.stringify(result),
    }).execute();
    return result;
  }

  /** FR-M4-02: i miei cantieri, ordinati per ultimo sopralluogo. */
  async mySites(tx: Tx, scope: StudioScope) {
    const rows = await tx.selectFrom('projects as p')
      .select((eb) => [
        'p.id', 'p.code', 'p.title', 'p.municipality',
        eb.selectFrom('site_visits as s').select((e) => e.fn.max('s.started_at').as('m')).whereRef('s.project_id', '=', 'p.id').as('last_visit_at'),
        eb.selectFrom('site_visits as s').select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('s.project_id', '=', 'p.id').where('s.status', 'in', ['DRAFT', 'AI_PROCESSING', 'REVIEW']).as('drafts'),
        eb.selectFrom('open_actions as oa').select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('oa.project_id', '=', 'p.id').where('oa.status', '=', 'OPEN').as('open_actions'),
      ])
      .where('p.status', '=', 'ACTIVE')
      .where((eb) => eb.exists(
        eb.selectFrom('project_assignments as pa').select('pa.id')
          .whereRef('pa.project_id', '=', 'p.id').where('pa.membership_id', '=', scope.membershipId).where('pa.valid_to', 'is', null),
      ))
      .execute();
    return rows
      .map((r) => ({
        projectId: r.id, code: r.code, title: r.title, municipality: r.municipality,
        lastVisitAt: r.last_visit_at ? new Date(r.last_visit_at as Date).toISOString() : null,
        drafts: Number(r.drafts ?? 0), openActions: Number(r.open_actions ?? 0),
      }))
      .sort((a, b) => (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? ''));
  }

  async list(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await tx.selectFrom('site_visits as s')
      .select((eb) => ['s.id', 's.number', 's.visit_type', 's.started_at', 's.status', 's.shared_with_client',
        eb.selectFrom('visit_photos as ph').select((e) => e.fn.countAll<string>().as('n')).whereRef('ph.visit_id', '=', 's.id').as('photos'),
        eb.selectFrom('report_items as ri').select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('ri.visit_id', '=', 's.id').where('ri.section', '=', 'ISSUES').as('issues')])
      .where('s.project_id', '=', project.id).orderBy('s.number', 'desc').execute();
    return rows.map((r) => ({
      id: r.id, number: r.number, visitType: r.visit_type, startedAt: new Date(r.started_at).toISOString(), status: r.status,
      sharedWithClient: r.shared_with_client, photos: Number(r.photos ?? 0), issues: Number(r.issues ?? 0),
    }));
  }

  /** FR-M4-03: il numero lo assegna il server in modo atomico e senza buchi (BR-16). */
  async create(tx: Tx, scope: StudioScope, projectId: string, input: VisitInput, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertProjectWritable(project);
    assertUuid(input.id, 'Sopralluogo');
    const existing = await tx.selectFrom('site_visits').select(['id', 'number']).where('id', '=', input.id).executeTakeFirst();
    if (existing) return existing; // stesso sopralluogo creato offline e rinviato
    const director = await tx.selectFrom('project_assignments').select('membership_id')
      .where('project_id', '=', project.id).where('project_role', '=', 'SITE_DIRECTOR').where('valid_to', 'is', null).executeTakeFirst();
    const numbered = await sql<{ n: number }>`select app.next_visit_number(${project.id}::uuid) as n`.execute(tx);
    const number = numbered.rows[0]?.n;
    if (!number) throw new AppError('INTERNAL_ERROR', 'Numerazione del verbale non riuscita.');
    const row = await tx.insertInto('site_visits').values({
      id: input.id, tenant_id: scope.tenantId, project_id: project.id, number, visit_type: input.visitType ?? 'ORDINARY',
      started_at: input.startedAt, ended_at: input.endedAt ?? null, weather: JSON.stringify(input.weather ?? null),
      phase: input.phase ?? null, general_notes: input.generalNotes ?? null,
      director_membership_id: director?.membership_id ?? scope.membershipId, created_by: scope.userId,
    }).returning(['id', 'number']).executeTakeFirstOrThrow();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'SITE_VISIT_CREATED',
      objectType: 'SITE_VISIT', objectId: row.id, details: { number }, meta,
    });
    return row;
  }

  async loadVisit(tx: Tx, scope: StudioScope, projectId: string, visitId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(visitId, 'Sopralluogo');
    const visit = await tx.selectFrom('site_visits').selectAll().where('id', '=', visitId).where('project_id', '=', project.id).executeTakeFirst();
    if (!visit) throw new AppError('NOT_FOUND', 'Sopralluogo non trovato.');
    return { project, visit };
  }

  async detail(tx: Tx, scope: StudioScope, projectId: string, visitId: string) {
    const { project, visit } = await this.loadVisit(tx, scope, projectId, visitId);
    const attendees = await tx.selectFrom('visit_attendees').selectAll().where('visit_id', '=', visit.id).orderBy('sort_order').execute();
    const photos = await tx.selectFrom('visit_photos').selectAll().where('visit_id', '=', visit.id).orderBy('sort_order').orderBy('created_at').execute();
    const audio = await tx.selectFrom('audio_notes').selectAll().where('visit_id', '=', visit.id).orderBy('recorded_at').execute();
    const items = await tx.selectFrom('report_items').selectAll().where('visit_id', '=', visit.id).orderBy('section').orderBy('sort_order').execute();
    const pendingActions = await this.openActions(tx, project.id, visit.number);
    const photoUrls = await Promise.all(photos.map((p) =>
      p.upload_status === 'UPLOADED' && p.file_key ? this.storage.createDownloadUrl(p.file_key, 600) : Promise.resolve(null)));
    return {
      id: visit.id, number: visit.number, visitType: visit.visit_type, status: visit.status,
      startedAt: new Date(visit.started_at).toISOString(), endedAt: visit.ended_at ? new Date(visit.ended_at).toISOString() : null,
      weather: visit.weather, phase: visit.phase, generalNotes: visit.general_notes, sharedWithClient: visit.shared_with_client,
      finalizedAt: visit.finalized_at ? new Date(visit.finalized_at).toISOString() : null, cancelReason: visit.cancel_reason,
      attendees: attendees.map((a) => ({ id: a.id, kind: a.kind, refId: a.ref_id, name: a.name, qualification: a.qualification, organization: a.organization, isDirector: a.is_director })),
      photos: photos.map((p, i) => ({
        id: p.id, uploadStatus: p.upload_status, url: photoUrls[i], caption: p.caption, section: p.section,
        takenAt: p.taken_at ? new Date(p.taken_at).toISOString() : null, includeInReport: p.include_in_report, sortOrder: p.sort_order,
      })),
      audio: audio.map((a) => ({ id: a.id, uploadStatus: a.upload_status, durationSec: a.duration_sec, recordedAt: new Date(a.recorded_at).toISOString(), transcriptionStatus: a.transcription_status })),
      items: items.map((it) => ({
        id: it.id, section: it.section, text: it.text, severity: it.severity, addressee: it.addressee, dueDate: it.due_date,
        needsVerification: it.needs_verification, origin: it.origin, photoRefs: it.photo_refs, sortOrder: it.sort_order, version: it.version,
      })),
      openActionsToVerify: pendingActions,
    };
  }

  /** FR-M4-15: difformità aperte dei verbali precedenti, da verificare in questo sopralluogo. */
  private async openActions(tx: Tx, projectId: string, beforeNumber: number) {
    const rows = await tx.selectFrom('open_actions as oa').innerJoin('report_items as ri', 'ri.id', 'oa.source_item_id')
      .select(['oa.id', 'oa.source_visit_number', 'oa.due_date', 'ri.text', 'ri.sort_order'])
      .where('oa.project_id', '=', projectId).where('oa.status', '=', 'OPEN').where('oa.source_visit_number', '<', beforeNumber)
      .orderBy('oa.source_visit_number').orderBy('ri.sort_order').execute();
    return rows.map((r) => ({ id: r.id, sourceVisitNumber: r.source_visit_number, text: r.text, dueDate: r.due_date }));
  }

  async update(tx: Tx, scope: StudioScope, projectId: string, visitId: string, input: Partial<Omit<VisitInput, 'id'>>, meta: RequestMeta) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    await tx.updateTable('site_visits').set({
      ...(input.visitType !== undefined ? { visit_type: input.visitType } : {}),
      ...(input.startedAt !== undefined ? { started_at: input.startedAt } : {}),
      ...(input.endedAt !== undefined ? { ended_at: input.endedAt } : {}),
      ...(input.weather !== undefined ? { weather: JSON.stringify(input.weather) } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.generalNotes !== undefined ? { general_notes: input.generalNotes } : {}),
    }).where('id', '=', visit.id).execute();
    await this.audit.record(tx, { tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'SITE_VISIT_UPDATED', objectType: 'SITE_VISIT', objectId: visit.id, meta });
  }

  /** FR-M4-04: l'elenco dei presenti si sostituisce per intero (operazione idempotente). */
  async setAttendees(tx: Tx, scope: StudioScope, projectId: string, visitId: string, attendees: AttendeeInput[]) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    if (attendees.filter((a) => a.isDirector).length > 1) throw new AppError('VALIDATION_FAILED', 'C’è un solo Direttore dei Lavori.');
    await tx.deleteFrom('visit_attendees').where('visit_id', '=', visit.id).execute();
    if (attendees.length) {
      await tx.insertInto('visit_attendees').values(attendees.map((a, i) => ({
        tenant_id: scope.tenantId, visit_id: visit.id, kind: a.kind, ref_id: a.refId ?? null, name: a.name,
        qualification: a.qualification ?? null, organization: a.organization ?? null, is_director: a.isDirector ?? false, sort_order: i,
      }))).execute();
    }
  }

  private async assertPhotoRefs(tx: Tx, visitId: string, refs?: string[]) {
    if (!refs?.length) return;
    refs.forEach((r) => assertUuid(r, 'Foto'));
    const found = await tx.selectFrom('visit_photos').select('id').where('visit_id', '=', visitId).where('id', 'in', refs).execute();
    if (found.length !== new Set(refs).size) throw new AppError('VALIDATION_FAILED', 'Una foto citata non appartiene al sopralluogo.');
  }

  async addItem(tx: Tx, scope: StudioScope, projectId: string, visitId: string, input: ItemInput) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    await this.assertPhotoRefs(tx, visit.id, input.photoRefs);
    return tx.insertInto('report_items').values({
      tenant_id: scope.tenantId, visit_id: visit.id, section: input.section, text: input.text, severity: input.severity ?? null,
      addressee: input.addressee ?? null, due_date: input.dueDate ?? null, needs_verification: input.needsVerification ?? false,
      origin: input.origin ?? 'HUMAN', photo_refs: input.photoRefs ?? [], sort_order: input.sortOrder ?? 0,
    }).returning('id').executeTakeFirstOrThrow();
  }

  /** FR-M4-12: la modifica di una voce nata dall'AI la marca come AI_EDITED (tracciabilità, NFR-AI-02). */
  async updateItem(tx: Tx, scope: StudioScope, projectId: string, visitId: string, itemId: string, input: Partial<ItemInput>) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(itemId, 'Voce');
    const item = await tx.selectFrom('report_items').select(['id', 'origin', 'text']).where('id', '=', itemId).where('visit_id', '=', visit.id).executeTakeFirst();
    if (!item) throw new AppError('NOT_FOUND', 'Voce non trovata.');
    await this.assertPhotoRefs(tx, visit.id, input.photoRefs);
    const textChanged = input.text !== undefined && input.text !== item.text;
    await tx.updateTable('report_items').set({
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.addressee !== undefined ? { addressee: input.addressee } : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
      ...(input.needsVerification !== undefined ? { needs_verification: input.needsVerification } : {}),
      ...(input.photoRefs !== undefined ? { photo_refs: input.photoRefs } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(textChanged && item.origin === 'AI' ? { origin: 'AI_EDITED' as const } : {}),
    }).where('id', '=', item.id).execute();
  }

  async removeItem(tx: Tx, scope: StudioScope, projectId: string, visitId: string, itemId: string) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(itemId, 'Voce');
    await tx.deleteFrom('report_items').where('id', '=', itemId).where('visit_id', '=', visit.id).execute();
  }

  /** FR-M4-05/08: registra foto o audio (id del client) e restituisce l'URL firmato per caricarli. */
  async startMedia(tx: Tx, scope: StudioScope, projectId: string, visitId: string, kind: 'photo' | 'audio', input: MediaInput) {
    const { project, visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(input.id, kind === 'photo' ? 'Foto' : 'Audio');
    const existing = kind === 'photo'
      ? await tx.selectFrom('visit_photos').select(['id', 'upload_status']).where('id', '=', input.id).executeTakeFirst()
      : await tx.selectFrom('audio_notes').select(['id', 'upload_status']).where('id', '=', input.id).executeTakeFirst();
    if (existing?.upload_status === 'UPLOADED') return { id: input.id, uploadStatus: 'UPLOADED' as const, key: null, uploadUrl: null, uploadToken: null };
    const key = kind === 'photo'
      ? storageKeys.visitPhoto(scope.tenantId, project.id, visit.id, input.id, 'upload')
      : storageKeys.visitAudio(scope.tenantId, project.id, visit.id, input.id, 'upload');
    if (!existing && kind === 'photo') {
      const { max } = await tx.selectFrom('visit_photos').select((eb) => eb.fn.max('sort_order').as('max')).where('visit_id', '=', visit.id).executeTakeFirstOrThrow();
      await tx.insertInto('visit_photos').values({
        id: input.id, tenant_id: scope.tenantId, visit_id: visit.id, file_key: key, taken_at: input.takenAt ?? null,
        caption: input.caption ?? null, section: input.section ?? null, sort_order: Number(max ?? -1) + 1,
      }).execute();
    }
    if (!existing && kind === 'audio') {
      await tx.insertInto('audio_notes').values({
        id: input.id, tenant_id: scope.tenantId, visit_id: visit.id, file_key: key,
        recorded_at: input.takenAt ?? new Date().toISOString(), duration_sec: input.durationSec ?? null,
      }).execute();
    }
    // Ripetizione offline: se esiste già un file parziale per la chiave lo si libera prima di riemettere l'URL.
    const upload = await this.storage.createUploadUrl(key).catch(async () => {
      await this.storage.remove([key]).catch(() => undefined);
      return this.storage.createUploadUrl(key);
    });
    return { id: input.id, uploadStatus: 'PENDING' as const, key, uploadUrl: upload.url, uploadToken: upload.token };
  }

  /** Verifica il file caricato (tipo reale, dimensione) e lo marca come ricevuto dal server (BR-23). */
  async completeMedia(tx: Tx, scope: StudioScope, projectId: string, visitId: string, kind: 'photo' | 'audio', mediaId: string) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(mediaId);
    const row = kind === 'photo'
      ? await tx.selectFrom('visit_photos').select(['id', 'file_key', 'upload_status']).where('id', '=', mediaId).where('visit_id', '=', visit.id).executeTakeFirst()
      : await tx.selectFrom('audio_notes').select(['id', 'file_key', 'upload_status']).where('id', '=', mediaId).where('visit_id', '=', visit.id).executeTakeFirst();
    if (!row?.file_key) throw new AppError('NOT_FOUND', 'Elemento non trovato.');
    if (row.upload_status === 'UPLOADED') return { uploadStatus: 'UPLOADED' as const };
    const buf = await this.storage.read(row.file_key);
    const type = detectFileType(buf);
    const ok = kind === 'photo'
      ? type.kind === 'image' && type.mime !== 'image/heic' && buf.length <= PHOTO_MAX_BYTES
      : type.kind === 'audio' && buf.length <= AUDIO_MAX_BYTES;
    const mime = type.kind === 'image' || type.kind === 'audio' ? type.mime : null;
    if (kind === 'photo') {
      await tx.updateTable('visit_photos').set({ upload_status: ok ? 'UPLOADED' : 'FAILED', mime_type: mime, size_bytes: buf.length }).where('id', '=', row.id).execute();
    } else {
      await tx.updateTable('audio_notes').set({ upload_status: ok ? 'UPLOADED' : 'FAILED', mime_type: mime }).where('id', '=', row.id).execute();
    }
    if (!ok) throw new AppError('UNSUPPORTED_FILE', kind === 'photo' ? 'Foto non valida: usa JPEG, PNG o WebP fino a 25 MB.' : 'Audio non valido o troppo grande.');
    return { uploadStatus: 'UPLOADED' as const };
  }

  async updatePhoto(tx: Tx, scope: StudioScope, projectId: string, visitId: string, photoId: string, input: { caption?: string | null; section?: ReportSection | null; includeInReport?: boolean }) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(photoId, 'Foto');
    await tx.updateTable('visit_photos').set({
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.includeInReport !== undefined ? { include_in_report: input.includeInReport } : {}),
    }).where('id', '=', photoId).where('visit_id', '=', visit.id).execute();
  }

  /** FR-M4-06: nuovo ordine delle foto (la numerazione nel verbale segue questo ordine). */
  async reorderPhotos(tx: Tx, scope: StudioScope, projectId: string, visitId: string, orderedIds: string[]) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    orderedIds.forEach((id) => assertUuid(id, 'Foto'));
    const photos = await tx.selectFrom('visit_photos').select('id').where('visit_id', '=', visit.id).execute();
    if (photos.length !== orderedIds.length || !photos.every((p) => orderedIds.includes(p.id))) {
      throw new AppError('VALIDATION_FAILED', 'L’ordine deve contenere tutte le foto del sopralluogo.');
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.updateTable('visit_photos').set({ sort_order: index }).where('id', '=', id).execute();
    }
  }

  async removeMedia(tx: Tx, scope: StudioScope, projectId: string, visitId: string, kind: 'photo' | 'audio', mediaId: string) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    assertUuid(mediaId);
    const row = kind === 'photo'
      ? await tx.deleteFrom('visit_photos').where('id', '=', mediaId).where('visit_id', '=', visit.id).returning('file_key').executeTakeFirst()
      : await tx.deleteFrom('audio_notes').where('id', '=', mediaId).where('visit_id', '=', visit.id).returning('file_key').executeTakeFirst();
    if (row?.file_key) await this.storage.remove([row.file_key]).catch(() => undefined);
  }

  /**
   * FR-M4-13: finalizzazione del verbale. Condizioni:
   * - BR-23: tutte le foto e gli audio sono arrivati al server;
   * - BR-05: nessuna voce "[DA VERIFICARE]";
   * - AC-FR-M4-04-1: il DL è tra i presenti;
   * - BR-08: chi finalizza è il DL della commessa, Owner o Architetto, con iscrizione all'albo.
   * Le difformità aperte diventano azioni da verificare nel sopralluogo successivo (FR-M4-15).
   */
  async finalize(tx: Tx, scope: StudioScope, projectId: string, visitId: string, resolvedActionIds: string[], meta: RequestMeta) {
    requireRole(scope, ['OWNER', 'ARCHITECT']);
    const { project, visit } = await this.loadVisit(tx, scope, projectId, visitId);
    if (!['DRAFT', 'REVIEW'].includes(visit.status)) throw new AppError('INVALID_TRANSITION', 'Il sopralluogo non è in bozza.');
    if (visit.director_membership_id !== scope.membershipId) throw new AppError('SIGNER_NOT_QUALIFIED', 'Il verbale si firma dal Direttore dei Lavori della commessa.');
    const me = await tx.selectFrom('memberships').select(['professional_order', 'registration_number']).where('id', '=', scope.membershipId).executeTakeFirstOrThrow();
    if (!me.professional_order || !me.registration_number) {
      throw new AppError('SIGNER_NOT_QUALIFIED', 'Completa ordine professionale e numero di iscrizione nel tuo profilo per firmare.');
    }
    const pendingPhotos = await tx.selectFrom('visit_photos').select('id').where('visit_id', '=', visit.id).where('upload_status', '<>', 'UPLOADED').execute();
    const pendingAudio = await tx.selectFrom('audio_notes').select('id').where('visit_id', '=', visit.id).where('upload_status', '<>', 'UPLOADED').execute();
    const pending = [...pendingPhotos, ...pendingAudio].map((p) => p.id);
    if (pending.length) throw new AppError('SYNC_INCOMPLETE', 'Alcuni file non sono ancora arrivati: attendi la sincronizzazione.', { pending });
    const unverified = await tx.selectFrom('report_items').select('id').where('visit_id', '=', visit.id).where('needs_verification', '=', true).execute();
    if (unverified.length) throw new AppError('AI_REVIEW_PENDING', 'Ci sono voci da verificare prima di finalizzare.', { items: unverified.map((i) => i.id) });
    const director = await tx.selectFrom('visit_attendees').select('id').where('visit_id', '=', visit.id).where('is_director', '=', true).executeTakeFirst();
    if (!director) throw new AppError('VALIDATION_FAILED', 'Il Direttore dei Lavori deve essere tra i presenti.');

    const now = new Date();
    if (resolvedActionIds.length) {
      resolvedActionIds.forEach((id) => assertUuid(id, 'Azione'));
      await tx.updateTable('open_actions').set({ status: 'RESOLVED', resolved_in_visit_id: visit.id, resolved_at: now })
        .where('project_id', '=', project.id).where('id', 'in', resolvedActionIds).where('status', '=', 'OPEN').execute();
    }
    const issues = await tx.selectFrom('report_items').select(['id', 'due_date']).where('visit_id', '=', visit.id).where('section', '=', 'ISSUES').execute();
    if (issues.length) {
      await tx.insertInto('open_actions').values(issues.map((i) => ({
        tenant_id: scope.tenantId, project_id: project.id, source_item_id: i.id, source_visit_number: visit.number, due_date: i.due_date,
      }))).execute();
    }
    await tx.updateTable('site_visits').set({ status: 'FINAL', finalized_at: now, finalized_by: scope.userId, ended_at: visit.ended_at ?? now })
      .where('id', '=', visit.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'SITE_VISIT_FINALIZED',
      objectType: 'SITE_VISIT', objectId: visit.id, details: { number: visit.number, issues: issues.length, resolved: resolvedActionIds.length }, meta,
    });
    return { id: visit.id, number: visit.number, status: 'FINAL' as const };
  }

  /** BR-09: annullamento motivato (Owner o DL); il verbale resta in archivio e mantiene il numero. */
  async cancel(tx: Tx, scope: StudioScope, projectId: string, visitId: string, reason: string, meta: RequestMeta) {
    const { visit } = await this.loadVisit(tx, scope, projectId, visitId);
    if (scope.role !== 'OWNER' && visit.director_membership_id !== scope.membershipId) {
      throw new AppError('FORBIDDEN', 'Annulla il verbale l’Owner o il Direttore dei Lavori.');
    }
    if (visit.status === 'CANCELLED') throw new AppError('INVALID_TRANSITION', 'Il verbale è già annullato.');
    await tx.updateTable('site_visits').set({ status: 'CANCELLED', cancelled_at: new Date(), cancel_reason: reason }).where('id', '=', visit.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'SITE_VISIT_CANCELLED',
      objectType: 'SITE_VISIT', objectId: visit.id, details: { reason }, meta,
    });
  }
}
