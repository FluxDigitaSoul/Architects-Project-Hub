import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { hashEquals, newOtpCode, newVerificationCode, otpHash } from '../common/crypto';
import type { Tx } from '../database/database';
import { Mailer, brandedHtml } from '../mail/mailer';
import { loadStudioIdentity } from '../portal/magic-link.service';
import { assertUuid } from '../studio/studio-scope';
import { PinsService, type ReviewActor } from './pins.service';

const OTP_TTL_MS = 10 * 60 * 1000; // BR-10: OTP verificato nei 10 minuti precedenti
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5; // NFR-SEC-05

/** Testo della dichiarazione accettata dal committente (versionato: va validato dal legale, Q-16). */
export const DECLARATION_VERSION = '2026-09-v1';
export function declarationText(signer: string, drawing: string, version: number): string {
  return `Io sottoscritto/a ${signer} dichiaro di aver esaminato l'elaborato "${drawing}" (versione ${version}) ` +
    'e di approvarlo. Sono consapevole che l’approvazione è registrata con data, ora, indirizzo IP e impronta ' +
    'del file, e che eventuali modifiche successive richiederanno una nuova versione e una nuova approvazione.';
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export type ChangeRequestStatus = 'IN_REVIEW' | 'ACCEPTED_IN_SCOPE' | 'ACCEPTED_EXTRA_SCOPE' | 'REJECTED' | 'CLOSED';

/** Formal sign-off e richieste di modifica (FR-M2-15..17, BR-01, BR-10, BR-19). */
@Injectable()
export class SignoffService {
  constructor(
    private readonly pins: PinsService,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  private async signerContact(tx: Tx, actor: ReviewActor) {
    if (actor.type !== 'CLIENT') throw new AppError('FORBIDDEN', 'Operazione riservata al committente.');
    const contact = await tx.selectFrom('client_contacts').select(['id', 'display_name', 'email', 'is_signer'])
      .where('id', '=', actor.id).where('removed_at', 'is', null).executeTakeFirst();
    if (!contact) throw new AppError('NOT_FOUND', 'Contatto non trovato.');
    if (!contact.is_signer) throw new AppError('NOT_SIGNER', 'Solo il firmatario designato può approvare.');
    return contact;
  }

  /**
   * Prepara un OTP a 6 cifre (salvato solo come hash legato al challenge).
   * Restituisce la funzione di invio: l'email parte solo dopo il commit della transazione.
   */
  async requestOtp(tx: Tx, actor: ReviewActor, meta?: RequestMeta) {
    const contact = await this.signerContact(tx, actor);
    const recent = await tx.selectFrom('otp_challenges').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('client_contact_id', '=', contact.id).where('created_at', '>', new Date(Date.now() - 60 * 60 * 1000))
      .executeTakeFirstOrThrow();
    if (Number(recent.n) >= OTP_MAX_PER_HOUR) throw new AppError('RATE_LIMITED', 'Troppe richieste di codice: riprova tra un’ora.');

    const code = newOtpCode();
    const challengeId = randomUUID();
    await tx.insertInto('otp_challenges').values({
      id: challengeId, tenant_id: actor.tenantId, client_contact_id: contact.id, purpose: 'SIGN_OFF',
      code_hash: otpHash(challengeId, code), expires_at: new Date(Date.now() + OTP_TTL_MS),
    }).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'CLIENT', actorId: contact.id, action: 'OTP_SENT',
      objectType: 'OTP', objectId: challengeId, meta,
    });
    const studio = await loadStudioIdentity(tx, actor.tenantId);
    const paragraphs = [
      'Usa questo codice per confermare l’approvazione dell’elaborato. Vale 10 minuti.',
      'Se non hai richiesto il codice, ignora questa email.',
    ];
    return {
      challengeId,
      sentTo: maskEmail(contact.email),
      expiresInSec: OTP_TTL_MS / 1000,
      send: () =>
        this.mailer.send({
          to: [contact.email],
          subject: `${studio.name} — codice di conferma ${code}`,
          senderName: studio.name,
          replyTo: studio.email,
          text: `Il tuo codice di conferma è ${code}.\n\n${paragraphs.join('\n')}`,
          html: brandedHtml({ studioName: studio.name, primaryColor: studio.primaryColor, title: `Codice di conferma: ${code}`, paragraphs }),
        }),
    };
  }

  /** Verifica l'OTP con al massimo 5 tentativi; restituisce l'id del challenge verificato. */
  private async verifyOtp(tx: Tx, contactId: string, challengeId: string, code: string): Promise<string> {
    assertUuid(challengeId, 'Codice');
    const ch = await tx.selectFrom('otp_challenges').selectAll()
      .where('id', '=', challengeId).where('client_contact_id', '=', contactId).where('purpose', '=', 'SIGN_OFF').executeTakeFirst();
    if (!ch || ch.verified_at) throw new AppError('OTP_REQUIRED', 'Richiedi un nuovo codice di conferma.');
    if (new Date(ch.expires_at).getTime() < Date.now()) throw new AppError('OTP_INVALID', 'Il codice è scaduto: richiedine uno nuovo.');
    if (ch.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_INVALID', 'Troppi tentativi: richiedi un nuovo codice.');
    if (!/^\d{6}$/.test(code) || !hashEquals(otpHash(ch.id, code), ch.code_hash)) {
      await tx.updateTable('otp_challenges').set({ attempts: ch.attempts + 1 }).where('id', '=', ch.id).execute();
      throw new AppError('OTP_INVALID', 'Codice non corretto.', { attemptsLeft: OTP_MAX_ATTEMPTS - ch.attempts - 1 });
    }
    await tx.updateTable('otp_challenges').set({ verified_at: new Date() }).where('id', '=', ch.id).execute();
    return ch.id;
  }

  /**
   * FR-M2-15 / BR-10: approvazione. Condizioni: firmatario con token attivo, commessa Attiva,
   * versione Pubblicata e ultima pubblicata, OTP valido, presa visione dei pin aperti.
   * L'approvazione è immutabile e congela la versione (BR-01).
   */
  async approve(
    tx: Tx, actor: ReviewActor, versionId: string,
    input: { challengeId: string; code: string; declarationAccepted: boolean; openPinsAcknowledged: boolean },
    meta: RequestMeta,
  ) {
    const contact = await this.signerContact(tx, actor);
    const project = await tx.selectFrom('projects').select('status').where('id', '=', actor.projectId).executeTakeFirstOrThrow();
    if (project.status !== 'ACTIVE') throw new AppError('PROJECT_NOT_ACTIVE', 'La commessa non è attiva.');
    const version = await this.pins.loadVersion(tx, actor, versionId);
    if (version.status !== 'PUBLISHED') throw new AppError('VERSION_NOT_CURRENT', 'Si approva solo l’ultima versione pubblicata.');
    if (!input.declarationAccepted) throw new AppError('VALIDATION_FAILED', 'Serve accettare la dichiarazione.');
    const { n } = await tx.selectFrom('pins').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('version_id', '=', version.id).where('status', 'in', ['OPEN', 'WAITING']).executeTakeFirstOrThrow();
    const openPins = Number(n);
    if (openPins > 0 && !input.openPinsAcknowledged) {
      throw new AppError('CONFLICT', 'Ci sono pin aperti: conferma di averne preso visione.', { openPins });
    }
    if (!version.sha256) throw new AppError('CONFLICT', 'Il file della versione non è verificato.');
    const challengeId = await this.verifyOtp(tx, contact.id, input.challengeId, input.code);

    const verificationCode = newVerificationCode();
    const approval = await tx.insertInto('approvals').values({
      tenant_id: actor.tenantId, version_id: version.id, client_contact_id: contact.id, ip: meta.ip, user_agent: meta.userAgent,
      file_sha256: version.sha256, declaration_text: declarationText(contact.display_name, version.title, version.number),
      declaration_version: DECLARATION_VERSION, otp_challenge_id: challengeId, verification_code: verificationCode,
      open_pins_at_approval: openPins, open_pins_acknowledged: openPins > 0,
    }).returning(['id', 'approved_at']).executeTakeFirstOrThrow();
    await tx.updateTable('drawing_versions').set({ status: 'APPROVED' }).where('id', '=', version.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'CLIENT', actorId: contact.id, action: 'DRAWING_VERSION_APPROVED',
      objectType: 'DRAWING_VERSION', objectId: version.id,
      details: { approvalId: approval.id, sha256: version.sha256, openPins, verificationCode }, meta,
    });
    return { approvalId: approval.id, approvedAt: new Date(approval.approved_at).toISOString(), verificationCode, fileSha256: version.sha256 };
  }

  /** FR-M2-17: richiesta di modifica su una versione approvata (il committente non può più pinnare). */
  async requestChange(
    tx: Tx, actor: ReviewActor, versionId: string,
    input: { description: string; position?: { x: number; y: number; pageIndex: number } | null }, meta: RequestMeta,
  ) {
    if (actor.type !== 'CLIENT') throw new AppError('FORBIDDEN', 'Operazione riservata al committente.');
    const version = await this.pins.loadVersion(tx, actor, versionId);
    if (version.status !== 'APPROVED') throw new AppError('INVALID_TRANSITION', 'Le richieste di modifica si fanno sulle versioni approvate.');
    const row = await tx.insertInto('change_requests').values({
      tenant_id: actor.tenantId, version_id: version.id, client_contact_id: actor.id,
      description: input.description, position_pct: JSON.stringify(input.position ?? null),
    }).returning('id').executeTakeFirstOrThrow();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'CLIENT', actorId: actor.id, action: 'CHANGE_REQUEST_SUBMITTED',
      objectType: 'CHANGE_REQUEST', objectId: row.id, details: { versionId: version.id }, meta,
    });
    return row;
  }

  async listChangeRequests(tx: Tx, actor: ReviewActor) {
    let q = tx.selectFrom('change_requests as cr')
      .innerJoin('drawing_versions as v', 'v.id', 'cr.version_id')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .innerJoin('client_contacts as c', 'c.id', 'cr.client_contact_id')
      .select(['cr.id', 'cr.description', 'cr.status', 'cr.assessment_note', 'cr.indicative_amount_cents', 'cr.created_at',
        'cr.visible_to_client', 'v.number', 'd.title', 'c.display_name'])
      .where('d.project_id', '=', actor.projectId);
    if (actor.type === 'CLIENT') q = q.where('cr.client_contact_id', '=', actor.id);
    const rows = await q.orderBy('cr.created_at', 'desc').execute();
    return rows.map((r) => {
      const hidden = actor.type === 'CLIENT' && !r.visible_to_client;
      return {
        id: r.id,
        description: r.description,
        status: r.status,
        assessmentNote: hidden ? null : r.assessment_note,
        indicativeAmountCents: hidden || r.indicative_amount_cents === null ? null : Number(r.indicative_amount_cents),
        drawingTitle: r.title,
        versionNumber: r.number,
        requestedBy: r.display_name,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  /** SM-RICHIESTA-MODIFICA: valutazione dello studio (in contratto / extra / rifiutata). */
  async assessChangeRequest(
    tx: Tx, actor: ReviewActor, requestId: string,
    input: { status: ChangeRequestStatus; note?: string | null; indicativeAmountCents?: number | null; visibleToClient?: boolean },
    meta: RequestMeta,
  ) {
    if (actor.type !== 'MEMBER') throw new AppError('FORBIDDEN', 'Operazione riservata allo studio.');
    assertUuid(requestId, 'Richiesta');
    const row = await tx.selectFrom('change_requests as cr').innerJoin('drawing_versions as v', 'v.id', 'cr.version_id')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id').select(['cr.id', 'cr.status'])
      .where('cr.id', '=', requestId).where('d.project_id', '=', actor.projectId).executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND', 'Richiesta non trovata.');
    if (row.status === 'CLOSED') throw new AppError('INVALID_TRANSITION', 'La richiesta è chiusa.');
    await tx.updateTable('change_requests').set({
      status: input.status,
      ...(input.note !== undefined ? { assessment_note: input.note } : {}),
      ...(input.indicativeAmountCents !== undefined ? { indicative_amount_cents: input.indicativeAmountCents } : {}),
      ...(input.visibleToClient !== undefined ? { visible_to_client: input.visibleToClient } : {}),
    }).where('id', '=', row.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'USER', actorId: actor.id, action: 'CHANGE_REQUEST_ASSESSED',
      objectType: 'CHANGE_REQUEST', objectId: row.id, details: { from: row.status, to: input.status }, meta,
    });
  }

  /** FR-M2-16: log di congelamento della versione, in ordine cronologico e in sola lettura. */
  async freezeLog(tx: Tx, actor: ReviewActor, versionId: string) {
    const version = await this.pins.loadVersion(tx, actor, versionId);
    const pinIds = (await tx.selectFrom('pins').select('id').where('version_id', '=', version.id).execute()).map((p) => p.id);
    const objectIds = [version.id, ...pinIds];
    const events = await tx.selectFrom('audit_events')
      .select(['occurred_at', 'actor_type', 'action', 'object_type', 'object_id', 'details'])
      .where('object_id', 'in', objectIds)
      .orderBy('occurred_at').orderBy('id').execute();
    const approvals = await tx.selectFrom('approvals as a').innerJoin('client_contacts as c', 'c.id', 'a.client_contact_id')
      .select(['a.id', 'a.approved_at', 'a.ip', 'a.user_agent', 'a.file_sha256', 'a.verification_code', 'a.declaration_text',
        'a.open_pins_at_approval', 'c.display_name', 'c.email'])
      .where('a.version_id', '=', version.id).execute();
    return {
      version: { id: version.id, number: version.number, status: version.status, title: version.title, sha256: version.sha256 },
      approvals: approvals.map((a) => ({
        id: a.id, signer: a.display_name, email: maskEmail(a.email), approvedAt: new Date(a.approved_at).toISOString(), ip: a.ip,
        userAgent: a.user_agent, fileSha256: a.file_sha256, verificationCode: a.verification_code,
        declarationText: a.declaration_text, openPinsAtApproval: a.open_pins_at_approval,
      })),
      events: events.map((e) => ({
        at: new Date(e.occurred_at).toISOString(), actorType: e.actor_type, action: e.action,
        objectType: e.object_type, objectId: e.object_id, details: e.details,
      })),
    };
  }
}
