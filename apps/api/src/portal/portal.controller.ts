import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { isValidTenantSlug } from '@aph/contracts';
import { sql } from 'kysely';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { AuditService, Meta, type RequestMeta } from '../common/audit';
import { RateLimiter } from '../common/rate-limit';
import { parseBody } from '../common/zod';
import { DatabaseService, type Tx } from '../database/database';
import { DocumentsService } from '../documents/documents.service';
import { DrawingsService } from '../review/drawings.service';
import { FileStorage } from '../storage/file-storage';
import { PinsService, type ReviewActor } from '../review/pins.service';
import { DECLARATION_VERSION, SignoffService, declarationText } from '../review/signoff.service';
import { MagicLinkService, loadStudioIdentity } from './magic-link.service';
import { CurrentPortal, type PortalContext, PortalGuard, PortalSessionService } from './portal-session';

const commentBody = z.string().trim().min(1, 'Scrivi un commento').max(5000);
const pinSchema = z.object({
  pageIndex: z.number().int().min(0),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  body: commentBody,
});
const approveSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/, 'Il codice ha 6 cifre'),
  declarationAccepted: z.literal(true, { message: 'Serve accettare la dichiarazione' }),
  openPinsAcknowledged: z.boolean().default(false),
});
const changeSchema = z.object({
  description: z.string().trim().min(5).max(5000),
  position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), pageIndex: z.number().int().min(0) }).optional().nullable(),
});

const actorOf = (p: PortalContext): ReviewActor => ({ type: 'CLIENT', id: p.contactId, tenantId: p.tenantId, projectId: p.projectId });

/**
 * Portale del committente (Modulo 2, BR-25). Nessun account: il committente entra con il
 * Magic Link e opera solo sulla propria commessa, solo sugli elaborati pubblicati.
 * Commessa Sospesa o Chiusa (in periodo di grazia): sola lettura (SM-PROGETTO).
 */
@Controller('portal')
export class PortalController {
  private readonly logger = new Logger('Portal');

  constructor(
    private readonly sessions: PortalSessionService,
    private readonly database: DatabaseService,
    private readonly pins: PinsService,
    private readonly signoff: SignoffService,
    private readonly drawings: DrawingsService,
    private readonly magicLinks: MagicLinkService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly documents: DocumentsService,
    private readonly storage: FileStorage,
  ) {}

  private async assertWritable(tx: Tx, portal: PortalContext): Promise<void> {
    const p = await tx.selectFrom('projects').select('status').where('id', '=', portal.projectId).executeTakeFirstOrThrow();
    if (p.status !== 'ACTIVE') throw new AppError('PROJECT_NOT_ACTIVE', 'La commessa è in sola lettura.');
  }

  private write<T>(portal: PortalContext, fn: (tx: Tx, actor: ReviewActor) => Promise<T>): Promise<T> {
    return this.sessions.withPortal(portal, async (tx) => {
      await this.assertWritable(tx, portal);
      return fn(tx, actorOf(portal));
    });
  }

  /** Scambio Magic Link → sessione (cookie HttpOnly). La pagina imposta Referrer-Policy: no-referrer. */
  @Post('session')
  @HttpCode(200)
  async open(@Body() b: unknown, @Meta() meta: RequestMeta, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.limiter.hit(`portal-open:${meta.ip}`, 30, 10 * 60 * 1000);
    const { token } = parseBody(z.object({ token: z.string().min(1).max(100) }), b);
    const { secret, portal } = await this.sessions.open(token, meta);
    this.sessions.setCookie(req, res, secret);
    return this.sessions.withPortal(portal, (tx) => this.context(tx, portal));
  }

  @Get('context')
  @UseGuards(PortalGuard)
  current(@CurrentPortal() portal: PortalContext) {
    return this.sessions.withPortal(portal, (tx) => this.context(tx, portal));
  }

