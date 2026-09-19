import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MagicLinkService } from '../portal/magic-link.service';
import { type StudioScope, assertProjectWritable, assertUuid, loadVisibleProject, requireRole } from '../studio/studio-scope';
import type { ContactInput } from './projects.schemas';

export interface PendingInvite {
  contact: { id: string; projectId: string; displayName: string; email: string };
  projectTitle: string;
  token: string;
}

const MANAGERS = ['OWNER', 'ARCHITECT'] as const;

/** Committenti della commessa e loro accesso al portale (FR-M1-01, FR-M1-05/06). */
@Injectable()
export class ContactsService {
  constructor(
    private readonly magicLinks: MagicLinkService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Elenco con stato del link e ultimo accesso (widget "Committenti", FR-M1-04). */
  async list(tx: Tx, projectId: string) {
    const rows = await tx.selectFrom('client_contacts as c')
      .select((eb) => [
        'c.id', 'c.kind', 'c.display_name', 'c.tax_id', 'c.email', 'c.phone', 'c.address', 'c.role_in_project',
        'c.is_signer', 'c.portal_enabled', 'c.email_status', 'c.privacy_acknowledged_at', 'c.version',
        eb.selectFrom('access_tokens as a').select('a.status')
          .whereRef('a.client_contact_id', '=', 'c.id').orderBy('a.created_at', 'desc').limit(1).as('link_status'),
        eb.selectFrom('client_sessions as s')
          .innerJoin('access_tokens as a', 'a.id', 's.access_token_id')
          .select((e) => e.fn.max('s.last_seen_at').as('m'))
          .whereRef('a.client_contact_id', '=', 'c.id').as('last_access_at'),
      ])
      .where('c.project_id', '=', projectId)
      .where('c.removed_at', 'is', null)
      .orderBy('c.created_at')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      displayName: r.display_name,
      taxId: r.tax_id,
      email: r.email,
      phone: r.phone,
      address: r.address,
      roleInProject: r.role_in_project,
      isSigner: r.is_signer,
      portalEnabled: r.portal_enabled,
      emailStatus: r.email_status,
      privacyAcknowledgedAt: r.privacy_acknowledged_at ? new Date(r.privacy_acknowledged_at).toISOString() : null,
      linkStatus: (r.link_status as string | null) ?? 'NONE',
      lastAccessAt: r.last_access_at ? new Date(r.last_access_at as Date).toISOString() : null,
      version: r.version,
    }));
  }

  /** Inserisce un committente; se ha accesso al portale genera il Magic Link (invio dopo il commit). */
  async insert(tx: Tx, scope: StudioScope, projectId: string, input: ContactInput, meta: RequestMeta) {
    const contact = await tx.insertInto('client_contacts').values({
      tenant_id: scope.tenantId,
      project_id: projectId,
      kind: input.kind,
      display_name: input.displayName,
      tax_id: input.taxId ?? null,
      email: input.email,
      phone: input.phone ?? null,
      address: input.address ?? null,
      role_in_project: input.roleInProject ?? null,
      is_signer: input.isSigner ?? false,
      portal_enabled: input.portalEnabled,
    }).returning(['id', 'display_name', 'email']).executeTakeFirstOrThrow();

    let invite: PendingInvite | null = null;
    if (input.portalEnabled) {
      const project = await tx.selectFrom('projects').select('title').where('id', '=', projectId).executeTakeFirstOrThrow();
      const ref = { id: contact.id, projectId, displayName: contact.display_name, email: contact.email };
      const token = await this.magicLinks.issue(tx, scope.tenantId, ref, { type: 'USER', id: scope.userId }, meta);
      invite = { contact: ref, projectTitle: project.title, token };
    }
    return { id: contact.id, invite };
  }

  async add(tx: Tx, scope: StudioScope, projectId: string, input: ContactInput, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const project = await loadVisibleProject(tx, scope, projectId);
    assertProjectWritable(project);
    const { n } = await tx.selectFrom('client_contacts').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', project.id).where('removed_at', 'is', null).executeTakeFirstOrThrow();
    await this.entitlements.assertLimit(tx, 'clients.per_project.max', Number(n));
    const created = await this.insert(tx, scope, project.id, input, meta);
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CLIENT_CONTACT_ADDED',
      objectType: 'CLIENT_CONTACT', objectId: created.id, details: { projectId: project.id }, meta,
    });
    return created;
  }

  private async loadContact(tx: Tx, scope: StudioScope, projectId: string, contactId: string) {
    const project = await loadVisibleProject(tx, scope, projectId);
    assertUuid(contactId, 'Committente');
    const contact = await tx.selectFrom('client_contacts').selectAll()
      .where('id', '=', contactId).where('project_id', '=', project.id).where('removed_at', 'is', null)
      .executeTakeFirst();
    if (!contact) throw new AppError('NOT_FOUND', 'Committente non trovato.');
    return { project, contact };
  }

  async update(tx: Tx, scope: StudioScope, projectId: string, contactId: string, input: Partial<ContactInput>, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const { contact } = await this.loadContact(tx, scope, projectId, contactId);
    const emailChanged = input.email !== undefined && input.email !== contact.email;
    await tx.updateTable('client_contacts').set({
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
      ...(input.taxId !== undefined ? { tax_id: input.taxId } : {}),
      ...(input.email !== undefined ? { email: input.email, email_status: 'OK' as const } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.roleInProject !== undefined ? { role_in_project: input.roleInProject } : {}),
      ...(input.isSigner !== undefined ? { is_signer: input.isSigner } : {}),
      ...(input.portalEnabled !== undefined ? { portal_enabled: input.portalEnabled } : {}),
    }).where('id', '=', contact.id).execute();

    // Cambio email o accesso disattivato: il vecchio link non deve più valere (FR-M1-06, revoca automatica).
    const actor = { type: 'USER' as const, id: scope.userId };
    if (emailChanged || input.portalEnabled === false) {
      await this.magicLinks.revokeForContacts(tx, scope.tenantId, [contact.id], emailChanged ? 'EMAIL_CHANGED' : 'PORTAL_DISABLED', actor, meta);
    }
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CLIENT_CONTACT_UPDATED',
      objectType: 'CLIENT_CONTACT', objectId: contact.id, details: { fields: Object.keys(input) }, meta,
    });
  }

  /** Rimozione logica: il contatto resta per lo storico (approvazioni), il link si revoca. */
  async remove(tx: Tx, scope: StudioScope, projectId: string, contactId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const { project, contact } = await this.loadContact(tx, scope, projectId, contactId);
    const { n } = await tx.selectFrom('client_contacts').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', project.id).where('removed_at', 'is', null).executeTakeFirstOrThrow();
    if (Number(n) <= 1) throw new AppError('CONFLICT', 'Una commessa deve avere almeno un committente.');
    await tx.updateTable('client_contacts').set({ removed_at: new Date(), portal_enabled: false }).where('id', '=', contact.id).execute();
    await this.magicLinks.revokeForContacts(tx, scope.tenantId, [contact.id], 'CONTACT_REMOVED', { type: 'USER', id: scope.userId }, meta);
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'CLIENT_CONTACT_REMOVED',
      objectType: 'CLIENT_CONTACT', objectId: contact.id, meta,
    });
  }

  /** FR-M1-06: rigenerazione (revoca + nuovo token). Il link in chiaro torna una volta sola. */
  async regenerateLink(tx: Tx, scope: StudioScope, projectId: string, contactId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const { project, contact } = await this.loadContact(tx, scope, projectId, contactId);
    if (!contact.portal_enabled) throw new AppError('CONFLICT', 'Il committente non ha l’accesso al portale abilitato.');
    const ref = { id: contact.id, projectId: project.id, displayName: contact.display_name, email: contact.email };
    const token = await this.magicLinks.issue(tx, scope.tenantId, ref, { type: 'USER', id: scope.userId }, meta);
    const invite: PendingInvite = { contact: ref, projectTitle: project.title, token };
    return { invite, url: this.magicLinks.portalUrl(token) };
  }

  async revokeLink(tx: Tx, scope: StudioScope, projectId: string, contactId: string, meta: RequestMeta) {
    requireRole(scope, MANAGERS);
    const { contact } = await this.loadContact(tx, scope, projectId, contactId);
    const n = await this.magicLinks.revokeForContacts(tx, scope.tenantId, [contact.id], 'REVOKED_BY_STUDIO', { type: 'USER', id: scope.userId }, meta);
    return { revoked: n };
  }

  /** Pannello "Accessi": ultimi 20 accessi con dispositivo e IP troncato (FR-M1-05 punto 5). */
  async accessLog(tx: Tx, scope: StudioScope, projectId: string, contactId: string) {
    const { contact } = await this.loadContact(tx, scope, projectId, contactId);
    const rows = await tx.selectFrom('client_sessions as s')
      .innerJoin('access_tokens as a', 'a.id', 's.access_token_id')
      .select(['s.created_at', 's.last_seen_at', 's.ip_truncated', 's.user_agent', 's.revoked_at'])
      .where('a.client_contact_id', '=', contact.id)
      .orderBy('s.last_seen_at', 'desc').limit(20).execute();
    return rows.map((r) => ({
      firstSeenAt: new Date(r.created_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      ip: r.ip_truncated,
      userAgent: r.user_agent,
      active: !r.revoked_at,
    }));
  }
}
