import { Injectable, Logger } from '@nestjs/common';
import { imageSize } from 'image-size';
import { sql } from 'kysely';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { sha256Hex } from '../common/crypto';
import type { Tx } from '../database/database';
import { FileStorage, storageKeys } from '../storage/file-storage';
import { detectFileType, pdfHasActiveContent } from '../storage/file-type';
import { type StudioScope, assertProjectWritable, assertUuid, loadVisibleProject, requireRole } from '../studio/studio-scope';

const MANAGERS = ['OWNER', 'ARCHITECT'] as const;
const MAX_PAGES = 200;
const MAX_BYTES = 200 * 1024 * 1024; // FR-M2-01

export interface DrawingInput {
  title: string;
  sheetCode?: string | null;
  category?: string;
  phase?: string | null;
  scale?: string | null;
  clientNotes?: string | null;
  downloadAllowed?: boolean;
}

interface PageInfo {
  width: number;
  height: number;
  rotation: number;
}

/** Legge pagine e dimensioni del file; rifiuta ciò che non è un elaborato valido (TC-SEC-05). */
async function inspectFile(buf: Buffer): Promise<{ mime: string; pages: PageInfo[] }> {
  const type = detectFileType(buf);
  if (type.kind === 'pdf') {
    if (pdfHasActiveContent(buf)) throw new AppError('UNSUPPORTED_FILE', 'Il PDF contiene contenuti attivi (script) e non si può caricare.');
    const pdf = await PDFDocument.load(buf, { updateMetadata: false }).catch(() => {
      throw new AppError('UNSUPPORTED_FILE', 'Il PDF è danneggiato o protetto da password.');
    });
    const pages = pdf.getPages().map((p) => {
      const { width, height } = p.getSize();
      return { width: Math.round(width), height: Math.round(height), rotation: ((p.getRotation().angle % 360) + 360) % 360 };
    });
    if (!pages.length || pages.length > MAX_PAGES) throw new AppError('UNSUPPORTED_FILE', `Il PDF deve avere da 1 a ${MAX_PAGES} pagine.`);
    return { mime: type.mime, pages };
  }
  if (type.kind === 'image' && type.mime !== 'image/heic') {
    const size = imageSize(buf);
    if (!size.width || !size.height) throw new AppError('UNSUPPORTED_FILE', 'Immagine non leggibile.');
    return { mime: type.mime, pages: [{ width: size.width, height: size.height, rotation: 0 }] };
  }
  throw new AppError('UNSUPPORTED_FILE', 'Formato non supportato: carica un PDF o un’immagine PNG, JPEG o WebP.');
}

/** Modulo 2 lato studio: elaborati, versioni, upload e pubblicazione (FR-M2-01..05). */
@Injectable()
export class DrawingsService {
  private readonly logger = new Logger('Drawings');

  constructor(
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
  ) {}

