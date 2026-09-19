import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { MagicLinkService, type StudioIdentity, loadStudioIdentity } from '../portal/magic-link.service';
import { StudioDb } from '../studio/studio-scope';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import { ContactsService, type PendingInvite } from './contacts.service';
import { DashboardService } from './dashboard.service';
import {
  assignmentSchema,
  contactSchema,
  contractorSchema,
  createProjectSchema,
  listProjectsSchema,
  transitionSchema,
  updateProjectSchema,
} from './projects.schemas';
import { ProjectsService } from './projects.service';
import { TeamService } from './team.service';

/** Modulo 1 — Fascicolo di commessa (FR-M1-01..06). */
@Controller('studio')
@UseGuards(AuthGuard, TenantGuard)
export class ProjectsController {
  private readonly logger = new Logger('Projects');

  constructor(
    private readonly studio: StudioDb,
    private readonly projects: ProjectsService,
    private readonly contacts: ContactsService,
    private readonly team: TeamService,
    private readonly magicLinks: MagicLinkService,
    private readonly dashboards: DashboardService,
  ) {}

  /** Le email partono solo dopo il commit; un errore di invio non annulla l'operazione (il link si può reinviare). */
  private async sendInvites(studio: StudioIdentity, invites: PendingInvite[]): Promise<number> {
    let sent = 0;
    for (const invite of invites) {
      try {
        await this.magicLinks.sendInvite(studio, invite.contact, invite.projectTitle, invite.token);
        sent += 1;
      } catch (error) {
        this.logger.warn(`Invito non inviato al contatto ${invite.contact.id}: ${(error as Error).message}`);
      }
    }
    return sent;
  }

  /** FR-M1-04: dashboard dello studio su tutte le commesse visibili. */
  @Get('dashboard')
  studioDashboard(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext) {
    return this.studio.run(user, tenant, (tx, scope) => this.dashboards.studio(tx, scope));
  }

  @Get('projects')
  list(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const input = parseBody(listProjectsSchema, query);
    return this.studio.run(user, tenant, (tx, scope) => this.projects.list(tx, scope, input));
  }

  @Get('projects/next-code')
  async nextCode(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext) {
    return { code: await this.studio.run(user, tenant, (tx, scope) => this.projects.suggestCode(tx, scope)) };
  }

  @Post('projects')
  @HttpCode(201)
  async create(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(createProjectSchema, body);
    const result = await this.studio.run(user, tenant, (tx, scope) => this.projects.create(tx, scope, input, meta));
    const invitesSent = await this.sendInvites(result.studio, result.invites);
    return { ...result.detail, invitesSent };
  }

  /** FR-M1-04: widget della dashboard della commessa. */
  @Get('projects/:id/dashboard')
  dashboard(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.studio.run(user, tenant, (tx, scope) => this.dashboards.project(tx, scope, id));
  }

  @Get('projects/:id')
  detail(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.studio.run(user, tenant, (tx, scope) => this.projects.detail(tx, scope, id));
  }

  @Patch('projects/:id')
  update(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Body() body: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(updateProjectSchema, body);
    return this.studio.run(user, tenant, (tx, scope) => this.projects.update(tx, scope, id, input, meta));
  }

  @Post('projects/:id/transition')
  @HttpCode(200)
  transition(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Body() body: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(transitionSchema, body);
    return this.studio.run(user, tenant, (tx, scope) => this.projects.transition(tx, scope, id, input, meta));
  }

  // ---- Committenti e Magic Link --------------------------------------------------------------

  /** Con `?send=false` il link non parte per email: si restituisce l'URL da condividere a mano. */
  @Post('projects/:id/contacts')
  @HttpCode(201)
  async addContact(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Query('send') send: string | undefined, @Body() body: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(contactSchema, body);
    const result = await this.studio.run(user, tenant, async (tx, scope) => ({
      created: await this.contacts.add(tx, scope, id, input, meta),
      studio: await loadStudioIdentity(tx, scope.tenantId),
    }));
    const invite = result.created.invite;
    if (!invite) return { id: result.created.id, invitesSent: 0, url: null };
    if (send === 'false') return { id: result.created.id, invitesSent: 0, url: this.magicLinks.portalUrl(invite.token) };
    return { id: result.created.id, invitesSent: await this.sendInvites(result.studio, [invite]), url: null };
  }

  @Patch('projects/:id/contacts/:contactId')
  @HttpCode(204)
  async updateContact(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contactId') contactId: string, @Body() body: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(contactSchema.partial(), body);
    await this.studio.run(user, tenant, (tx, scope) => this.contacts.update(tx, scope, id, contactId, input, meta));
  }

  @Delete('projects/:id/contacts/:contactId')
  @HttpCode(204)
  async removeContact(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contactId') contactId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(user, tenant, (tx, scope) => this.contacts.remove(tx, scope, id, contactId, meta));
  }

  /** Rigenera il link: revoca il precedente, invia l'email (salvo ?send=false) e restituisce l'URL da copiare. */
  @Post('projects/:id/contacts/:contactId/link')
  @HttpCode(201)
  async regenerateLink(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contactId') contactId: string, @Query('send') send: string | undefined, @Meta() meta: RequestMeta,
  ) {
    const result = await this.studio.run(user, tenant, async (tx, scope) => ({
      ...(await this.contacts.regenerateLink(tx, scope, id, contactId, meta)),
      studio: await loadStudioIdentity(tx, scope.tenantId),
    }));
    const invitesSent = send === 'false' ? 0 : await this.sendInvites(result.studio, [result.invite]);
    return { url: result.url, invitesSent };
  }

  @Delete('projects/:id/contacts/:contactId/link')
  revokeLink(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contactId') contactId: string, @Meta() meta: RequestMeta,
  ) {
    return this.studio.run(user, tenant, (tx, scope) => this.contacts.revokeLink(tx, scope, id, contactId, meta));
  }

  @Get('projects/:id/contacts/:contactId/accesses')
  accesses(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.studio.run(user, tenant, (tx, scope) => this.contacts.accessLog(tx, scope, id, contactId));
  }

  // ---- Team e imprese ------------------------------------------------------------------------

  @Post('projects/:id/team')
  @HttpCode(204)
  async assign(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Body() body: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(assignmentSchema, body);
    await this.studio.run(user, tenant, (tx, scope) => this.team.assign(tx, scope, id, input, meta));
  }

  @Delete('projects/:id/team/:assignmentId')
  @HttpCode(204)
  async unassign(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('assignmentId') assignmentId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(user, tenant, (tx, scope) => this.team.unassign(tx, scope, id, assignmentId, meta));
  }

  @Get('contractors')
  contractors(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.studio.run(user, tenant, (tx) => this.team.listContractors(tx, q?.slice(0, 100)));
  }

  @Post('contractors')
  @HttpCode(201)
  createContractor(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(contractorSchema, body);
    return this.studio.run(user, tenant, (tx, scope) => this.team.createContractor(tx, scope, input, meta));
  }

  @Post('projects/:id/contractors/:contractorId')
  @HttpCode(204)
  async linkContractor(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contractorId') contractorId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(user, tenant, (tx, scope) => this.team.linkContractor(tx, scope, id, contractorId, meta));
  }

  @Delete('projects/:id/contractors/:contractorId')
  @HttpCode(204)
  async unlinkContractor(
    @CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext, @Param('id') id: string,
    @Param('contractorId') contractorId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(user, tenant, (tx, scope) => this.team.unlinkContractor(tx, scope, id, contractorId, meta));
  }
}
