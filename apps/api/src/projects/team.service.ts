import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { z } from 'zod';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import { type StudioScope, assertUuid, loadVisibleProject, requireRole } from '../studio/studio-scope';
import type { assignmentSchema, contractorSchema } from './projects.schemas';

const MANAGERS = ['OWNER', 'ARCHITECT'] as const;
type AssignmentInput = z.infer<typeof assignmentSchema>;
type ContractorInput = z.infer<typeof contractorSchema>;

/** Team di commessa (BR-17) e rubrica imprese del tenant (FR-M1-01). */
@Injectable()
export class TeamService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Assegna un membro con un ruolo di commessa. Per il DL (SITE_DIRECTOR) il cambio chiude
   * l'incarico precedente con la data di decorrenza, così lo storico resta (BR-17).
   */
  async assign(tx: Tx, scope: StudioScope, projectId: string, input: AssignmentInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    const member = await tx.selectFrom('memberships').select(['id', 'status'])
      .where('id', '=', input.membershipId).executeTakeFirst();
    if (!member || member.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Membro dello studio non trovato.');

    const now = new Date();
    if (input.projectRole === 'SITE_DIRECTOR') {
      await tx.updateTable('project_assignments').set({ valid_to: now })
        .where('project_id', '=', project.id).where('project_role', '=', 'SITE_DIRECTOR')
        .where('valid_to', 'is', null).where('membership_id', '<>', member.id).execute();
    }
    const existing = await tx.selectFrom('project_assignments').select('id')
      .where('project_id', '=', project.id).where('membership_id', '=', member.id)
      .where('project_role', '=', input.projectRole).where('valid_to', 'is', null).executeTakeFirst();
    if (!existing) {
      await tx.insertInto('project_assignments').values({
        tenant_id: scope.tenantId, project_id: project.id, membership_id: member.id,
        project_role: input.projectRole, valid_from: now,
      }).execute();
    }
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'PROJECT_MEMBER_ASSIGNED',
      objectType: 'PROJECT', objectId: project.id, details: { membershipId: member.id, projectRole: input.projectRole }, meta,
    });
  }

  async unassign(tx: Tx, scope: StudioScope, projectId: string, assignmentId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(assignmentId, 'Assegnazione');
    const row = await tx.selectFrom('project_assignments').select(['id', 'project_role'])
      .where('id', '=', assignmentId).where('project_id', '=', project.id).where('valid_to', 'is', null).executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND', 'Assegnazione non trovata.');
    if (row.project_role === 'LEAD') {
      const { n } = await tx.selectFrom('project_assignments').select((eb) => eb.fn.countAll<string>().as('n'))
        .where('project_id', '=', project.id).where('project_role', '=', 'LEAD').where('valid_to', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(n) <= 1) throw new AppError('CONFLICT', 'La commessa deve avere almeno un Responsabile.');
    }
    await tx.updateTable('project_assignments').set({ valid_to: new Date() }).where('id', '=', row.id).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'PROJECT_MEMBER_UNASSIGNED',
      objectType: 'PROJECT', objectId: project.id, details: { assignmentId: row.id, projectRole: row.project_role }, meta,
    });
  }

  async listContractors(tx: Tx, q?: string) {
    let query = tx.selectFrom('contractors').selectAll().orderBy('name').limit(100);
    if (q) query = query.where(sql<string>`lower(name)`, 'like', `%${q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const rows = await query.execute();
    return rows.map((c) => ({
      id: c.id, name: c.name, vatNumber: c.vat_number, contactName: c.contact_name,
      email: c.email, pec: c.pec, phone: c.phone, category: c.category,
    }));
  }

  async createContractor(tx: Tx, scope: StudioScope, input: ContractorInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const row = await tx.insertInto('contractors').values({
      tenant_id: scope.tenantId, name: input.name, vat_number: input.vatNumber ?? null,
      contact_name: input.contactName ?? null, email: input.email ?? null, pec: input.pec ?? null,
      phone: input.phone ?? null, category: input.category ?? null,
    }).returning('id').executeTakeFirstOrThrow();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CONTRACTOR_CREATED',
      objectType: 'CONTRACTOR', objectId: row.id, meta,
    });
    return row;
  }

  async linkContractor(tx: Tx, scope: StudioScope, projectId: string, contractorId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(contractorId, 'Impresa');
    const contractor = await tx.selectFrom('contractors').select('id').where('id', '=', contractorId).executeTakeFirst();
    if (!contractor) throw new AppError('NOT_FOUND', 'Impresa non trovata.');
    await tx.insertInto('project_contractors')
      .values({ tenant_id: scope.tenantId, project_id: project.id, contractor_id: contractor.id })
      .onConflict((oc) => oc.doNothing()).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CONTRACTOR_LINKED',
      objectType: 'PROJECT', objectId: project.id, details: { contractorId: contractor.id }, meta,
    });
  }

  async unlinkContractor(tx: Tx, scope: StudioScope, projectId: string, contractorId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(contractorId, 'Impresa');
    await tx.deleteFrom('project_contractors')
      .where('project_id', '=', project.id).where('contractor_id', '=', contractorId).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CONTRACTOR_UNLINKED',
      objectType: 'PROJECT', objectId: project.id, details: { contractorId }, meta,
    });
  }
}