  async list(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await tx.selectFrom('drawings as d')
      .select((eb) => [
        'd.id', 'd.title', 'd.sheet_code', 'd.category', 'd.phase', 'd.scale', 'd.download_allowed', 'd.updated_at',
        eb.selectFrom('drawing_versions as v')
          .select(sql<string>`json_build_object('id', v.id, 'number', v.number, 'status', v.status, 'publishedAt', v.published_at)`.as('j'))
          .whereRef('v.drawing_id', '=', 'd.id').where('v.status', 'not in', ['DISCARDED', 'ERROR'])
          .orderBy('v.number', 'desc').limit(1).as('latest'),
        eb.selectFrom('pins as p').innerJoin('drawing_versions as v', 'v.id', 'p.version_id')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('v.drawing_id', '=', 'd.id').where('p.status', 'in', ['OPEN', 'WAITING']).as('pins_open'),
      ])
      .where('d.project_id', '=', project.id)
      .orderBy('d.sheet_code').orderBy('d.title')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      sheetCode: r.sheet_code,
      category: r.category,
      phase: r.phase,
      scale: r.scale,
      downloadAllowed: r.download_allowed,
      latestVersion: (r.latest as unknown as { id: string; number: number; status: string; publishedAt: string | null } | null) ?? null,
      pinsOpen: Number(r.pins_open ?? 0),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async create(tx: Tx, scope: StudioScope, projectId: string, input: DrawingInput, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertProjectWritable(project);
    const row = await tx.insertInto('drawings').values({
      tenant_id: scope.tenantId, project_id: project.id, title: input.title, sheet_code: input.sheetCode ?? null,
      category: input.category ?? 'OTHER', phase: input.phase ?? null, scale: input.scale ?? null,
      client_notes: input.clientNotes ?? null, download_allowed: input.downloadAllowed ?? false, created_by: scope.userId,
    }).returning('id').executeTakeFirstOrThrow();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_CREATED',
      objectType: 'DRAWING', objectId: row.id, details: { projectId: project.id }, meta,
    });
    return row;
  }

  async loadDrawing(tx: Tx, scope: StudioScope, projectId: string, drawingId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(drawingId, 'Elaborato');
    const drawing = await tx.selectFrom('drawings').selectAll().where('id', '=', drawingId).where('project_id', '=', project.id).executeTakeFirst();
    if (!drawing) throw new AppError('NOT_FOUND', 'Elaborato non trovato.');
    return { project, drawing };
  }

  async update(tx: Tx, scope: StudioScope, projectId: string, drawingId: string, input: Partial<DrawingInput>, meta: RequestMeta) {
    const { drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    await tx.updateTable('drawings').set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.sheetCode !== undefined ? { sheet_code: input.sheetCode } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
      ...(input.clientNotes !== undefined ? { client_notes: input.clientNotes } : {}),
      ...(input.downloadAllowed !== undefined ? { download_allowed: input.downloadAllowed } : {}),
    }).where('id', '=', drawing.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_UPDATED',
      objectType: 'DRAWING', objectId: drawing.id, details: { fields: Object.keys(input) }, meta,
    });
  }

  /** FR-M2-01/03: nuova versione (numero atomico, BR-18) + URL firmato per caricare il file dal browser. */
  async startUpload(tx: Tx, scope: StudioScope, projectId: string, drawingId: string, revisionNote: string | null, meta: RequestMeta) {
    const { project, drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    assertProjectWritable(project);
    const result = await sql<{ n: number }>`select app.next_drawing_version_number(${drawing.id}::uuid) as n`.execute(tx);
    const n = result.rows[0]?.n;
    if (!n) throw new AppError('INTERNAL_ERROR', 'Numerazione della versione non riuscita.');
    const key = storageKeys.drawingOriginal(scope.tenantId, project.id, drawing.id, n, 'upload');
    const version = await tx.insertInto('drawing_versions').values({
      tenant_id: scope.tenantId, drawing_id: drawing.id, number: n, status: 'PROCESSING',
      original_file_key: key, revision_note: revisionNote, uploaded_by: scope.userId,
    }).returning('id').executeTakeFirstOrThrow();
    const upload = await this.storage.createUploadUrl(key);
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_VERSION_STARTED',
      objectType: 'DRAWING_VERSION', objectId: version.id, details: { drawingId: drawing.id, number: n }, meta,
    });
    return { versionId: version.id, number: n, key, uploadUrl: upload.url, uploadToken: upload.token, maxBytes: MAX_BYTES };
  }

  /**
   * FR-M2-02: a upload finito il server verifica il file (tipo reale, contenuti attivi),
   * calcola SHA-256 e pagine, e porta la versione in Bozza. Se il file non è valido → Errore.
   */
  async completeUpload(tx: Tx, scope: StudioScope, projectId: string, drawingId: string, versionId: string, meta: RequestMeta) {
    const { drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    assertUuid(versionId, 'Versione');
    const version = await tx.selectFrom('drawing_versions').selectAll()
      .where('id', '=', versionId).where('drawing_id', '=', drawing.id).executeTakeFirst();
    if (!version || version.status !== 'PROCESSING' || !version.original_file_key) {
      throw new AppError('INVALID_TRANSITION', 'Questa versione non è in attesa di caricamento.');
    }
    const buf = await this.storage.read(version.original_file_key);
    try {
      if (buf.length > MAX_BYTES) throw new AppError('UNSUPPORTED_FILE', 'Il file supera i 200 MB.');
      const info = await inspectFile(buf);
      await tx.updateTable('drawing_versions').set({
        status: 'DRAFT', mime_type: info.mime, size_bytes: buf.length, sha256: sha256Hex(buf), page_count: info.pages.length,
      }).where('id', '=', version.id).execute();
      await tx.insertInto('drawing_pages').values(info.pages.map((p, index) => ({
        tenant_id: scope.tenantId, version_id: version.id, page_index: index,
        width_px: p.width, height_px: p.height, rotation: p.rotation,
      }))).execute();
      await this.audit.record(tx, {
        tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_VERSION_READY',
        objectType: 'DRAWING_VERSION', objectId: version.id, details: { pages: info.pages.length, mime: info.mime }, meta,
      });
      return { status: 'DRAFT' as const, pageCount: info.pages.length };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await tx.updateTable('drawing_versions').set({ status: 'ERROR', error_message: error.message }).where('id', '=', version.id).execute();
      await this.audit.record(tx, {
        tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_UPLOAD_REJECTED',
        objectType: 'DRAWING_VERSION', objectId: version.id, outcome: 'FAILURE', details: { reason: error.message }, meta,
      });
      this.logger.warn(`Upload rifiutato (${version.id}): ${error.message}`);
      return { status: 'ERROR' as const, error: error.message };
    }
  }

  /**
   * FR-M2-04: pubblicazione di una o più bozze. La versione pubblicata precedente dello stesso
   * elaborato diventa Superata (e si congela, SM-ELABORATO). Restituisce ciò che serve per
   * inviare UNA sola email ai committenti (AC-FR-M2-04-1).
   */
  async publish(tx: Tx, scope: StudioScope, projectId: string, versionIds: string[], reviewDueDate: string | null, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    assertProjectWritable(project);
    versionIds.forEach((id) => assertUuid(id, 'Versione'));
    const versions = await tx.selectFrom('drawing_versions as v')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .select(['v.id', 'v.drawing_id', 'v.number', 'v.status', 'd.title', 'd.sheet_code'])
      .where('v.id', 'in', versionIds).where('d.project_id', '=', project.id).execute();
    if (versions.length !== new Set(versionIds).size) throw new AppError('NOT_FOUND', 'Versione non trovata.');
    const notDraft = versions.find((v) => v.status !== 'DRAFT');
    if (notDraft) throw new AppError('INVALID_TRANSITION', `La versione ${notDraft.number} di "${notDraft.title}" non è una bozza.`);
    if (new Set(versions.map((v) => v.drawing_id)).size !== versions.length) {
      throw new AppError('VALIDATION_FAILED', 'Si pubblica una sola versione per elaborato alla volta.');
    }

    const now = new Date();
    for (const v of versions) {
      await tx.updateTable('drawing_versions').set({ status: 'SUPERSEDED' })
        .where('drawing_id', '=', v.drawing_id).where('status', '=', 'PUBLISHED').execute();
      await tx.updateTable('drawing_versions')
        .set({ status: 'PUBLISHED', published_at: now, published_by: scope.userId, review_due_date: reviewDueDate })
        .where('id', '=', v.id).execute();
      await this.audit.record(tx, {
        tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_VERSION_PUBLISHED',
        objectType: 'DRAWING_VERSION', objectId: v.id, details: { drawingId: v.drawing_id, number: v.number }, meta,
      });
    }
    return {
      project: { id: project.id, title: project.title, code: project.code },
      drawings: versions.map((v) => ({ title: v.title, sheetCode: v.sheet_code, number: v.number })),
    };
  }

  /** SM-ELABORATO: Pubblicata → Bozza solo se il committente non ha ancora lasciato pin. */
  async withdraw(tx: Tx, scope: StudioScope, projectId: string, drawingId: string, versionId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const { drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    assertUuid(versionId, 'Versione');
    const clientPin = await tx.selectFrom('pins').select('id')
      .where('version_id', '=', versionId).where('author_type', '=', 'CLIENT').executeTakeFirst();
    if (clientPin) throw new AppError('INVALID_TRANSITION', 'Il committente ha già commentato questa versione: pubblica una nuova versione.');
    const updated = await tx.updateTable('drawing_versions').set({ status: 'DRAFT', published_at: null, published_by: null })
      .where('id', '=', versionId).where('drawing_id', '=', drawing.id).where('status', '=', 'PUBLISHED')
      .returning('id').executeTakeFirst();
    if (!updated) throw new AppError('INVALID_TRANSITION', 'Si ritira solo una versione pubblicata.');
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_VERSION_WITHDRAWN',
      objectType: 'DRAWING_VERSION', objectId: versionId, meta,
    });
  }

  /** Solo le bozze (o le versioni in errore) si scartano; il numero resta "bruciato" (BR-18). */
  async discard(tx: Tx, scope: StudioScope, projectId: string, drawingId: string, versionId: string, meta: RequestMeta) {
    const { drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    assertUuid(versionId, 'Versione');
    const version = await tx.selectFrom('drawing_versions').select(['id', 'status', 'uploaded_by'])
      .where('id', '=', versionId).where('drawing_id', '=', drawing.id).executeTakeFirst();
    if (!version) throw new AppError('NOT_FOUND', 'Versione non trovata.');
    if (scope.role === 'COLLABORATOR' && version.uploaded_by !== scope.userId) {
      throw new AppError('FORBIDDEN', 'Puoi scartare solo le bozze che hai caricato.');
    }
    if (version.status === 'PROCESSING') {
      await tx.updateTable('drawing_versions').set({ status: 'ERROR', error_message: 'Caricamento annullato' }).where('id', '=', version.id).execute();
    }
    await tx.updateTable('drawing_versions').set({ status: 'DISCARDED' }).where('id', '=', version.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DRAWING_VERSION_DISCARDED',
      objectType: 'DRAWING_VERSION', objectId: version.id, meta,
    });
  }

  async versions(tx: Tx, scope: StudioScope, projectId: string, drawingId: string) {
    const { drawing } = await this.loadDrawing(tx, scope, projectId, drawingId);
    const rows = await tx.selectFrom('drawing_versions').selectAll()
      .where('drawing_id', '=', drawing.id).where('status', '<>', 'DISCARDED').orderBy('number', 'desc').execute();
    return rows.map((v) => ({
      id: v.id, number: v.number, status: v.status, mimeType: v.mime_type, sizeBytes: v.size_bytes ? Number(v.size_bytes) : null,
      sha256: v.sha256, pageCount: v.page_count, revisionNote: v.revision_note, errorMessage: v.error_message,
      uploadedAt: new Date(v.uploaded_at).toISOString(),
      publishedAt: v.published_at ? new Date(v.published_at).toISOString() : null,
      reviewDueDate: v.review_due_date,
      frozenAt: v.frozen_at ? new Date(v.frozen_at).toISOString() : null,
    }));
  }

  /** FR-M2-18: URL firmato a 5 minuti per vedere o scaricare il file della versione. */
  async fileUrl(tx: Tx, versionId: string, projectId: string, download: boolean) {
    assertUuid(versionId, 'Versione');
    const v = await tx.selectFrom('drawing_versions as v').innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .select(['v.original_file_key', 'v.status', 'v.number', 'v.mime_type', 'd.title'])
      .where('v.id', '=', versionId).where('d.project_id', '=', projectId).executeTakeFirst();
    if (!v?.original_file_key || ['PROCESSING', 'ERROR', 'DISCARDED'].includes(v.status)) throw new AppError('NOT_FOUND', 'File non disponibile.');
    const ext = v.mime_type === 'application/pdf' ? 'pdf' : (v.mime_type?.split('/')[1] ?? 'bin');
    const name = download ? `${v.title.replace(/[^\w\- ]+/g, '').trim() || 'elaborato'}_v${v.number}.${ext}` : undefined;
    return { url: await this.storage.createDownloadUrl(v.original_file_key, 300, name), mimeType: v.mime_type, expiresInSec: 300 };
  }
}
