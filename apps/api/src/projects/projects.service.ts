import { Injectable } from '@nestjs/common';
import { nextProjectCode } from '@aph/contracts';
import { sql } from 'kysely';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import type { SiteAddress } from '../database/schema/projects';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MagicLinkService, loadStudioIdentity } from '../portal/magic-link.service';
import {
  type ProjectRow,
  type StudioScope,
  assertUuid,
  loadVisibleProject,
  requireRole,
} from '../studio/studio-scope';
import type {
  CreateProjectInput,
  ListProjectsInput,
  TransitionInput,
  UpdateProjectInput,
} from './projects.schemas';
import { ContactsService, type PendingInvite } from './contacts.service';

const MANAGERS = ['OWNER', 'ARCHITECT'] as const;

/** SM-PROGETTO: azione → (stati di partenza, stato di arrivo). */
const TRANSITIONS: Record<TransitionInput['action'], { from: ProjectRow['status'][]; to: ProjectRow['status'] }> = {
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
  REACTIVATE: { from: ['SUSPENDED'], to: 'ACTIVE' },
  CLOSE: { from: ['ACTIVE', 'SUSPENDED'], to: 'CLOSED' },
  REOPEN: { from: ['CLOSED'], to: 'ACTIVE' },
  ARCHIVE: { from: ['CLOSED'], to: 'ARCHIVED' },
  RESTORE: { from: ['ARCHIVED'], to: 'CLOSED' },
};

