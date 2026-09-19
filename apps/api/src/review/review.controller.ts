import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { ENV, type Env } from '../config/env';
import type { Tx } from '../database/database';
import { Mailer, brandedHtml } from '../mail/mailer';
import { loadStudioIdentity } from '../portal/magic-link.service';
import { type StudioScope, StudioDb, loadVisibleProject, requireRole } from '../studio/studio-scope';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import { DrawingsService } from './drawings.service';
import { PinsService, type ReviewActor } from './pins.service';
import { SignoffService } from './signoff.service';

const CATEGORIES = ['PLAN', 'SECTION', 'ELEVATION', 'DETAIL', 'RENDER', 'SURVEY', 'OTHER'] as const;
const drawingSchema = z.object({
  title: z.string().trim().min(1).max(150),
  sheetCode: z.string().trim().max(30).optional().nullable(),
  category: z.enum(CATEGORIES).default('OTHER'),
  phase: z.string().trim().max(50).optional().nullable(),
  scale: z.string().trim().max(20).optional().nullable(),
  clientNotes: z.string().trim().max(2000).optional().nullable(),
  downloadAllowed: z.boolean().default(false),
});
const commentBody = z.string().trim().min(1, 'Scrivi un commento').max(5000);
const pinSchema = z.object({
  pageIndex: z.number().int().min(0),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  body: commentBody,
  category: z.string().max(40).optional().nullable(),
});
const publishSchema = z.object({
  versionIds: z.array(z.string().uuid()).min(1).max(50),
  reviewDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  notifyClients: z.boolean().default(true),
});
const assessSchema = z.object({
  status: z.enum(['IN_REVIEW', 'ACCEPTED_IN_SCOPE', 'ACCEPTED_EXTRA_SCOPE', 'REJECTED', 'CLOSED']),
  note: z.string().trim().max(2000).optional().nullable(),
  indicativeAmountCents: z.number().int().min(0).optional().nullable(),
  visibleToClient: z.boolean().optional(),
});

/** Modulo 2 lato studio: elaborati, versioni, pin e approvazioni (FR-M2-01..18). */
@Controller('studio/projects/:projectId')
@UseGuards(AuthGuard, TenantGuard)
export class ReviewController {
  private readonly logger = new Logger('Review');