  private async context(tx: Tx, portal: PortalContext) {
    const project = await tx.selectFrom('projects').select(['id', 'code', 'title', 'status', 'site_address', 'municipality', 'permit_type'])
      .where('id', '=', portal.projectId).executeTakeFirstOrThrow();
    const contact = await tx.selectFrom('client_contacts').select(['display_name', 'is_signer', 'privacy_acknowledged_at', 'notification_mode'])
      .where('id', '=', portal.contactId).executeTakeFirstOrThrow();
    const tenant = await tx.selectFrom('tenants as t').leftJoin('tenant_branding as b', 'b.tenant_id', 't.id')
      .select(['t.name', 't.slug', 't.email', 't.phone', 'b.primary_color', 'b.secondary_color', 'b.portal_theme', 'b.logo_keys'])
      .where('t.id', '=', portal.tenantId).executeTakeFirstOrThrow();
    const street = `${project.site_address.street}${project.site_address.number ? ` ${project.site_address.number}` : ''}`;
    // NFR-BRAND-01: il portale mostra il logo dello studio (URL firmato a tempo, niente bucket pubblico).
    const logoKey = tenant.logo_keys?.['primary'] ?? null;
    const logoUrl = logoKey ? await this.storage.createDownloadUrl(logoKey, 3600).catch(() => null) : null;
    return {
      studio: {
        name: tenant.name, slug: tenant.slug, email: tenant.email, phone: tenant.phone,
        primaryColor: tenant.primary_color ?? '#1F2937', secondaryColor: tenant.secondary_color,
        portalTheme: tenant.portal_theme ?? 'LIGHT', hasLogo: Boolean(logoKey), logoUrl,
      },
      project: {
        id: project.id, code: project.code, title: project.title, status: project.status,
        address: `${street}, ${project.municipality}`, permitType: project.permit_type,
      },
      contact: {
        name: contact.display_name, isSigner: contact.is_signer, privacyAcknowledged: Boolean(contact.privacy_acknowledged_at),
        notificationMode: contact.notification_mode,
      },
      readOnly: project.status !== 'ACTIVE',
    };
  }

  /** FR-M1-05 punto 3: presa visione dell'informativa privacy al primo accesso. */
  @Post('privacy-ack')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async privacyAck(@CurrentPortal() portal: PortalContext, @Meta() meta: RequestMeta) {
    await this.sessions.withPortal(portal, async (tx) => {
      const updated = await tx.updateTable('client_contacts').set({ privacy_acknowledged_at: new Date() })
        .where('id', '=', portal.contactId).where('privacy_acknowledged_at', 'is', null).returning('id').executeTakeFirst();
      if (updated) {
        await this.audit.record(tx, {
          tenantId: portal.tenantId, actorType: 'CLIENT', actorId: portal.contactId, action: 'PRIVACY_ACKNOWLEDGED',
          objectType: 'CLIENT_CONTACT', objectId: portal.contactId, meta,
        });
      }
    });
  }

  /** FR-M2-12 / FR-MT-06: il committente sceglie tra avvisi raggruppati, riepilogo giornaliero o nessuno. */
  @Patch('preferences')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async preferences(@CurrentPortal() portal: PortalContext, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(z.object({ notificationMode: z.enum(['GROUPED', 'DAILY', 'OFF']) }), b);
    await this.sessions.withPortal(portal, async (tx) => {
      await tx.updateTable('client_contacts').set({ notification_mode: input.notificationMode }).where('id', '=', portal.contactId).execute();
      // Le notifiche già in coda seguono la nuova scelta: con OFF non partono.
      if (input.notificationMode === 'OFF') {
        await tx.updateTable('notifications').set({ status: 'SKIPPED' })
          .where('recipient_type', '=', 'CLIENT').where('recipient_id', '=', portal.contactId).where('status', '=', 'PENDING').execute();
      }
      await this.audit.record(tx, {
        tenantId: portal.tenantId, actorType: 'CLIENT', actorId: portal.contactId, action: 'NOTIFICATION_PREFERENCES_UPDATED',
        objectType: 'CLIENT_CONTACT', objectId: portal.contactId, details: input, meta,
      });
    });
  }

  @Delete('session')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async close(@CurrentPortal() portal: PortalContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.close(portal);
    this.sessions.clearCookie(res);
  }

