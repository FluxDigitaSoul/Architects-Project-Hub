import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { newVerificationCode, sha256Hex } from '../common/crypto';
import type { Tx } from '../database/database';
import type { DocumentsTable } from '../database/schema';
import { Mailer, brandedHtml } from '../mail/mailer';
import { loadStudioIdentity } from '../portal/magic-link.service';
import { FileStorage, storageKeys } from '../storage/file-storage';
import { detectFileType } from '../storage/file-type';
import { type StudioScope, assertUuid, loadVisibleProject, requireRole } from '../studio/studio-scope';
import { DocumentData } from './document-data';
import { renderApprovalSummary } from './pdf/approval-summary.pdf';
import { blockingRooms, renderRaiReport } from './pdf/rai-report.pdf';
import { renderSiteReport } from './pdf/site-report.pdf';

type DocType = DocumentsTable['type'];
const ATTACHMENT_LIMIT = 10 * 1024 * 1024; // FR-M5-05: oltre 10 MB si invia un link
const LINK_TTL_SEC = 7 * 24 * 60 * 60; // FR-M5-05: link valido 7 giorni
const TYPE_PREFIX: Record<DocType, string> = {
  SITE_REPORT: 'Verbale', RAI_REPORT: 'Relazione-RAI', RAI_CHECK: 'Report-RAI', APPROVAL_SUMMARY: 'Approvazione', PIN_EXPORT: 'Commenti', UPLOAD: 'Documento',
};

/** Nome file FR-M5-00: {tipo}_{codiceCommessa}_{numero}_{aaaammgg}.pdf */
export function documentFileName(type: DocType, projectCode: string, number: string, date: Date): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '-');
  return `${TYPE_PREFIX[type]}_${safe(projectCode)}_${safe(number)}_${ymd}.pdf`;
}

