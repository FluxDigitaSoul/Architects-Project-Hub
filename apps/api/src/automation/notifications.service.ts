import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { ENV, type Env } from '../config/env';
import { DatabaseService, type Tx } from '../database/database';
import type { NotificationMode } from '../database/schema';
import { Mailer, brandedHtml } from '../mail/mailer';
import { loadStudioIdentity } from '../portal/magic-link.service';
import type { ReviewActor } from '../review/pins.service';
import { formatDateIt, nextDailySlot } from './time';

/**
 * Notifiche email raggruppate (AFU FR-MT-06, FR-M2-12, AC-FR-MT-06-1). Gli eventi finiscono nella
 * coda `notifications` nella stessa transazione dell'azione (outbox); il job `notifications` le
 * invia con una sola email per destinatario e commessa: finestra di 10 minuti oppure riepilogo
 * giornaliero, secondo la preferenza. Le email essenziali (OTP, inviti, link) non passano da qui.
 */
export type NotificationEvent = 'PIN_CREATED' | 'COMMENT_ADDED' | 'PIN_RESOLVED' | 'PIN_REOPENED' | 'REVIEW_DUE_SOON' | 'REVIEW_DUE_TODAY';
export type ReviewNotificationEvent = Exclude<NotificationEvent, 'REVIEW_DUE_SOON' | 'REVIEW_DUE_TODAY'>;
type RecipientType = 'MEMBER' | 'CLIENT';

export interface NotificationPayload {
  projectId: string;
  projectCode: string;
  projectTitle: string;
  drawingId: string;
  drawingTitle: string;
  sheetCode: string | null;
  versionId: string;
  versionNumber: number;
  pinNumber?: number;
  authorName?: string;
  excerpt?: string;
  dueDate?: string;
}

export interface QueuedNotification {
  recipientType: RecipientType;
  recipientId: string;
  event: NotificationEvent;
  payload: NotificationPayload;
  sendAfter: Date;
  dedupeKey?: string;
}

interface Recipient {
  type: RecipientType;
  id: string;
  mode: NotificationMode;
}

export interface FlushStats {
  sent: number;
  skipped: number;
  failed: number;
}

export const GROUP_WINDOW_MS = 10 * 60 * 1000; // FR-MT-06: finestra di raggruppamento
export const DAILY_DIGEST_HOUR = 18; // ora locale del riepilogo giornaliero
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const EXCERPT_CHARS = 200;
const GROUPS_PER_RUN = 200;