  /**
   * FR-M1-05 punto 7: il committente chiede un nuovo link con la propria email.
   * Risposta sempre identica, anche se l'email non esiste (nessuna enumerazione).
   */
  @Post('request-link')
  @HttpCode(202)
  async requestLink(@Body() b: unknown, @Meta() meta: RequestMeta) {
    this.limiter.hit(`portal-link:${meta.ip}`, 5, 60 * 60 * 1000);
    const input = parseBody(z.object({ slug: z.string().trim().toLowerCase(), email: z.string().trim().toLowerCase().email() }), b);
    const response = { message: 'Se l’indirizzo è registrato, riceverai a breve un’email con il link di accesso.' };
    if (!isValidTenantSlug(input.slug)) return response;
    const ctx = await sql<{ ctx: { tenantId: string } | null }>`select app.public_tenant_context(${input.slug}) as ctx`.execute(this.database.db);
    const tenantId = ctx.rows[0]?.ctx?.tenantId;
    if (!tenantId) return response;
    try {
      const pending = await this.database.withContext({ tenantId }, async (tx) => {
        const contacts = await tx.selectFrom('client_contacts as c').innerJoin('projects as p', 'p.id', 'c.project_id')
          .select(['c.id', 'c.project_id', 'c.display_name', 'c.email', 'p.title'])
          .where('c.email', '=', input.email).where('c.removed_at', 'is', null).where('c.portal_enabled', '=', true)
          .where('p.status', 'in', ['ACTIVE', 'SUSPENDED']).limit(10).execute();
        const studio = await loadStudioIdentity(tx, tenantId);
        const items: Array<{ ref: { id: string; projectId: string; displayName: string; email: string }; title: string; token: string }> = [];
        for (const c of contacts) {
          const ref = { id: c.id, projectId: c.project_id, displayName: c.display_name, email: c.email };
          items.push({ ref, title: c.title, token: await this.magicLinks.issueSelfService(tx, tenantId, ref, meta) });
        }
        return { studio, items };
      });
      for (const item of pending.items) await this.magicLinks.sendInvite(pending.studio, item.ref, item.title, item.token);
    } catch (error) {
      this.logger.warn(`Richiesta link non completata: ${(error as Error).message}`);
    }
    return response;
  }

  // ---- Elaborati (solo pubblicati, BR-25) -----------------------------------------------------

  @Get('drawings')
  @UseGuards(PortalGuard)
  list(@CurrentPortal() portal: PortalContext) {
    return this.sessions.withPortal(portal, async (tx) => {
      const rows = await tx.selectFrom('drawings as d')
        .innerJoin('drawing_versions as v', 'v.drawing_id', 'd.id')
        .select((eb) => [
          'd.id', 'd.title', 'd.sheet_code', 'd.category', 'd.client_notes', 'd.download_allowed',
          'v.id as version_id', 'v.number', 'v.status', 'v.published_at', 'v.review_due_date',
          eb.selectFrom('pins as p').select((e) => e.fn.countAll<string>().as('n'))
            .whereRef('p.version_id', '=', 'v.id').where('p.status', 'in', ['OPEN', 'WAITING']).as('pins_open'),
        ])
        .where('d.project_id', '=', portal.projectId)
        .where('v.status', 'in', ['PUBLISHED', 'APPROVED', 'SUPERSEDED'])
        .orderBy('d.sheet_code').orderBy('v.number', 'desc').execute();
      return rows.map((r) => ({
        drawingId: r.id, title: r.title, sheetCode: r.sheet_code, category: r.category, notes: r.client_notes,
        downloadAllowed: r.download_allowed, versionId: r.version_id, version: r.number, status: r.status,
        publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, reviewDueDate: r.review_due_date,
        pinsOpen: Number(r.pins_open ?? 0),
      }));
    });
  }

  @Get('versions/:versionId')
  @UseGuards(PortalGuard)
  view(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string) {
    return this.sessions.withPortal(portal, (tx) => this.pins.view(tx, actorOf(portal), versionId));
  }