/** PAdES: la firma è un aggiornamento incrementale, quindi i byte originali restano in testa al file firmato. */
export function signedMatchesOriginal(original: Buffer, signed: Buffer): boolean {
  if (signed.length <= original.length || !signed.subarray(0, original.length).equals(original)) return false;
  const tail = signed.subarray(original.length).toString('latin1');
  return /\/ByteRange\s*\[/.test(tail) && /\/Type\s*\/Sig\b|\/SubFilter\s*\/(ETSI\.CAdES\.detached|adbe\.pkcs7\.detached)/.test(tail);
}

interface StoreInput {
  projectId: string;
  projectCode: string;
  type: DocType;
  number: string;
  revision: number;
  revisionReason: string | null;
  title: string;
  status: 'DRAFT' | 'FINAL';
  sourceType: DocumentsTable['source_type'];
  sourceId: string;
  signerMembershipId: string | null;
  date: Date;
}

type RenderMeta = { documentId: string; verificationCode: string | null; date: Date; author: string; subject: string };
type DocRow = Awaited<ReturnType<DocumentsService['load']>>;

/** Archivio documentale (FR-M5-02..05, FR-M1-07, BR-06, BR-08, BR-09). */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger('Documents');

  constructor(
    private readonly data: DocumentData,
    private readonly storage: FileStorage,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  private async store(tx: Tx, tenantId: string, actorId: string | null, doc: StoreInput, render: (m: RenderMeta) => Promise<Buffer>, meta?: RequestMeta) {
    const id = randomUUID();
    const verificationCode = doc.status === 'FINAL' ? newVerificationCode() : null;
    const studio = await loadStudioIdentity(tx, tenantId);
    const pdf = await render({ documentId: `${doc.number} Rev. ${doc.revision}`, verificationCode, date: doc.date, author: studio.name, subject: doc.title });
    const key = storageKeys.document(tenantId, doc.projectId, id, doc.revision);
    await this.storage.write(key, pdf, 'application/pdf');
    const sha256 = sha256Hex(pdf);
    const fileName = documentFileName(doc.type, doc.projectCode, doc.number, doc.date);
    await tx.insertInto('documents').values({
      id, tenant_id: tenantId, project_id: doc.projectId, type: doc.type, number: doc.number, revision: doc.revision,
      revision_reason: doc.revisionReason, title: doc.title, status: doc.status, file_key: key, file_name: fileName,
      size_bytes: pdf.length, sha256, verification_code: verificationCode, source_type: doc.sourceType,
      source_id: doc.sourceId, signer_membership_id: doc.signerMembershipId, created_by: actorId,
    }).execute();
    await this.audit.record(tx, {
      tenantId, actorType: actorId ? 'USER' : 'SYSTEM', actorId, action: 'DOCUMENT_GENERATED', objectType: 'DOCUMENT', objectId: id,
      details: { type: doc.type, number: doc.number, revision: doc.revision, sha256 }, meta,
    });
    return { id, fileName, sizeBytes: pdf.length, verificationCode, existing: false };
  }

  /** Il documento definitivo archiviato resta la fonte di verità: se esiste, si restituisce quello (FR-M5-04). */
  private existing(tx: Tx, sourceType: DocumentsTable['source_type'], sourceId: string, type: DocType) {
    return tx.selectFrom('documents').select(['id']).where('source_type', '=', sourceType).where('source_id', '=', sourceId)
      .where('type', '=', type).where('status', 'in', ['FINAL', 'SIGNED']).executeTakeFirst();
  }

  /** Testi dei documenti impostati dallo studio (FR-M0-05); la RLS limita la riga al tenant corrente. */
  private async documentTexts(tx: Tx): Promise<{ attestationTemplate?: string; closingFormula?: string }> {
    const branding = await tx.selectFrom('tenant_branding').select('document_settings').executeTakeFirst();
    return (branding?.document_settings ?? {}) as { attestationTemplate?: string; closingFormula?: string };
  }

  /** FR-M5-01: verbale di sopralluogo, firmato dal DL (BR-08). */
  async generateSiteReport(tx: Tx, scope: StudioScope, projectId: string, visitId: string, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(visitId, 'Sopralluogo');
    const visit = await tx.selectFrom('site_visits').select(['id']).where('id', '=', visitId).where('project_id', '=', project.id).executeTakeFirst();
    if (!visit) throw new AppError('NOT_FOUND', 'Sopralluogo non trovato.');
    const found = await this.existing(tx, 'SITE_VISIT', visit.id, 'SITE_REPORT');
    if (found) return { id: found.id, existing: true };
    const src = await this.data.siteReport(tx, visit.id, (await this.documentTexts(tx)).closingFormula ?? null);
    await this.data.assertQualifiedSigner(tx, src.directorMembershipId);
    const letterhead = await this.data.letterhead(tx, scope.tenantId);
    return this.store(tx, scope.tenantId, scope.userId, {
      projectId: project.id, projectCode: project.code, type: 'SITE_REPORT', number: `VS-${String(src.number).padStart(2, '0')}`,
      revision: 0, revisionReason: null, title: `Verbale di sopralluogo n. ${src.number}`, status: 'FINAL',
      sourceType: 'SITE_VISIT', sourceId: visit.id, signerMembershipId: src.directorMembershipId, date: src.date,
    }, (m) => renderSiteReport({ ...m, projectCode: project.code, keywords: ['verbale', 'sopralluogo', project.code] }, letterhead, src.data), meta);
  }

  /**
   * FR-M5-20/21: relazione asseverativa solo se BR-06 è soddisfatta e il firmatario è abilitato (BR-08);
   * il report di verifica (bozza con filigrana) è sempre disponibile e sostituisce il precedente dello stesso calcolo.
   */
  async generateRaiReport(tx: Tx, scope: StudioScope, projectId: string, snapshotId: string, variant: 'ATTESTATION' | 'CHECK', meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(snapshotId, 'Revisione');
    const snapshot = await tx.selectFrom('rai_snapshots').select(['id']).where('id', '=', snapshotId).where('project_id', '=', project.id).executeTakeFirst();
    if (!snapshot) throw new AppError('NOT_FOUND', 'Revisione del calcolo non trovata.');
    const attestation = variant === 'ATTESTATION';
    if (attestation) {
      requireRole(scope, ['OWNER', 'ARCHITECT']);
      const found = await this.existing(tx, 'RAI_SNAPSHOT', snapshot.id, 'RAI_REPORT');
      if (found) return { id: found.id, existing: true };
    }
    const signer = attestation ? await this.data.assertQualifiedSigner(tx, scope.membershipId) : await this.data.signer(tx, scope.membershipId);
    const src = await this.data.raiReport(tx, snapshot.id, variant, signer, (await this.documentTexts(tx)).attestationTemplate ?? null);
    if (attestation) {
      const blocking = blockingRooms(src.data);
      if (blocking.length) {
        throw new AppError('RAI_NOT_ATTESTABLE', 'Alcuni vani impediscono la relazione asseverativa: genera il report di verifica o correggi i dati.', { rooms: blocking });
      }
    } else {
      const previous = await tx.deleteFrom('documents').where('source_id', '=', snapshot.id).where('type', '=', 'RAI_CHECK')
        .where('status', '=', 'DRAFT').returning('file_key').execute();
      const keys = previous.map((p) => p.file_key).filter((k): k is string => Boolean(k));
      if (keys.length) await this.storage.remove(keys).catch(() => undefined);
    }
    const letterhead = await this.data.letterhead(tx, scope.tenantId);
    return this.store(tx, scope.tenantId, scope.userId, {
      projectId: project.id, projectCode: project.code, type: attestation ? 'RAI_REPORT' : 'RAI_CHECK',
      number: attestation ? 'RAI' : `RAI-V${src.revision}`, revision: attestation ? src.revision : 0,
      revisionReason: attestation ? src.reason : null,
      title: attestation ? `Relazione tecnica R.A.I. — Rev. ${src.revision}` : `Report di verifica R.A.I. (calcolo Rev. ${src.revision})`,
      status: attestation ? 'FINAL' : 'DRAFT', sourceType: 'RAI_SNAPSHOT', sourceId: snapshot.id,
      signerMembershipId: attestation ? signer.membershipId : null, date: src.date,
    }, (m) => renderRaiReport({ ...m, projectCode: project.code, keywords: ['R.A.I.', 'rapporti aeroilluminanti', project.code] }, letterhead, src.data), meta);
  }

  /** FR-M5-10: riepilogo di approvazione, generato subito dopo il sign-off (attore di sistema). */
  async generateApprovalSummary(tx: Tx, tenantId: string, approvalId: string, actorUserId: string | null) {
    const found = await this.existing(tx, 'APPROVAL', approvalId, 'APPROVAL_SUMMARY');
    if (found) return { id: found.id, existing: true };
    const src = await this.data.approvalSummary(tx, approvalId);
    const project = await tx.selectFrom('projects').select('code').where('id', '=', src.projectId).executeTakeFirstOrThrow();
    const letterhead = await this.data.letterhead(tx, tenantId);
    const { n } = await tx.selectFrom('documents').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', src.projectId).where('type', '=', 'APPROVAL_SUMMARY').executeTakeFirstOrThrow();
    return this.store(tx, tenantId, actorUserId, {
      projectId: src.projectId, projectCode: project.code, type: 'APPROVAL_SUMMARY', number: `AP-${String(Number(n) + 1).padStart(2, '0')}`,
      revision: 0, revisionReason: null, title: `Approvazione — ${src.drawingTitle} v${src.versionNumber}`, status: 'FINAL',
      sourceType: 'APPROVAL', sourceId: approvalId, signerMembershipId: null, date: src.date,
    }, (m) => renderApprovalSummary({ ...m, projectCode: project.code, keywords: ['approvazione', project.code] }, letterhead, src.data));
  }

  dto(d: DocRow) {
    return {
      id: d.id, type: d.type, number: d.number, revision: d.revision, revisionReason: d.revision_reason, title: d.title, status: d.status,
      fileName: d.file_name, sizeBytes: d.size_bytes === null ? null : Number(d.size_bytes), sha256: d.sha256, verificationCode: d.verification_code,
      signed: Boolean(d.signed_file_key), signedAt: d.signed_at ? new Date(d.signed_at).toISOString() : null,
      cancelledAt: d.cancelled_at ? new Date(d.cancelled_at).toISOString() : null, cancelReason: d.cancel_reason,
      sharedWithClient: d.shared_with_client, createdAt: new Date(d.created_at).toISOString(),
    };
  }

  async list(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const rows = await tx.selectFrom('documents').selectAll().where('project_id', '=', project.id).orderBy('created_at', 'desc').execute();
    return rows.map((d) => this.dto(d));
  }

  /**
   * Archivio documentale dello studio (FR-M5-06): documenti di tutte le commesse visibili,
   * con filtri per tipo, stato e ricerca su titolo, numero o commessa. I Collaboratori vedono solo le assegnate.
   */
  async listStudio(tx: Tx, scope: StudioScope, filter: { type?: string; status?: string; q?: string }) {
    let query = tx.selectFrom('documents as d').innerJoin('projects as p', 'p.id', 'd.project_id')
      .selectAll('d').select(['p.code as project_code', 'p.title as project_title'])
      .where('p.status', '<>', 'ARCHIVED');
    if (scope.role === 'COLLABORATOR') {
      query = query.where((eb) => eb.exists(
        eb.selectFrom('project_assignments as pa').select('pa.id').whereRef('pa.project_id', '=', 'p.id')
          .where('pa.membership_id', '=', scope.membershipId).where('pa.valid_to', 'is', null),
      ));
    }
    if (filter.type) query = query.where('d.type', '=', filter.type as DocRow['type']);
    if (filter.status) query = query.where('d.status', '=', filter.status as DocRow['status']);
    if (filter.q) {
      const like = `%${filter.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) => eb.or([eb('d.title', 'ilike', like), eb('d.number', 'ilike', like), eb('p.code', 'ilike', like), eb('p.title', 'ilike', like)]));
    }
    const rows = await query.orderBy('d.created_at', 'desc').limit(200).execute();
    return rows.map((r) => ({ ...this.dto(r), projectId: r.project_id, projectCode: r.project_code, projectTitle: r.project_title }));
  }

  async load(tx: Tx, projectId: string, documentId: string) {
    assertUuid(documentId, 'Documento');
    const doc = await tx.selectFrom('documents').selectAll().where('id', '=', documentId).where('project_id', '=', projectId).executeTakeFirst();
    if (!doc) throw new AppError('NOT_FOUND', 'Documento non trovato.');
    return doc;
  }

  /** Contenuto da scaricare: versione firmata se presente; se annullato, con filigrana "ANNULLATO" e motivo (FR-M5-00). */
  async content(doc: DocRow): Promise<Buffer> {
    const key = doc.signed_file_key ?? doc.file_key;
    if (!key) throw new AppError('NOT_FOUND', 'File non disponibile.');
    const original = await this.storage.read(key);
    if (doc.status !== 'CANCELLED') return original;
    const pdf = await PDFDocument.load(original, { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    const date = doc.cancelled_at ? new Date(doc.cancelled_at).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '';
    const reason = (doc.cancel_reason ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    pdf.getPages().forEach((page, i) => {
      const { width, height } = page.getSize();
      page.drawText('ANNULLATO', { x: width * 0.18, y: height * 0.35, size: 72, font, color: rgb(0.75, 0.1, 0.1), opacity: 0.3, rotate: degrees(35) });
      if (i === 0) page.drawText(`Documento annullato il ${date}. Motivo: ${reason}`.slice(0, 160), { x: 40, y: height - 28, size: 8, font: small, color: rgb(0.75, 0.1, 0.1) });
    });
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }

  /** FR-M2-18: URL firmato a 5 minuti; per i documenti annullati si scarica il contenuto con filigrana. */
  async downloadUrl(tx: Tx, scope: StudioScope, projectId: string, documentId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    const key = doc.signed_file_key ?? doc.file_key;
    if (doc.status === 'CANCELLED' || !key) return { url: null, expiresInSec: 0 };
    return { url: await this.storage.createDownloadUrl(key, 300, doc.file_name ?? 'documento.pdf'), expiresInSec: 300 };
  }

  /** BR-09: si annulla con motivazione (Owner o firmatario); il documento resta in archivio. Le bozze si eliminano. */
  async cancel(tx: Tx, scope: StudioScope, projectId: string, documentId: string, reason: string, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    if (scope.role !== 'OWNER' && doc.signer_membership_id !== scope.membershipId && doc.status !== 'DRAFT') {
      throw new AppError('FORBIDDEN', 'Annulla il documento l’Owner o il firmatario.');
    }
    if (doc.status === 'CANCELLED') throw new AppError('INVALID_TRANSITION', 'Il documento è già annullato.');
    if (doc.status === 'DRAFT') {
      await tx.deleteFrom('documents').where('id', '=', doc.id).execute();
      if (doc.file_key) await this.storage.remove([doc.file_key]).catch(() => undefined);
    } else {
      await tx.updateTable('documents')
        .set({ status: 'CANCELLED', cancelled_at: new Date(), cancel_reason: reason, cancelled_by: scope.userId, shared_with_client: false })
        .where('id', '=', doc.id).execute();
      if (doc.type === 'SITE_REPORT' && doc.source_id) {
        await tx.updateTable('site_visits').set({ status: 'CANCELLED', cancelled_at: new Date(), cancel_reason: reason })
          .where('id', '=', doc.source_id).where('status', 'in', ['FINAL', 'SENT']).execute();
      }
    }
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: doc.status === 'DRAFT' ? 'DOCUMENT_DELETED' : 'DOCUMENT_CANCELLED',
      objectType: 'DOCUMENT', objectId: doc.id, details: { reason }, meta,
    });
  }

  /** FR-M5-02: URL firmato per caricare il PDF firmato digitalmente (PAdES) dal professionista. */
  async startSignedUpload(tx: Tx, scope: StudioScope, projectId: string, documentId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    if (doc.status !== 'FINAL') throw new AppError('INVALID_TRANSITION', 'Si firma digitalmente solo un documento definitivo non ancora firmato.');
    if (doc.signer_membership_id && doc.signer_membership_id !== scope.membershipId && scope.role !== 'OWNER') {
      throw new AppError('SIGNER_NOT_QUALIFIED', 'Il documento va firmato dal professionista indicato come firmatario.');
    }
    const key = storageKeys.document(scope.tenantId, project.id, doc.id, doc.revision, `-signed-${Date.now()}`);
    const upload = await this.storage.createUploadUrl(key);
    return { uploadUrl: upload.url, uploadToken: upload.token, key };
  }

  /** Verifica che il PDF firmato contenga esattamente il documento generato e lo archivia come "Firmato digitalmente". */
  async completeSignedUpload(tx: Tx, scope: StudioScope, projectId: string, documentId: string, key: string, meta: RequestMeta) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    const prefix = storageKeys.document(scope.tenantId, project.id, doc.id, doc.revision, '-signed-').replace(/\.pdf$/, '');
    if (!key.startsWith(prefix) || !key.endsWith('.pdf') || key.includes('..')) throw new AppError('NOT_FOUND', 'File non trovato.');
    if (doc.status !== 'FINAL' || !doc.file_key) throw new AppError('INVALID_TRANSITION', 'Il documento non è in attesa di firma.');
    const original = await this.storage.read(doc.file_key);
    const signed = await this.storage.read(key);
    if (detectFileType(signed).kind !== 'pdf' || !signedMatchesOriginal(original, signed)) {
      await this.storage.remove([key]).catch(() => undefined);
      await this.audit.record(tx, {
        tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DOCUMENT_SIGNATURE_REJECTED',
        objectType: 'DOCUMENT', objectId: doc.id, outcome: 'FAILURE', meta,
      });
      throw new AppError('SIGNATURE_MISMATCH', 'Il PDF caricato non corrisponde al documento generato o non contiene una firma PAdES.');
    }
    const signedSha = sha256Hex(signed);
    await tx.updateTable('documents').set({ status: 'SIGNED', signed_file_key: key, signed_sha256: signedSha, signed_at: new Date() }).where('id', '=', doc.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'DOCUMENT_SIGNED',
      objectType: 'DOCUMENT', objectId: doc.id, details: { signedSha256: signedSha }, meta,
    });
    return { status: 'SIGNED' as const, signedSha256: signedSha };
  }

  /** FR-M1-07: condivisione esplicita e revocabile con il committente (solo documenti definitivi o firmati). */
  async share(tx: Tx, scope: StudioScope, projectId: string, documentId: string, shared: boolean, meta: RequestMeta) {
    requireRole(scope, ['OWNER', 'ARCHITECT']);
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    if (shared && !['FINAL', 'SIGNED'].includes(doc.status)) throw new AppError('INVALID_TRANSITION', 'Si condividono solo documenti definitivi.');
    await tx.updateTable('documents').set({ shared_with_client: shared }).where('id', '=', doc.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: shared ? 'DOCUMENT_SHARED' : 'DOCUMENT_UNSHARED',
      objectType: 'DOCUMENT', objectId: doc.id, meta,
    });
  }

  /**
   * FR-M5-05: invio via email (allegato fino a 10 MB, altrimenti link a 7 giorni) oppure registrazione
   * di un invio PEC fatto a mano. Nessun tracciamento della lettura.
   */
  async send(
    tx: Tx, scope: StudioScope, projectId: string, documentId: string,
    input: { recipients: Array<{ email: string; name?: string }>; message?: string | null; channel: 'EMAIL' | 'MANUAL_PEC' }, meta: RequestMeta,
  ) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    if (!['FINAL', 'SIGNED'].includes(doc.status)) throw new AppError('INVALID_TRANSITION', 'Si inviano solo documenti definitivi.');
    if (input.channel === 'MANUAL_PEC') {
      const at = new Date().toISOString();
      await tx.insertInto('document_deliveries').values({
        tenant_id: scope.tenantId, document_id: doc.id, recipients: JSON.stringify(input.recipients), channel: 'MANUAL_PEC',
        message: input.message ?? null, sent_by: scope.userId,
        delivery_status: JSON.stringify(input.recipients.map((r) => ({ email: r.email, status: 'RECORDED', at }))),
      }).execute();
      return { channel: 'MANUAL_PEC' as const, deliveries: input.recipients.map((r) => ({ email: r.email, status: 'RECORDED', at })) };
    }
    return this.deliverEmail(tx, scope.tenantId, scope.userId, project, doc, input, meta);
  }

  /** Invio automatico dal sistema (es. riepilogo di approvazione a committente e studio, mitigazione R-07). */
  async sendAsSystem(tx: Tx, tenantId: string, documentId: string, recipients: Array<{ email: string; name?: string }>) {
    const doc = await tx.selectFrom('documents').selectAll().where('id', '=', documentId).executeTakeFirstOrThrow();
    const project = await tx.selectFrom('projects').select(['code', 'title']).where('id', '=', doc.project_id).executeTakeFirstOrThrow();
    return this.deliverEmail(tx, tenantId, null, project, doc, { recipients });
  }

  private async deliverEmail(
    tx: Tx, tenantId: string, actorId: string | null, project: { code: string; title: string }, doc: DocRow,
    input: { recipients: Array<{ email: string; name?: string }>; message?: string | null }, meta?: RequestMeta,
  ) {
    const content = await this.content(doc);
    const studio = await loadStudioIdentity(tx, tenantId);
    const asAttachment = content.length <= ATTACHMENT_LIMIT;
    const key = doc.signed_file_key ?? doc.file_key;
    const link = asAttachment || !key ? null : await this.storage.createDownloadUrl(key, LINK_TTL_SEC, doc.file_name ?? 'documento.pdf');
    const paragraphs = [
      `${studio.name} ti invia il documento "${doc.title}" relativo alla commessa ${project.code} — ${project.title}.`,
      ...(input.message ? [input.message] : []),
      asAttachment ? 'Trovi il documento in allegato.' : 'Il documento è scaricabile dal link qui sotto per 7 giorni.',
      ...(doc.verification_code ? [`Codice di verifica del documento: ${doc.verification_code}.`] : []),
    ];
    const statuses: Array<{ email: string; status: string; at: string }> = [];
    for (const r of input.recipients) {
      try {
        await this.mailer.send({
          to: [r.email], subject: `${studio.name} — ${doc.title}`, senderName: studio.name, replyTo: studio.email,
          text: `${r.name ? `Gentile ${r.name},\n\n` : ''}${paragraphs.join('\n\n')}${link ? `\n\n${link}` : ''}`,
          html: brandedHtml({ studioName: studio.name, primaryColor: studio.primaryColor, title: doc.title, paragraphs, ...(link ? { cta: { label: 'Scarica il documento', url: link } } : {}) }),
          ...(asAttachment ? { attachments: [{ filename: doc.file_name ?? 'documento.pdf', content, contentType: 'application/pdf' }] } : {}),
        });
        statuses.push({ email: r.email, status: 'ACCEPTED', at: new Date().toISOString() });
      } catch (error) {
        this.logger.warn(`Invio documento non riuscito: ${(error as Error).message}`);
        statuses.push({ email: r.email, status: 'FAILED', at: new Date().toISOString() });
      }
    }
    const channel = asAttachment ? 'EMAIL_ATTACHMENT' as const : 'EMAIL_LINK' as const;
    await tx.insertInto('document_deliveries').values({
      tenant_id: tenantId, document_id: doc.id, recipients: JSON.stringify(input.recipients), channel,
      message: input.message ?? null, sent_by: actorId, delivery_status: JSON.stringify(statuses),
      link_expires_at: link ? new Date(Date.now() + LINK_TTL_SEC * 1000) : null,
    }).execute();
    if (doc.type === 'SITE_REPORT' && doc.source_id && statuses.some((s) => s.status === 'ACCEPTED')) {
      await tx.updateTable('site_visits').set({ status: 'SENT' }).where('id', '=', doc.source_id).where('status', '=', 'FINAL').execute();
    }
    await this.audit.record(tx, {
      tenantId, actorType: actorId ? 'USER' : 'SYSTEM', actorId, action: 'DOCUMENT_SENT', objectType: 'DOCUMENT', objectId: doc.id,
      details: { channel, recipients: statuses }, meta,
    });
    return { channel, deliveries: statuses };
  }

  async deliveries(tx: Tx, scope: StudioScope, projectId: string, documentId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    const doc = await this.load(tx, project.id, documentId);
    const rows = await tx.selectFrom('document_deliveries').selectAll().where('document_id', '=', doc.id).orderBy('sent_at', 'desc').execute();
    return rows.map((d) => ({
      id: d.id, channel: d.channel, recipients: d.recipients, message: d.message, sentAt: new Date(d.sent_at).toISOString(),
      deliveryStatus: d.delivery_status, linkExpiresAt: d.link_expires_at ? new Date(d.link_expires_at).toISOString() : null,
    }));
  }
}
