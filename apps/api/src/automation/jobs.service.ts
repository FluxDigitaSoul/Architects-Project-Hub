import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '../database/database';
import { FileStorage } from '../storage/file-storage';
import { NotificationsService } from './notifications.service';
import { addDays, localDate, zonedParts } from './time';

/**
 * Job pianificati (AFU cap. 14.3): invio delle notifiche raggruppate, promemoria delle scadenze di
 * revisione (FR-M2-05) e conservazione dei dati (PRIV-03, cap. 12.2). Ogni job è idempotente e
 * lavora studio per studio con il contesto del tenant (RLS, BR-04). Un'esecuzione alla volta:
 * la riga RUNNING in `job_runs` fa da lease anche con più istanze dell'API.
 */
export type JobName = 'notifications' | 'review-reminders' | 'retention';
export type JobSchedule = { everyMinutes: number } | { dailyAt: { hour: number; minute: number } };
export type JobTrigger = 'SCHEDULER' | 'HTTP';
type JobStats = Record<string, number>;

export interface JobDefinition {
  name: JobName;
  description: string;
  schedule: JobSchedule;
  run: (now: Date) => Promise<JobStats>;
}

export interface JobResult {
  job: JobName;
  status: 'DONE' | 'FAILED' | 'SKIPPED';
  stats: JobStats;
  error?: string;
}

const LEASE_TIMEOUT_MIN = 30;
const DEFAULT_AUDIO_RETENTION_DAYS = 90; // PRIV-03
const NOTIFICATION_RETENTION_DAYS = 90; // FR-MT-05
const AUDIO_BATCH = 200;
const DAY_MS = 86_400_000;