export function formatAddress(a: SiteAddress): string {
  const street = `${a.street}${a.number ? ` ${a.number}` : ''}`;
  const city = [a.zip, a.city, a.province ? `(${a.province})` : ''].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly contacts: ContactsService,
    private readonly magicLinks: MagicLinkService,
  ) {}

  /** FR-M1-02: elenco con ricerca, filtro di stato e paginazione server (25, max 100). */
  async list(tx: Tx, scope: StudioScope, input: ListProjectsInput) {
    let query = input.status
      ? tx.selectFrom('projects as p').where('p.status', '=', input.status)
      : tx.selectFrom('projects as p').where('p.status', '<>', 'ARCHIVED');
    if (scope.role === 'COLLABORATOR') {
      query = query.where((eb) =>
        eb.exists(
          eb.selectFrom('project_assignments as pa').select('pa.id')
            .whereRef('pa.project_id', '=', 'p.id')
            .where('pa.membership_id', '=', scope.membershipId)
            .where('pa.valid_to', 'is', null),
        ),
      );
    }
    if (input.q) {
      const like = `%${input.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('p.code', 'ilike', like),
          eb('p.title', 'ilike', like),
          eb('p.municipality', 'ilike', like),
          eb(sql<string>`p.site_address ->> 'street'`, 'ilike', like),
          eb.exists(
            eb.selectFrom('client_contacts as c').select('c.id')
              .whereRef('c.project_id', '=', 'p.id')
              .where('c.display_name', 'ilike', like),
          ),
        ]),
      );
    }
    const { total } = await query.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow();
    const rows = await query
      .selectAll('p')
      .select((eb) => [
        eb.selectFrom('client_contacts as c').select('c.display_name')
          .whereRef('c.project_id', '=', 'p.id').where('c.removed_at', 'is', null)
          .orderBy('c.created_at').limit(1).as('client_name'),
        eb.selectFrom('pins as pin')
          .innerJoin('drawing_versions as v', 'v.id', 'pin.version_id')
          .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('d.project_id', '=', 'p.id').where('pin.status', 'in', ['OPEN', 'WAITING']).as('pins_open'),
        eb.selectFrom('drawing_versions as v')
          .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('d.project_id', '=', 'p.id').where('v.status', '=', 'PUBLISHED').as('awaiting_approval'),
        eb.selectFrom('site_visits as s').select((e) => e.fn.max('s.started_at').as('m'))
          .whereRef('s.project_id', '=', 'p.id').where('s.status', '<>', 'CANCELLED').as('last_visit_at'),
      ])
      .orderBy('p.updated_at', 'desc')
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        ...this.summary(r),
        clientName: r.client_name ?? null,
        pinsOpen: Number(r.pins_open ?? 0),
        drawingsAwaitingApproval: Number(r.awaiting_approval ?? 0),
        lastVisitAt: r.last_visit_at ? new Date(r.last_visit_at as Date).toISOString() : null,
      })),
      meta: { total: Number(total), page: input.page, pageSize: input.pageSize },
    };
  }

  summary(p: ProjectRow) {
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      status: p.status,
      interventionType: p.intervention_type,
      permitType: p.permit_type,
      municipality: p.municipality,
      address: formatAddress(p.site_address),
      isDemo: p.is_demo,
      updatedAt: new Date(p.updated_at).toISOString(),
      version: p.version,
    };
  }

  /** FR-M1-04: fascicolo della commessa con team, committenti e imprese. */
  async detail(tx: Tx, scope: StudioScope, projectId: string) {
    const p = await loadVisibleProject(tx, scope, projectId);
    const team = await this.team(tx, p.id);
    const contacts = await this.contacts.list(tx, p.id);
    const contractors = await tx.selectFrom('project_contractors as pc')
      .innerJoin('contractors as c', 'c.id', 'pc.contractor_id')
      .select(['c.id', 'c.name', 'c.vat_number', 'c.contact_name', 'c.email', 'c.pec', 'c.phone', 'c.category'])
      .where('pc.project_id', '=', p.id).orderBy('c.name').execute();
    return {
      ...this.summary(p),
      description: p.description,
      siteAddress: p.site_address,
      geo: p.geo,
      cadastral: p.cadastral,
      altitudeM: p.altitude_m,
      regulationProfileVersionId: p.regulation_profile_version_id,
      startDate: p.start_date,
      endDate: p.end_date,
      tags: p.tags,
      closedAt: p.closed_at ? new Date(p.closed_at).toISOString() : null,
      team,
      contacts,
      contractors: contractors.map((c) => ({
        id: c.id, name: c.name, vatNumber: c.vat_number, contactName: c.contact_name,
        email: c.email, pec: c.pec, phone: c.phone, category: c.category,
      })),
    };
  }

  async team(tx: Tx, projectId: string) {
    const rows = await tx.selectFrom('project_assignments as pa')
      .innerJoin('memberships as m', 'm.id', 'pa.membership_id')
      .leftJoin('user_profiles as u', 'u.id', 'm.user_id')
      .select(['pa.id', 'pa.project_role', 'pa.valid_from', 'm.id as membership_id', 'm.role',
        'u.first_name', 'u.last_name', 'u.email', 'm.professional_order', 'm.registration_number'])
      .where('pa.project_id', '=', projectId).where('pa.valid_to', 'is', null)
      .orderBy('pa.valid_from').execute();
    return rows.map((r) => ({
      assignmentId: r.id,
      membershipId: r.membership_id,
      projectRole: r.project_role,
      studioRole: r.role,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || '—',
      email: r.email,
      professionalRegistration: r.registration_number ? `${r.professional_order ?? ''} n. ${r.registration_number}`.trim() : null,
      since: new Date(r.valid_from).toISOString(),
    }));
  }

  /** FR-M0-11: prossimo codice libero secondo il pattern del tenant. */
  async suggestCode(tx: Tx, scope: StudioScope, now = new Date()): Promise<string> {
    const tenant = await tx.selectFrom('tenants').select('settings').where('id', '=', scope.tenantId).executeTakeFirstOrThrow();
    const codes = await tx.selectFrom('projects').select('code').execute();
    return nextProjectCode(tenant.settings.codePattern, codes.map((c) => c.code), now);
  }

  private async assertCodeFree(tx: Tx, scope: StudioScope, code: string, exceptId?: string): Promise<void> {
    let q = tx.selectFrom('projects').select('id').where(sql<string>`lower(code)`, '=', code.toLowerCase());
    if (exceptId) q = q.where('id', '<>', exceptId);
    if (await q.executeTakeFirst()) {
      throw new AppError('CODE_UNAVAILABLE', 'Codice già in uso.', { suggestion: await this.suggestCode(tx, scope) });
    }
  }

  private async assertActiveProjectsLimit(tx: Tx): Promise<void> {
    const { n } = await tx.selectFrom('projects').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('status', '=', 'ACTIVE').where('is_demo', '=', false).executeTakeFirstOrThrow();
    await this.entitlements.assertLimit(tx, 'projects.active.max', Number(n));
  }

  private async defaultProfileVersion(tx: Tx): Promise<string | null> {
    const row = await tx.selectFrom('regulation_profile_versions as v')
      .innerJoin('regulation_profiles as p', 'p.id', 'v.profile_id')
      .select('v.id')
      .where('p.is_default', '=', true).where('v.published_at', 'is not', null)
      .orderBy('p.scope', 'desc') // TENANT prima di SYSTEM
      .orderBy('v.version_number', 'desc')
      .executeTakeFirst();
    return row?.id ?? null;
  }

  private async assertProfileVersion(tx: Tx, id: string): Promise<void> {
    assertUuid(id, 'Profilo normativo');
    const v = await tx.selectFrom('regulation_profile_versions').select('id')
      .where('id', '=', id).where('published_at', 'is not', null).executeTakeFirst();
    if (!v) throw new AppError('NOT_FOUND', 'Profilo normativo non trovato.');
  }

  /** FR-M1-01: crea commessa, Responsabile = creatore, committenti e (facoltativo) inviti al portale. */
  async create(tx: Tx, scope: StudioScope, input: CreateProjectInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    await this.assertActiveProjectsLimit(tx);
    await this.entitlements.assertLimit(tx, 'clients.per_project.max', 0, input.contacts.length);
    const code = input.code ?? (await this.suggestCode(tx, scope));
    await this.assertCodeFree(tx, scope, code);
    if (input.regulationProfileVersionId) await this.assertProfileVersion(tx, input.regulationProfileVersionId);

    const project = await tx.insertInto('projects').values({
      tenant_id: scope.tenantId,
      code,
      title: input.title,
      description: input.description ?? null,
      intervention_type: input.interventionType,
      permit_type: input.permitType ?? null,
      site_address: JSON.stringify(input.siteAddress),
      municipality: input.municipality,
      geo: JSON.stringify(input.geo ?? null),
      cadastral: JSON.stringify(input.cadastral),
      altitude_m: input.altitudeM ?? null,
      regulation_profile_version_id: input.regulationProfileVersionId ?? (await this.defaultProfileVersion(tx)),
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      tags: input.tags,
      created_by: scope.userId,
      updated_by: scope.userId,
    }).returning('id').executeTakeFirstOrThrow();

    await tx.insertInto('project_assignments').values({
      tenant_id: scope.tenantId, project_id: project.id, membership_id: scope.membershipId, project_role: 'LEAD',
    }).execute();

    const invites: PendingInvite[] = [];
    for (const [index, contact] of input.contacts.entries()) {
      const created = await this.contacts.insert(tx, scope, project.id, { ...contact, isSigner: contact.isSigner ?? index === 0 }, meta);
      if (created.invite && input.sendInvites) invites.push(created.invite);
    }
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'PROJECT_CREATED',
      objectType: 'PROJECT', objectId: project.id, details: { code }, meta,
    });
    return { detail: await this.detail(tx, scope, project.id), invites, studio: await loadStudioIdentity(tx, scope.tenantId) };
  }

  async update(tx: Tx, scope: StudioScope, projectId: string, input: UpdateProjectInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const p = await loadVisibleProject(tx, scope, projectId);
    if (p.status === 'ARCHIVED') throw new AppError('PROJECT_NOT_ACTIVE', 'Una commessa archiviata non si modifica.');
    if (input.version !== p.version) {
      throw new AppError('CONFLICT', 'La commessa è stata modificata da un altro utente. Ricarica e riprova.');
    }
    if (input.code && input.code.toLowerCase() !== p.code.toLowerCase()) await this.assertCodeFree(tx, scope, input.code, p.id);
    if (input.regulationProfileVersionId) await this.assertProfileVersion(tx, input.regulationProfileVersionId);
    const start = input.startDate === undefined ? p.start_date : input.startDate;
    const end = input.endDate === undefined ? p.end_date : input.endDate;
    if (start && end && end < start) {
      throw new AppError('VALIDATION_FAILED', 'La data di fine deve seguire quella di inizio.', { fields: [{ path: 'endDate' }] });
    }

    const patch: Record<string, unknown> = { updated_by: scope.userId };
    const map: Array<[keyof UpdateProjectInput, string, boolean?]> = [
      ['code', 'code'], ['title', 'title'], ['description', 'description'], ['interventionType', 'intervention_type'],
      ['permitType', 'permit_type'], ['siteAddress', 'site_address', true], ['municipality', 'municipality'],
      ['geo', 'geo', true], ['cadastral', 'cadastral', true], ['altitudeM', 'altitude_m'],
      ['regulationProfileVersionId', 'regulation_profile_version_id'], ['startDate', 'start_date'],
      ['endDate', 'end_date'], ['tags', 'tags'],
    ];
    for (const [key, column, json] of map) {
      if (input[key] !== undefined) patch[column] = json ? JSON.stringify(input[key]) : input[key];
    }
    await tx.updateTable('projects').set(patch).where('id', '=', p.id).where('version', '=', p.version).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'PROJECT_UPDATED',
      objectType: 'PROJECT', objectId: p.id, details: { fields: Object.keys(patch).filter((k) => k !== 'updated_by') }, meta,
    });
    return this.detail(tx, scope, p.id);
  }

  /** FR-M1-03: transizioni SM-PROGETTO con conferma (lato UI) e audit. */
  async transition(tx: Tx, scope: StudioScope, projectId: string, input: TransitionInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const p = await loadVisibleProject(tx, scope, projectId);
    const rule = TRANSITIONS[input.action];
    if (!rule.from.includes(p.status)) {
      throw new AppError('INVALID_TRANSITION', 'Operazione non consentita nello stato attuale della commessa.', {
        from: p.status, action: input.action,
      });
    }
    if (rule.to === 'ACTIVE') await this.assertActiveProjectsLimit(tx);
    const now = new Date();
    const dates: { closed_at?: Date | null; archived_at?: Date | null } = {};
    if (input.action === 'CLOSE') dates.closed_at = now;
    if (input.action === 'REOPEN') dates.closed_at = null;
    if (input.action === 'ARCHIVE') dates.archived_at = now;
    if (input.action === 'RESTORE') dates.archived_at = null;
    await tx.updateTable('projects').set({ status: rule.to, updated_by: scope.userId, ...dates }).where('id', '=', p.id).execute();

    const actor = { type: 'USER' as const, id: scope.userId };
    if (input.action === 'ARCHIVE' || (input.action === 'CLOSE' && input.revokeLinksNow)) {
      await this.magicLinks.revokeForProject(tx, scope.tenantId, p.id, `PROJECT_${input.action}`, actor, meta);
    }
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: `PROJECT_${input.action}`,
      objectType: 'PROJECT', objectId: p.id, details: { from: p.status, to: rule.to }, meta,
    });
    return this.detail(tx, scope, p.id);
  }
}