const excerpt = (body: string) => (body.length > EXCERPT_CHARS ? `${body.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : body);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly db: DatabaseService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Inserisce nella coda (idempotente sulle `dedupeKey`). Va chiamata dentro la transazione del tenant. */
  async enqueue(tx: Tx, tenantId: string, items: QueuedNotification[]): Promise<number> {
    if (!items.length) return 0;
    const rows = await tx.insertInto('notifications').values(items.map((n) => ({
      tenant_id: tenantId, recipient_type: n.recipientType, recipient_id: n.recipientId, event: n.event,
      payload: JSON.stringify(n.payload), channel: 'EMAIL' as const, created_at: new Date(), send_after: n.sendAfter,
      digest_key: `${n.recipientType}:${n.recipientId}:${n.payload.projectId}`, dedupe_key: n.dedupeKey ?? null,
    }))).onConflict((oc) => oc.columns(['tenant_id', 'dedupe_key']).where('dedupe_key', 'is not', null).doNothing())
      .returning('id').execute();
    return rows.length;
  }

  /**
   * Evento della revisione (FR-M2-12): il committente scrive → avvisa il team assegnato;
   * lo studio risponde, risolve o riapre → avvisa l'autore del pin e i committenti del thread.
   */
  async reviewActivity(tx: Tx, actor: ReviewActor, pinId: string, event: ReviewNotificationEvent, body?: string): Promise<void> {
    const pin = await tx.selectFrom('pins as p')
      .innerJoin('drawing_versions as v', 'v.id', 'p.version_id')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .innerJoin('projects as pr', 'pr.id', 'd.project_id')
      .select(['p.id', 'p.number', 'p.author_type', 'p.author_id', 'v.id as version_id', 'v.number as version_number', 'v.status as version_status',
        'd.id as drawing_id', 'd.title as drawing_title', 'd.sheet_code', 'pr.id as project_id', 'pr.code', 'pr.title as project_title'])
      .where('p.id', '=', pinId).executeTakeFirstOrThrow();

    const recipients = actor.type === 'CLIENT'
      ? await this.projectTeam(tx, pin.project_id)
      : pin.version_status === 'PUBLISHED' ? await this.threadClients(tx, pin, event) : [];
    const active = recipients.filter((r) => r.mode !== 'OFF');
    if (!active.length) return;

    const payload: NotificationPayload = {
      projectId: pin.project_id, projectCode: pin.code, projectTitle: pin.project_title, drawingId: pin.drawing_id,
      drawingTitle: pin.drawing_title, sheetCode: pin.sheet_code, versionId: pin.version_id, versionNumber: pin.version_number,
      pinNumber: pin.number, authorName: await this.actorName(tx, actor), ...(body ? { excerpt: excerpt(body) } : {}),
    };
    const now = new Date();
    await this.enqueue(tx, actor.tenantId, active.map((r) => ({
      recipientType: r.type, recipientId: r.id, event, payload,
      // FR-MT-06: "pin risolto" va sempre nel riepilogo giornaliero.
      sendAfter: event === 'PIN_RESOLVED' || r.mode === 'DAILY'
        ? nextDailySlot(now, DAILY_DIGEST_HOUR)
        : new Date(now.getTime() + GROUP_WINDOW_MS),
    })));
  }

  /** Team assegnato alla commessa; se non c'è nessuno, gli Owner dello studio. */
  private async projectTeam(tx: Tx, projectId: string): Promise<Recipient[]> {
    const assigned = await tx.selectFrom('project_assignments as pa').innerJoin('memberships as m', 'm.id', 'pa.membership_id')
      .select(['m.id', 'm.notification_mode']).distinct()
      .where('pa.project_id', '=', projectId).where('pa.valid_to', 'is', null).where('m.status', '=', 'ACTIVE').execute();
    const rows = assigned.length ? assigned : await tx.selectFrom('memberships').select(['id', 'notification_mode'])
      .where('role', '=', 'OWNER').where('status', '=', 'ACTIVE').execute();
    return rows.map((r) => ({ type: 'MEMBER' as const, id: r.id, mode: r.notification_mode }));
  }

  /** Autore committente del pin e committenti che hanno scritto nel thread. */
  private async threadClients(tx: Tx, pin: { id: string; author_type: string; author_id: string }, event: ReviewNotificationEvent): Promise<Recipient[]> {
    const ids = new Set<string>(pin.author_type === 'CLIENT' ? [pin.author_id] : []);
    if (event !== 'PIN_RESOLVED') {
      const authors = await tx.selectFrom('comments').select('author_id').distinct()
        .where('pin_id', '=', pin.id).where('author_type', '=', 'CLIENT').execute();
      authors.forEach((a) => ids.add(a.author_id));
    }
    if (!ids.size) return [];
    const contacts = await tx.selectFrom('client_contacts').select(['id', 'notification_mode'])
      .where('id', 'in', [...ids]).where('removed_at', 'is', null).where('portal_enabled', '=', true).execute();
    return contacts.map((c) => ({ type: 'CLIENT' as const, id: c.id, mode: c.notification_mode }));
  }

  private async actorName(tx: Tx, actor: ReviewActor): Promise<string> {
    if (actor.type === 'CLIENT') {
      const c = await tx.selectFrom('client_contacts').select('display_name').where('id', '=', actor.id).executeTakeFirst();
      return c?.display_name ?? 'Il committente';
    }
    const u = await tx.selectFrom('user_profiles').select(['first_name', 'last_name']).where('id', '=', actor.id).executeTakeFirst();
    return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Lo studio';
  }

  // ---------------------------------------------------------------------------
  // Invio (job `notifications`)
  // ---------------------------------------------------------------------------

  /** Invia i gruppi maturi di tutti gli studi. */
  async flushAll(now = new Date()): Promise<FlushStats> {
    const tenants = await this.db.withContext({}, (tx) =>
      sql<{ tenant_id: string }>`select tenant_id from app.tenants_with_due_notifications()`.execute(tx));
    const totals: FlushStats = { sent: 0, skipped: 0, failed: 0 };
    for (const { tenant_id } of tenants.rows) {
      const r = await this.flushTenant(tenant_id, now);
      totals.sent += r.sent;
      totals.skipped += r.skipped;
      totals.failed += r.failed;
    }
    return totals;
  }

  async flushTenant(tenantId: string, now = new Date()): Promise<FlushStats> {
    const result: FlushStats = { sent: 0, skipped: 0, failed: 0 };
    const groups = await this.db.withContext({ tenantId }, (tx) => tx.selectFrom('notifications').select('digest_key').distinct()
      .where('status', '=', 'PENDING').where('send_after', '<=', now).where('digest_key', 'is not', null)
      .limit(GROUPS_PER_RUN).execute());
    for (const { digest_key } of groups) {
      if (!digest_key) continue;
      const outcome = await this.db.withContext({ tenantId }, (tx) => this.sendGroup(tx, tenantId, digest_key, now));
      result[outcome] += 1;
    }
    return result;
  }

  /** Un gruppo = un destinatario e una commessa: tutte le righe in coda partono nella stessa email. */
  private async sendGroup(tx: Tx, tenantId: string, digestKey: string, now: Date): Promise<keyof FlushStats> {
    const rows = await tx.selectFrom('notifications').select(['id', 'recipient_type', 'recipient_id', 'event', 'payload', 'attempts'])
      .where('digest_key', '=', digestKey).where('status', '=', 'PENDING').orderBy('created_at')
      .forUpdate().skipLocked().execute();
    const first = rows[0];
    if (!first) return 'skipped';
    const ids = rows.map((r) => r.id);
    const recipient = await this.deliverable(tx, first.recipient_type, first.recipient_id);
    if (!recipient) {
      await tx.updateTable('notifications').set({ status: 'SKIPPED', sent_at: now }).where('id', 'in', ids).execute();
      return 'skipped';
    }
    try {
      const studio = await loadStudioIdentity(tx, tenantId);
      const tenant = await tx.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirstOrThrow();
      const items = rows.map((r) => ({ event: r.event as NotificationEvent, payload: r.payload as unknown as NotificationPayload }));
      await this.mailer.send(this.render(recipient, items, studio, tenant.slug));
      await tx.updateTable('notifications').set({ status: 'SENT', sent_at: now, attempts: first.attempts + 1 }).where('id', 'in', ids).execute();
      return 'sent';
    } catch (error) {
      const attempts = first.attempts + 1;
      const message = (error as Error).message.slice(0, 500);
      this.logger.warn(`Notifica non inviata (${digestKey}, tentativo ${attempts}): ${message}`);
      await tx.updateTable('notifications').set({
        attempts, last_error: message,
        ...(attempts >= MAX_ATTEMPTS ? { status: 'FAILED' as const } : { send_after: new Date(now.getTime() + RETRY_DELAY_MS * attempts) }),
      }).where('id', 'in', ids).execute();
      return 'failed';
    }
  }

  /** Destinatario ancora raggiungibile e con le notifiche attive (la preferenza vale anche al momento dell'invio). */
  private async deliverable(tx: Tx, type: string, id: string): Promise<{ type: RecipientType; name: string; email: string } | null> {
    if (type === 'CLIENT') {
      const c = await tx.selectFrom('client_contacts').select(['display_name', 'email', 'notification_mode'])
        .where('id', '=', id).where('removed_at', 'is', null).where('portal_enabled', '=', true).where('email_status', '=', 'OK')
        .executeTakeFirst();
      return c && c.notification_mode !== 'OFF' ? { type: 'CLIENT', name: c.display_name, email: c.email } : null;
    }
    const m = await tx.selectFrom('memberships as m').innerJoin('user_profiles as u', 'u.id', 'm.user_id')
      .select(['u.first_name', 'u.last_name', 'u.email', 'm.notification_mode'])
      .where('m.id', '=', id).where('m.status', '=', 'ACTIVE').executeTakeFirst();
    return m && m.notification_mode !== 'OFF'
      ? { type: 'MEMBER', name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email, email: m.email }
      : null;
  }

  private render(
    recipient: { type: RecipientType; name: string; email: string },
    items: Array<{ event: NotificationEvent; payload: NotificationPayload }>,
    studio: { name: string; email: string | null; primaryColor: string },
    slug: string,
  ) {
    const p = items[0]!.payload;
    const reminders = items.every((i) => i.event === 'REVIEW_DUE_SOON' || i.event === 'REVIEW_DUE_TODAY');
    const single = new Set(items.map((i) => i.payload.versionId)).size === 1;
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    const url = recipient.type === 'CLIENT'
      ? `${base}/portale${single ? `/tavole/${p.versionId}` : ''}?studio=${encodeURIComponent(slug)}`
      : single ? `${base}/commesse/${p.projectId}/tavole/${p.drawingId}?versione=${p.versionId}` : `${base}/commesse/${p.projectId}?scheda=tavole`;
    const title = reminders ? 'Revisione in scadenza' : `Aggiornamenti sulla commessa ${p.projectCode}`;
    const paragraphs = [
      `Gentile ${recipient.name},`,
      reminders
        ? `${studio.name} attende un tuo riscontro sugli elaborati della commessa "${p.projectTitle}":`
        : `ecco le novità sulla revisione degli elaborati della commessa "${p.projectTitle}":`,
      ...items.map((i) => `• ${describe(i.event, i.payload)}`),
      ...(reminders ? ['La scadenza è indicativa: nessun elaborato viene approvato in automatico.'] : []),
      recipient.type === 'CLIENT'
        ? 'Puoi scegliere come ricevere questi avvisi (subito, un riepilogo al giorno o nessuno) dal portale.'
        : 'Puoi scegliere come ricevere questi avvisi in Impostazioni › Il mio profilo.',
    ];
    const subject = reminders
      ? `${studio.name} — promemoria: revisione in scadenza`
      : recipient.type === 'CLIENT'
        ? `${studio.name} — aggiornamenti sulla commessa "${p.projectTitle}"`
        : `${p.projectCode} — ${items.length === 1 ? 'una novità' : `${items.length} novità`} dalla revisione`;
    return {
      to: [recipient.email], subject, senderName: studio.name, replyTo: studio.email,
      text: `${paragraphs.join('\n')}\n\n${url}`,
      html: brandedHtml({
        studioName: studio.name, primaryColor: studio.primaryColor, title, paragraphs,
        cta: { label: recipient.type === 'CLIENT' ? 'Apri il portale' : 'Apri la revisione', url },
      }),
    };
  }
}

function describe(event: NotificationEvent, p: NotificationPayload): string {
  const sheet = `${p.sheetCode ? `${p.sheetCode} ` : ''}${p.drawingTitle} (versione ${p.versionNumber})`;
  const quote = p.excerpt ? `: «${p.excerpt}»` : '';
  switch (event) {
    case 'PIN_CREATED': return `${p.authorName} ha aggiunto il pin ${p.pinNumber} su ${sheet}${quote}`;
    case 'COMMENT_ADDED': return `${p.authorName} ha risposto sul pin ${p.pinNumber} di ${sheet}${quote}`;
    case 'PIN_RESOLVED': return `${p.authorName} ha segnato come risolto il pin ${p.pinNumber} di ${sheet}`;
    case 'PIN_REOPENED': return `${p.authorName} ha riaperto il pin ${p.pinNumber} di ${sheet}${quote}`;
    case 'REVIEW_DUE_SOON': return `${sheet}: riscontro richiesto entro il ${formatDateIt(p.dueDate ?? '')}`;
    case 'REVIEW_DUE_TODAY': return `${sheet}: la scadenza per il riscontro è oggi (${formatDateIt(p.dueDate ?? '')})`;
  }
}