  /** FR-M2-18: il file si vede sempre; si scarica solo se lo studio lo consente. URL valido 5 minuti. */
  @Get('versions/:versionId/file')
  @UseGuards(PortalGuard)
  file(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string, @Query('download') download?: string) {
    return this.sessions.withPortal(portal, async (tx) => {
      const version = await this.pins.loadVersion(tx, actorOf(portal), versionId);
      const wantsDownload = download === 'true';
      if (wantsDownload && !version.download_allowed) throw new AppError('FORBIDDEN', 'Lo studio non ha abilitato il download di questo elaborato.');
      return this.drawings.fileUrl(tx, version.id, portal.projectId, wantsDownload);
    });
  }

  @Post('versions/:versionId/pins')
  @HttpCode(201)
  @UseGuards(PortalGuard)
  createPin(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(pinSchema, b);
    return this.write(portal, (tx, actor) => this.pins.createPin(tx, actor, versionId, input, meta));
  }

  @Post('pins/:pinId/comments')
  @HttpCode(201)
  @UseGuards(PortalGuard)
  comment(@CurrentPortal() portal: PortalContext, @Param('pinId') pinId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(z.object({ body: commentBody }), b);
    return this.write(portal, (tx, actor) => this.pins.comment(tx, actor, pinId, input.body, meta));
  }

  @Patch('comments/:commentId')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async editComment(@CurrentPortal() portal: PortalContext, @Param('commentId') commentId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(z.object({ body: commentBody }), b);
    await this.write(portal, (tx, actor) => this.pins.editComment(tx, actor, commentId, input.body, meta));
  }

  @Post('pins/:pinId/reopen')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async reopen(@CurrentPortal() portal: PortalContext, @Param('pinId') pinId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(z.object({ body: commentBody }), b);
    await this.write(portal, (tx, actor) => this.pins.reopen(tx, actor, pinId, input.body, meta));
  }

  @Post('pins/:pinId/withdraw')
  @HttpCode(204)
  @UseGuards(PortalGuard)
  async withdraw(@CurrentPortal() portal: PortalContext, @Param('pinId') pinId: string, @Meta() meta: RequestMeta) {
    await this.write(portal, (tx, actor) => this.pins.withdraw(tx, actor, pinId, meta));
  }

  // ---- Approvazione (FR-M2-15) e richieste di modifica (FR-M2-17) ------------------------------

  /**
   * FR-M2-15: dati per la finestra di approvazione. Il testo della dichiarazione è quello che
   * il server registrerà: il committente legge esattamente ciò che accetta.
   */
  @Get('versions/:versionId/sign-off')
  @UseGuards(PortalGuard)
  signOffInfo(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string) {
    return this.sessions.withPortal(portal, async (tx) => {
      const version = await this.pins.loadVersion(tx, actorOf(portal), versionId);
      const contact = await tx.selectFrom('client_contacts').select(['display_name', 'is_signer'])
        .where('id', '=', portal.contactId).executeTakeFirstOrThrow();
      const project = await tx.selectFrom('projects').select('status').where('id', '=', portal.projectId).executeTakeFirstOrThrow();
      const { n } = await tx.selectFrom('pins').select((eb) => eb.fn.countAll<string>().as('n'))
        .where('version_id', '=', version.id).where('status', 'in', ['OPEN', 'WAITING']).executeTakeFirstOrThrow();
      return {
        canApprove: contact.is_signer && version.status === 'PUBLISHED' && project.status === 'ACTIVE',
        isSigner: contact.is_signer,
        openPins: Number(n),
        declarationText: declarationText(contact.display_name, version.title, version.number),
        declarationVersion: DECLARATION_VERSION,
      };
    });
  }

  @Post('otp')
  @HttpCode(201)
  @UseGuards(PortalGuard)
  async otp(@CurrentPortal() portal: PortalContext, @Meta() meta: RequestMeta) {
    this.limiter.hit(`portal-otp:${portal.contactId}`, 5, 60 * 60 * 1000);
    const prepared = await this.write(portal, (tx, actor) => this.signoff.requestOtp(tx, actor, meta));
    await prepared.send();
    return { challengeId: prepared.challengeId, sentTo: prepared.sentTo, expiresInSec: prepared.expiresInSec };
  }