  constructor(
    private readonly studio: StudioDb,
    private readonly drawings: DrawingsService,
    private readonly pins: PinsService,
    private readonly signoff: SignoffService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Esegue come membro dello studio sulla commessa (visibilità verificata, BR-04). */
  private asMember<T>(
    user: AuthUser, tenant: TenantContext, projectId: string,
    fn: (tx: Tx, actor: ReviewActor, scope: StudioScope) => Promise<T>,
  ): Promise<T> {
    return this.studio.run(user, tenant, async (tx, scope) => {
      const project = await loadVisibleProject(tx, scope, projectId);
      return fn(tx, { type: 'MEMBER', id: scope.userId, tenantId: scope.tenantId, projectId: project.id }, scope);
    });
  }

  @Get('drawings')
  list(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string) {
    return this.studio.run(u, t, (tx, scope) => this.drawings.list(tx, scope, projectId));
  }

  @Post('drawings')
  @HttpCode(201)
  create(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(drawingSchema, b);
    return this.studio.run(u, t, (tx, scope) => this.drawings.create(tx, scope, projectId, input, meta));
  }

  @Patch('drawings/:drawingId')
  @HttpCode(204)
  async update(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('drawingId') drawingId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(drawingSchema.partial(), b);
    await this.studio.run(u, t, (tx, scope) => this.drawings.update(tx, scope, projectId, drawingId, input, meta));
  }

  @Get('drawings/:drawingId/versions')
  versions(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Param('drawingId') drawingId: string) {
    return this.studio.run(u, t, (tx, scope) => this.drawings.versions(tx, scope, projectId, drawingId));
  }

  /** Avvia l'upload di una nuova versione: restituisce l'URL firmato per caricare direttamente. */
  @Post('drawings/:drawingId/versions')
  @HttpCode(201)
  startUpload(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('drawingId') drawingId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(z.object({ revisionNote: z.string().trim().max(1000).optional().nullable() }), b ?? {});
    return this.studio.run(u, t, (tx, scope) => this.drawings.startUpload(tx, scope, projectId, drawingId, input.revisionNote ?? null, meta));
  }

  @Post('drawings/:drawingId/versions/:versionId/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('drawingId') drawingId: string, @Param('versionId') versionId: string, @Meta() meta: RequestMeta,
  ) {
    return this.studio.run(u, t, (tx, scope) => this.drawings.completeUpload(tx, scope, projectId, drawingId, versionId, meta));
  }

  @Post('drawings/:drawingId/versions/:versionId/withdraw')
  @HttpCode(204)
  async withdraw(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('drawingId') drawingId: string, @Param('versionId') versionId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(u, t, (tx, scope) => this.drawings.withdraw(tx, scope, projectId, drawingId, versionId, meta));
  }

  @Delete('drawings/:drawingId/versions/:versionId')
  @HttpCode(204)
  async discard(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('drawingId') drawingId: string, @Param('versionId') versionId: string, @Meta() meta: RequestMeta,
  ) {
    await this.studio.run(u, t, (tx, scope) => this.drawings.discard(tx, scope, projectId, drawingId, versionId, meta));
  }

  /** FR-M2-04: pubblica una o più bozze; ogni committente riceve UNA sola email (AC-FR-M2-04-1). */
  @Post('publish')
  @HttpCode(200)
  async publish(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(publishSchema, b);
    const result = await this.studio.run(u, t, async (tx, scope) => {
      const published = await this.drawings.publish(tx, scope, projectId, input.versionIds, input.reviewDueDate ?? null, meta);
      const recipients = await tx.selectFrom('client_contacts').select(['display_name', 'email'])
        .where('project_id', '=', published.project.id).where('removed_at', 'is', null).where('portal_enabled', '=', true).execute();
      return { published, recipients, studio: await loadStudioIdentity(tx, scope.tenantId) };
    });
    const notified = input.notifyClients ? await this.notifyPublication(t.slug, result, input.message ?? null) : 0;
    return { published: result.published.drawings.length, notified };
  }

  private async notifyPublication(
    slug: string,
    result: {
      published: { project: { title: string }; drawings: Array<{ title: string; sheetCode: string | null; number: number }> };
      recipients: Array<{ display_name: string; email: string }>;
      studio: { name: string; email: string | null; primaryColor: string };
    },
    message: string | null,
  ): Promise<number> {
    const list = result.published.drawings.map((d) => `• ${d.sheetCode ? `${d.sheetCode} — ` : ''}${d.title} (versione ${d.number})`);
    const url = `${this.env.APP_BASE_URL.replace(/\/$/, '')}/portale?studio=${encodeURIComponent(slug)}`;
    let notified = 0;
    for (const r of result.recipients) {
      const paragraphs = [
        `Gentile ${r.display_name},`,
        `${result.studio.name} ha pubblicato ${list.length === 1 ? 'un elaborato' : `${list.length} elaborati`} della commessa "${result.published.project.title}":`,
        ...list,
        ...(message ? [message] : []),
        'Puoi consultarli, commentarli e approvarli dal portale.',
      ];
      try {
        await this.mailer.send({
          to: [r.email],
          subject: `${result.studio.name} — nuovi elaborati da revisionare`,
          senderName: result.studio.name,
          replyTo: result.studio.email,
          text: `${paragraphs.join('\n')}\n\n${url}`,
          html: brandedHtml({
            studioName: result.studio.name, primaryColor: result.studio.primaryColor,
            title: 'Nuovi elaborati da revisionare', paragraphs, cta: { label: 'Apri il portale', url },
          }),
        });
        notified += 1;
      } catch (error) {
        this.logger.warn(`Notifica di pubblicazione non inviata: ${(error as Error).message}`);
      }
    }
    return notified;
  }

  @Get('versions/:versionId')
  view(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Param('versionId') versionId: string) {
    return this.asMember(u, t, projectId, (tx, actor) => this.pins.view(tx, actor, versionId));
  }

  @Get('versions/:versionId/file')
  file(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('versionId') versionId: string, @Query('download') download?: string,
  ) {
    return this.asMember(u, t, projectId, (tx, actor) => this.drawings.fileUrl(tx, versionId, actor.projectId, download === 'true'));
  }

  @Get('versions/:versionId/freeze-log')
  freezeLog(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Param('versionId') versionId: string) {
    return this.asMember(u, t, projectId, (tx, actor) => this.signoff.freezeLog(tx, actor, versionId));
  }

  @Post('versions/:versionId/pins')
  @HttpCode(201)
  createPin(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('versionId') versionId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(pinSchema, b);
    return this.asMember(u, t, projectId, (tx, actor) => this.pins.createPin(tx, actor, versionId, input, meta));
  }

  @Post('versions/:versionId/transfer-pins')
  @HttpCode(200)
  transfer(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('versionId') versionId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(z.object({ fromVersionId: z.string().uuid() }), b);
    return this.asMember(u, t, projectId, (tx, actor) => this.pins.transfer(tx, actor, input.fromVersionId, versionId, meta));
  }

  @Post('pins/:pinId/comments')
  @HttpCode(201)
  comment(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('pinId') pinId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(z.object({ body: commentBody }), b);
    return this.asMember(u, t, projectId, (tx, actor) => this.pins.comment(tx, actor, pinId, input.body, meta));
  }

  @Patch('comments/:commentId')
  @HttpCode(204)
  async editComment(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('commentId') commentId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(z.object({ body: commentBody }), b);
    await this.asMember(u, t, projectId, (tx, actor) => this.pins.editComment(tx, actor, commentId, input.body, meta));
  }

  @Post('pins/:pinId/resolve')
  @HttpCode(204)
  async resolve(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Param('pinId') pinId: string, @Meta() meta: RequestMeta) {
    await this.asMember(u, t, projectId, (tx, actor) => this.pins.resolve(tx, actor, pinId, meta));
  }

  @Post('pins/:pinId/reopen')
  @HttpCode(204)
  async reopen(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('pinId') pinId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(z.object({ body: commentBody }), b);
    await this.asMember(u, t, projectId, (tx, actor) => this.pins.reopen(tx, actor, pinId, input.body, meta));
  }

  @Post('pins/:pinId/withdraw')
  @HttpCode(204)
  async withdrawPin(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string, @Param('pinId') pinId: string, @Meta() meta: RequestMeta) {
    await this.asMember(u, t, projectId, (tx, actor) => this.pins.withdraw(tx, actor, pinId, meta));
  }

  @Get('change-requests')
  changeRequests(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string) {
    return this.asMember(u, t, projectId, (tx, actor) => this.signoff.listChangeRequests(tx, actor));
  }

  @Patch('change-requests/:requestId')
  @HttpCode(204)
  async assess(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string,
    @Param('requestId') requestId: string, @Body() b: unknown, @Meta() meta: RequestMeta,
  ) {
    const input = parseBody(assessSchema, b);
    await this.asMember(u, t, projectId, (tx, actor, scope) => {
      requireRole(scope, ['OWNER', 'ARCHITECT']);
      return this.signoff.assessChangeRequest(tx, actor, requestId, input, meta);
    });
  }
}