@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  readonly definitions: readonly JobDefinition[];

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly storage: FileStorage,
  ) {
    this.definitions = [
      {
        name: 'notifications', description: 'Invio delle notifiche raggruppate (FR-MT-06)',
        schedule: { everyMinutes: 2 }, run: (now) => this.notifications.flushAll(now).then((s) => ({ ...s })),
      },
      {
        name: 'review-reminders', description: 'Promemoria delle scadenze di revisione (FR-M2-05)',
        schedule: { dailyAt: { hour: 8, minute: 0 } }, run: (now) => this.reviewReminders(now),
      },
      {
        name: 'retention', description: 'Conservazione dei dati: audio, notifiche, link scaduti, IP (PRIV-03, cap. 12.2)',
        schedule: { dailyAt: { hour: 3, minute: 30 } }, run: (now) => this.retention(now),
      },
    ];
  }

  find(name: string): JobDefinition | undefined {
    return this.definitions.find((d) => d.name === name);
  }

  /** Esegue un job con il lease; se è già in corso altrove restituisce SKIPPED. */
  async run(name: JobName, trigger: JobTrigger, now = new Date()): Promise<JobResult> {
    const def = this.find(name);
    if (!def) throw new Error(`Job sconosciuto: ${name}`);
    const runId = await this.acquire(name, trigger);
    if (!runId) return { job: name, status: 'SKIPPED', stats: {} };
    try {
      const stats = await def.run(now);
      await this.finish(runId, 'DONE', stats, null);
      return { job: name, status: 'DONE', stats };
    } catch (error) {
      const message = (error as Error).message.slice(0, 1000);
      this.logger.error(`Job ${name} fallito: ${message}`);
      await this.finish(runId, 'FAILED', {}, message);
      return { job: name, status: 'FAILED', stats: {}, error: message };
    }
  }

  /** Un job è dovuto se non ha già girato nel suo intervallo (o, per i quotidiani, oggi dopo l'ora prevista). */
  async isDue(def: JobDefinition, now: Date): Promise<boolean> {
    const last = await this.db.withContext({}, (tx) => tx.selectFrom('job_runs').select('started_at')
      .where('job', '=', def.name).where('status', 'in', ['DONE', 'RUNNING']).orderBy('started_at', 'desc').limit(1).executeTakeFirst());
    const lastAt = last ? new Date(last.started_at) : null;
    if ('everyMinutes' in def.schedule) {
      return !lastAt || now.getTime() - lastAt.getTime() >= def.schedule.everyMinutes * 60_000;
    }
    const { hour, minute } = def.schedule.dailyAt;
    const local = zonedParts(now);
    if (local.minutes < hour * 60 + minute) return false;
    return !lastAt || localDate(lastAt) !== local.date;
  }

  async recentRuns(limit = 30) {
    return this.db.withContext({}, (tx) => tx.selectFrom('job_runs').selectAll().orderBy('started_at', 'desc').limit(limit).execute());
  }

  private async acquire(job: JobName, trigger: JobTrigger): Promise<string | null> {
    return this.db.withContext({}, async (tx) => {
      // Un'esecuzione interrotta (crash, deploy) non blocca il job per sempre.
      await tx.updateTable('job_runs').set({ status: 'FAILED', finished_at: new Date(), error: 'Lease scaduto: esecuzione interrotta' })
        .where('job', '=', job).where('status', '=', 'RUNNING')
        .where('started_at', '<', new Date(Date.now() - LEASE_TIMEOUT_MIN * 60_000)).execute();
      const row = await tx.insertInto('job_runs').values({ job, trigger, started_at: new Date() })
        .onConflict((oc) => oc.column('job').where('status', '=', 'RUNNING').doNothing())
        .returning('id').executeTakeFirst();
      return row?.id ?? null;
    });
  }

  private async finish(id: string, status: 'DONE' | 'FAILED', stats: JobStats, error: string | null): Promise<void> {
    await this.db.withContext({}, (tx) => tx.updateTable('job_runs')
      .set({ status, finished_at: new Date(), stats: JSON.stringify(stats), error }).where('id', '=', id).execute());
  }

  private async tenantIds(): Promise<string[]> {
    const r = await this.db.withContext({}, (tx) => sql<{ tenant_id: string }>`select tenant_id from app.automation_tenant_ids()`.execute(tx));
    return r.rows.map((x) => x.tenant_id);
  }

  // ---------------------------------------------------------------------------
  // FR-M2-05 / BR-19: promemoria ai committenti firmatari 2 giorni prima e il giorno stesso.
  // La scadenza non approva nulla: la versione resta "Pubblicata — in attesa".
  // ---------------------------------------------------------------------------
  async reviewReminders(now: Date): Promise<JobStats> {
    const today = localDate(now);
    const soon = addDays(today, 2);
    let queued = 0;
    for (const tenantId of await this.tenantIds()) {
      queued += await this.db.withContext({ tenantId }, async (tx) => {
        const due = await tx.selectFrom('drawing_versions as v')
          .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
          .innerJoin('projects as p', 'p.id', 'd.project_id')
          .innerJoin('client_contacts as c', 'c.project_id', 'p.id')
          .select(['v.id as version_id', 'v.number', 'v.review_due_date', 'd.id as drawing_id', 'd.title', 'd.sheet_code',
            'p.id as project_id', 'p.code', 'p.title as project_title', 'c.id as contact_id'])
          .where('v.status', '=', 'PUBLISHED').where('v.frozen_at', 'is', null)
          .where('v.review_due_date', 'in', [today, soon])
          .where('p.status', 'in', ['ACTIVE', 'SUSPENDED'])
          .where('c.is_signer', '=', true).where('c.portal_enabled', '=', true).where('c.removed_at', 'is', null)
          .where('c.notification_mode', '<>', 'OFF')
          .execute();
        return this.notifications.enqueue(tx, tenantId, due.map((r) => {
          const isToday = r.review_due_date === today;
          return {
            recipientType: 'CLIENT' as const, recipientId: r.contact_id, event: isToday ? 'REVIEW_DUE_TODAY' as const : 'REVIEW_DUE_SOON' as const,
            payload: {
              projectId: r.project_id, projectCode: r.code, projectTitle: r.project_title, drawingId: r.drawing_id,
              drawingTitle: r.title, sheetCode: r.sheet_code, versionId: r.version_id, versionNumber: r.number, dueDate: r.review_due_date ?? today,
            },
            sendAfter: now,
            dedupeKey: `review-due:${r.version_id}:${r.contact_id}:${isToday ? 'D0' : 'D2'}`,
          };
        }));
      });
    }
    // I promemoria partono subito, senza aspettare il prossimo giro del job delle notifiche.
    const flushed = queued ? await this.notifications.flushAll(now) : { sent: 0, skipped: 0, failed: 0 };
    return { queued, ...flushed };
  }

  // ---------------------------------------------------------------------------
  // Conservazione dei dati
  // ---------------------------------------------------------------------------
  async retention(now: Date): Promise<JobStats> {
    const stats = { audioPurged: 0, notificationsDeleted: 0, tokensExpired: 0, auditIpsTruncated: 0 };
    for (const tenantId of await this.tenantIds()) {
      stats.audioPurged += await this.purgeAudio(tenantId, now);
      await this.db.withContext({ tenantId }, async (tx) => {
        const deleted = await tx.deleteFrom('notifications').where('status', '<>', 'PENDING')
          .where('created_at', '<', new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS)).executeTakeFirst();
        stats.notificationsDeleted += Number(deleted.numDeletedRows);
        // BR-03: i link self-service durano 24 ore; lo stato "Scaduto" rende chiaro l'elenco degli accessi.
        const expired = await tx.updateTable('access_tokens').set({ status: 'EXPIRED' })
          .where('status', '=', 'ACTIVE').where('expires_at', '<', now).executeTakeFirst();
        stats.tokensExpired += Number(expired.numUpdatedRows);
      });
    }
    // Cap. 12.2: IP degli eventi di audit troncati dopo 90 giorni (esclusi quelli probatori).
    const truncated = await this.db.withContext({}, (tx) => sql<{ n: number }>`select app.truncate_audit_ips() as n`.execute(tx));
    stats.auditIpsTruncated = Number(truncated.rows[0]?.n ?? 0);
    return stats;
  }

  /**
   * PRIV-03: l'audio grezzo si elimina dopo il periodo scelto dallo studio (predefinito 90 giorni)
   * dalla finalizzazione o dall'annullamento del sopralluogo. Prima si cancella il file, poi si
   * segna la riga: se la cancellazione fallisce, il giro successivo riprova.
   */
  private async purgeAudio(tenantId: string, now: Date): Promise<number> {
    return this.db.withContext({ tenantId }, async (tx) => {
      const tenant = await tx.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
      const days = tenant.settings.audioRetentionDays ?? DEFAULT_AUDIO_RETENTION_DAYS;
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      const rows = await tx.selectFrom('audio_notes as a').innerJoin('site_visits as v', 'v.id', 'a.visit_id')
        .select(['a.id', 'a.file_key'])
        .where('a.purged_at', 'is', null).where('a.file_key', 'is not', null)
        .where((eb) => eb.or([eb('v.finalized_at', '<', cutoff), eb('v.cancelled_at', '<', cutoff)]))
        .limit(AUDIO_BATCH).execute();
      const keys = rows.flatMap((r) => (r.file_key ? [r.file_key] : []));
      if (!rows.length) return 0;
      await this.storage.remove(keys);
      await tx.updateTable('audio_notes').set({ file_key: null, purged_at: now }).where('id', 'in', rows.map((r) => r.id)).execute();
      return rows.length;
    });
  }
}