  @Post('versions/:versionId/approve')
  @HttpCode(201)
  @UseGuards(PortalGuard)
  async approve(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    this.limiter.hit(`portal-approve:${portal.contactId}`, 10, 10 * 60 * 1000);
    const input = parseBody(approveSchema, b);
    const approval = await this.write(portal, (tx, actor) => this.signoff.approve(tx, actor, versionId, input, meta));
    // FR-M5-10 / R-07: riepilogo PDF generato e inviato subito a committente e studio. Un errore qui non annulla l'approvazione.
    try {
      await this.sessions.withPortal(portal, async (tx) => {
        const doc = await this.documents.generateApprovalSummary(tx, portal.tenantId, approval.approvalId, null);
        const client = await tx.selectFrom('client_contacts').select(['display_name', 'email']).where('id', '=', portal.contactId).executeTakeFirstOrThrow();
        const studio = await tx.selectFrom('project_assignments as pa').innerJoin('memberships as m', 'm.id', 'pa.membership_id')
          .innerJoin('user_profiles as u', 'u.id', 'm.user_id').select(['u.email', 'u.first_name'])
          .where('pa.project_id', '=', portal.projectId).where('pa.project_role', '=', 'LEAD').where('pa.valid_to', 'is', null).execute();
        const recipients = [{ email: client.email, name: client.display_name }, ...studio.map((s) => ({ email: s.email, name: s.first_name ?? undefined }))];
        await this.documents.sendAsSystem(tx, portal.tenantId, doc.id, recipients);
      });
    } catch (error) {
      this.logger.error(`Riepilogo di approvazione non generato per ${approval.approvalId}: ${(error as Error).message}`);
    }
    return approval;
  }

  // ---- Documenti condivisi (FR-M1-07) ----------------------------------------------------------

  @Get('documents')
  @UseGuards(PortalGuard)
  sharedDocuments(@CurrentPortal() portal: PortalContext) {
    return this.sessions.withPortal(portal, async (tx) => {
      const rows = await tx.selectFrom('documents').selectAll().where('project_id', '=', portal.projectId)
        .where('shared_with_client', '=', true).where('status', 'in', ['FINAL', 'SIGNED']).orderBy('created_at', 'desc').execute();
      return rows.map((d) => {
        const dto = this.documents.dto(d);
        return { id: dto.id, type: dto.type, title: dto.title, number: dto.number, revision: dto.revision, createdAt: dto.createdAt, signed: dto.signed, verificationCode: dto.verificationCode };
      });
    });
  }

  @Get('documents/:documentId/download')
  @UseGuards(PortalGuard)
  downloadDocument(@CurrentPortal() portal: PortalContext, @Param('documentId') documentId: string) {
    return this.sessions.withPortal(portal, async (tx) => {
      const doc = await this.documents.load(tx, portal.projectId, documentId);
      const key = doc.signed_file_key ?? doc.file_key;
      if (!doc.shared_with_client || !['FINAL', 'SIGNED'].includes(doc.status) || !key) throw new AppError('NOT_FOUND', 'Documento non trovato.');
      return { url: await this.storage.createDownloadUrl(key, 300, doc.file_name ?? 'documento.pdf'), expiresInSec: 300 };
    });
  }

  @Post('versions/:versionId/change-requests')
  @HttpCode(201)
  @UseGuards(PortalGuard)
  requestChange(@CurrentPortal() portal: PortalContext, @Param('versionId') versionId: string, @Body() b: unknown, @Meta() meta: RequestMeta) {
    const input = parseBody(changeSchema, b);
    return this.write(portal, (tx, actor) => this.signoff.requestChange(tx, actor, versionId, input, meta));
  }

  @Get('change-requests')
  @UseGuards(PortalGuard)
  changeRequests(@CurrentPortal() portal: PortalContext) {
    return this.sessions.withPortal(portal, (tx) => this.signoff.listChangeRequests(tx, actorOf(portal)));
  }
}
