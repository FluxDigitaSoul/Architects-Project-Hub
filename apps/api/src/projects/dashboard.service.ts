import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Tx } from '../database/database';
import { RaiCalcService } from '../rai/rai-calc.service';
import { type StudioScope, loadVisibleProject } from '../studio/studio-scope';
import { ContactsService } from './contacts.service';

const OVERDUE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Dashboard della commessa (FR-M1-04): tutti i widget in una sola chiamata. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly rai: RaiCalcService,
    private readonly contacts: ContactsService,
  ) {}

  async project(tx: Tx, scope: StudioScope, projectId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    // Le query condividono la connessione della transazione: si eseguono in sequenza.
    const approvals = await this.approvals(tx, project.id);
    const pins = await this.pins(tx, project.id);
    const field = await this.field(tx, project.id);
    const changeRequests = await this.changeRequests(tx, project.id);
    const activity = await this.activity(tx, project.id);
    const clients = await this.contacts.list(tx, project.id);
    const raiResult = await this.rai.evaluate(tx, project);
    const rai = RaiCalcService.summarize(raiResult.buildings.flatMap((b) => b.units));
    return {
      project: { id: project.id, code: project.code, title: project.title, status: project.status },
      approvals,
      pins,
      rai: { ...rai, profile: raiResult.profile.name },
      field,
      changeRequests,
      activity,
      clients: clients.map((c) => ({ id: c.id, name: c.displayName, lastAccessAt: c.lastAccessAt, linkStatus: c.linkStatus, isSigner: c.isSigner })),
    };
  }

  /**
   * FR-M1-04 (dashboard dello studio, Should): indicatori aggregati sulle commesse visibili
   * all'utente, "cose da fare" e attività recente. I Collaboratori vedono solo le commesse assegnate.
   */
  async studio(tx: Tx, scope: StudioScope) {
    const onlyAssigned = scope.role === 'COLLABORATOR';
    const visible = sql`
      select p.id, p.code, p.title, p.status from app.projects p
       where p.status <> 'ARCHIVED'
         and (not ${onlyAssigned} or exists (
              select 1 from app.project_assignments pa
               where pa.project_id = p.id and pa.membership_id = ${scope.membershipId}::uuid and pa.valid_to is null))`;

    const totals = await sql<{ active: string; awaiting: string; overdue: string; pins: string; drafts: string; issues: string }>`
      with vp as (${visible})
      select
        (select count(*) from vp where vp.status = 'ACTIVE') as active,
        (select count(*) from app.drawing_versions v join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
          where v.status = 'PUBLISHED') as awaiting,
        (select count(*) from app.drawing_versions v join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
          where v.status = 'PUBLISHED' and v.published_at < now() - make_interval(days => ${OVERDUE_DAYS})) as overdue,
        (select count(*) from app.pins pin join app.drawing_versions v on v.id = pin.version_id
           join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id where pin.status = 'OPEN') as pins,
        (select count(*) from app.site_visits s join vp on vp.id = s.project_id
          where s.status in ('DRAFT', 'AI_PROCESSING', 'REVIEW')) as drafts,
        (select count(*) from app.open_actions oa join vp on vp.id = oa.project_id where oa.status = 'OPEN') as issues`
      .execute(tx);
    const t = totals.rows[0];

    const todo = await sql<{ kind: string; project_id: string; project_code: string; ref_id: string; label: string; n: string; at: Date }>`
      with vp as (${visible})
      (select 'PINS' as kind, vp.id as project_id, vp.code as project_code, d.id::text as ref_id,
              concat(d.title, ' v', v.number) as label, count(*)::text as n, min(pin.created_at) as at
         from app.pins pin join app.drawing_versions v on v.id = pin.version_id
         join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
        where pin.status = 'OPEN'
        group by vp.id, vp.code, d.id, d.title, v.number)
      union all
      (select 'VISIT', vp.id, vp.code, s.id::text, concat('Sopralluogo n. ', s.number), '1', s.started_at
         from app.site_visits s join vp on vp.id = s.project_id
        where s.status in ('DRAFT', 'REVIEW'))
      union all
      (select 'APPROVAL', vp.id, vp.code, d.id::text, concat(d.title, ' v', v.number), '1', v.published_at
         from app.drawing_versions v join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
        where v.status = 'PUBLISHED' and v.published_at < now() - make_interval(days => ${OVERDUE_DAYS}))
      order by at asc
      limit 20`.execute(tx);

    const activity = await sql<{ kind: string; text: string; at: Date; project_id: string; project_code: string; ref: string }>`
      with vp as (${visible})
      (select 'PUBLISH' as kind, concat(d.title, ' v', v.number, ' pubblicata') as text, v.published_at as at,
              vp.id as project_id, vp.code as project_code, d.id::text as ref
         from app.drawing_versions v join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
        where v.published_at is not null)
      union all
      (select 'PIN', concat('Osservazione n. ', p.number, ' su ', d.title), p.created_at, vp.id, vp.code, d.id::text
         from app.pins p join app.drawing_versions v on v.id = p.version_id
         join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id
        where p.status <> 'WITHDRAWN')
      union all
      (select 'APPROVAL', concat(d.title, ' v', v.number, ' approvata'), a.approved_at, vp.id, vp.code, d.id::text
         from app.approvals a join app.drawing_versions v on v.id = a.version_id
         join app.drawings d on d.id = v.drawing_id join vp on vp.id = d.project_id)
      union all
      (select 'VISIT', concat('Verbale n. ', s.number, case when s.status = 'CANCELLED' then ' annullato' else ' finalizzato' end),
              s.finalized_at, vp.id, vp.code, s.id::text
         from app.site_visits s join vp on vp.id = s.project_id where s.finalized_at is not null)
      union all
      (select 'DOCUMENT', concat('Documento: ', doc.title), doc.created_at, vp.id, vp.code, doc.id::text
         from app.documents doc join vp on vp.id = doc.project_id where doc.status <> 'DRAFT')
      order by at desc
      limit 15`.execute(tx);

    return {
      totals: {
        activeProjects: Number(t?.active ?? 0),
        awaitingApproval: Number(t?.awaiting ?? 0),
        overdueApprovals: Number(t?.overdue ?? 0),
        pinsAwaitingStudio: Number(t?.pins ?? 0),
        reportsDraft: Number(t?.drafts ?? 0),
        openIssues: Number(t?.issues ?? 0),
      },
      overdueThresholdDays: OVERDUE_DAYS,
      todo: todo.rows.map((r) => ({
        kind: r.kind, projectId: r.project_id, projectCode: r.project_code, refId: r.ref_id,
        label: r.label, count: Number(r.n), since: new Date(r.at).toISOString(),
      })),
      activity: activity.rows.map((r) => ({
        kind: r.kind, text: r.text, at: new Date(r.at).toISOString(),
        projectId: r.project_id, projectCode: r.project_code, ref: r.ref,
      })),
    };
  }

  /** Stato dell'ultima versione di ogni elaborato + approvazioni in attesa da oltre N giorni. */
  private async approvals(tx: Tx, projectId: string) {
    const latest = await tx.selectFrom('drawings as d')
      .innerJoin('drawing_versions as v', 'v.drawing_id', 'd.id')
      .select(['d.id', 'v.status', 'v.published_at'])
      .where('d.project_id', '=', projectId)
      .where('v.status', 'not in', ['DISCARDED', 'ERROR', 'PROCESSING'])
      .where('v.number', '=', (eb) => eb.selectFrom('drawing_versions as v2').select((e) => e.fn.max('v2.number').as('m'))
        .whereRef('v2.drawing_id', '=', 'd.id').where('v2.status', 'not in', ['DISCARDED', 'ERROR', 'PROCESSING']))
      .execute();
    const byStatus: Record<string, number> = { DRAFT: 0, PUBLISHED: 0, APPROVED: 0, SUPERSEDED: 0 };
    latest.forEach((v) => { byStatus[v.status] = (byStatus[v.status] ?? 0) + 1; });
    const threshold = Date.now() - OVERDUE_DAYS * DAY_MS;
    const awaitingOverDays = latest.filter((v) => v.status === 'PUBLISHED' && v.published_at && new Date(v.published_at).getTime() < threshold).length;
    return { byStatus, awaitingOverDays, overdueThresholdDays: OVERDUE_DAYS };
  }

  /** OPEN = in attesa di risposta dello studio; WAITING = in attesa del committente (SM-PIN). */
  private async pins(tx: Tx, projectId: string) {
    const rows = await tx.selectFrom('pins as p')
      .innerJoin('drawing_versions as v', 'v.id', 'p.version_id')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .select(['p.status', 'p.created_at'])
      .where('d.project_id', '=', projectId).where('p.status', 'in', ['OPEN', 'WAITING', 'RESOLVED']).execute();
    const open = rows.filter((r) => r.status === 'OPEN');
    const ageDays = open.length ? open.reduce((s, r) => s + (Date.now() - new Date(r.created_at).getTime()), 0) / open.length / DAY_MS : 0;
    return {
      awaitingStudio: open.length,
      awaitingClient: rows.filter((r) => r.status === 'WAITING').length,
      resolved: rows.filter((r) => r.status === 'RESOLVED').length,
      averageOpenAgeDays: Math.round(ageDays * 10) / 10,
    };
  }

  private async field(tx: Tx, projectId: string) {
    const visits = await tx.selectFrom('site_visits').select(['status', 'started_at']).where('project_id', '=', projectId).execute();
    const { n } = await tx.selectFrom('open_actions').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', projectId).where('status', '=', 'OPEN').executeTakeFirstOrThrow();
    const active = visits.filter((v) => v.status !== 'CANCELLED');
    const last = active.map((v) => new Date(v.started_at).getTime()).sort((a, b) => b - a)[0];
    return {
      visits: active.length,
      lastVisitAt: last ? new Date(last).toISOString() : null,
      drafts: visits.filter((v) => ['DRAFT', 'AI_PROCESSING', 'REVIEW'].includes(v.status)).length,
      openIssues: Number(n),
    };
  }

  private async changeRequests(tx: Tx, projectId: string) {
    const rows = await tx.selectFrom('change_requests as cr')
      .innerJoin('drawing_versions as v', 'v.id', 'cr.version_id').innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .select(['cr.status']).where('d.project_id', '=', projectId).execute();
    return {
      open: rows.filter((r) => ['SUBMITTED', 'IN_REVIEW'].includes(r.status)).length,
      extraScope: rows.filter((r) => r.status === 'ACCEPTED_EXTRA_SCOPE').length,
    };
  }

  /** Ultimi 20 eventi della commessa: pubblicazioni, pin, approvazioni, verbali, documenti. */
  private async activity(tx: Tx, projectId: string) {
    const result = await sql<{ kind: string; text: string; at: Date; ref: string }>`
      (select 'PUBLISH' as kind, concat(d.title, ' v', v.number, ' pubblicata') as text, v.published_at as at, v.id::text as ref
         from app.drawing_versions v join app.drawings d on d.id = v.drawing_id
        where d.project_id = ${projectId}::uuid and v.published_at is not null)
      union all
      (select 'PIN', concat('Pin ', p.number, ' su ', d.title), p.created_at, p.id::text
         from app.pins p join app.drawing_versions v on v.id = p.version_id join app.drawings d on d.id = v.drawing_id
        where d.project_id = ${projectId}::uuid and p.status <> 'WITHDRAWN')
      union all
      (select 'APPROVAL', concat(d.title, ' v', v.number, ' approvata'), a.approved_at, a.id::text
         from app.approvals a join app.drawing_versions v on v.id = a.version_id join app.drawings d on d.id = v.drawing_id
        where d.project_id = ${projectId}::uuid)
      union all
      (select 'VISIT', concat('Verbale n. ', s.number, case when s.status = 'CANCELLED' then ' annullato' else ' finalizzato' end), s.finalized_at, s.id::text
         from app.site_visits s where s.project_id = ${projectId}::uuid and s.finalized_at is not null)
      union all
      (select 'DOCUMENT', concat('Documento: ', doc.title), doc.created_at, doc.id::text
         from app.documents doc where doc.project_id = ${projectId}::uuid and doc.status <> 'DRAFT')
      order by at desc
      limit 20`.execute(tx);
    return result.rows.map((r) => ({ kind: r.kind, text: r.text, at: new Date(r.at).toISOString(), ref: r.ref }));
  }
}
