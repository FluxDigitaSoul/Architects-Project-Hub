import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { StudioDb, loadVisibleProject } from '../studio/studio-scope';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import { DocumentsService } from './documents.service';

const generateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SITE_REPORT'), visitId: z.string().uuid() }),
  z.object({ type: z.literal('RAI_REPORT'), snapshotId: z.string().uuid() }),
  z.object({ type: z.literal('RAI_CHECK'), snapshotId: z.string().uuid() }),
]);
const sendSchema = z.object({
  channel: z.enum(['EMAIL', 'MANUAL_PEC']).default('EMAIL'),
  recipients: z.array(z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(150).optional() })).min(1).max(20),
  message: z.string().trim().max(2000).optional().nullable(),
});

/** Modulo 5 — Documentale: generazione, archivio, firma, condivisione e invio (FR-M5-*). */
@Controller('studio/projects/:projectId/documents')
@UseGuards(AuthGuard, TenantGuard)
export class DocumentsController {
  constructor(
    private readonly studio: StudioDb,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string) {
    return this.studio.run(u, t, (tx, s) => this.documents.list(tx, s, p));
  }

  /** Genera verbale (da sopralluogo finalizzato), relazione asseverativa o report di verifica (da snapshot R.A.I.). */
  @Post()
  @HttpCode(201)
  generate(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(generateSchema, b);
    return this.studio.run(u, t, (tx, s) => {
      if (input.type === 'SITE_REPORT') return this.documents.generateSiteReport(tx, s, p, input.visitId, m);
      return this.documents.generateRaiReport(tx, s, p, input.snapshotId, input.type === 'RAI_REPORT' ? 'ATTESTATION' : 'CHECK', m);
    });
  }

  @Get(':documentId/download')
  download(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('documentId') d: string) {
    return this.studio.run(u, t, (tx, s) => this.documents.downloadUrl(tx, s, p, d));
  }

  /** Contenuto del PDF servito dall'API (serve per i documenti annullati, con filigrana). */
  @Get(':documentId/content')
  async content(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('documentId') d: string, @Res() res: Response,
  ) {
    const file = await this.studio.run(u, t, async (tx, s) => {
      const project = await loadVisibleProject(tx, s, p);
      const doc = await this.documents.load(tx, project.id, d);
      return { name: doc.file_name ?? 'documento.pdf', body: await this.documents.content(doc) };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.body);
  }

  @Post(':documentId/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('documentId') d: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(z.object({ reason: z.string().trim().min(10, 'Motivo di almeno 10 caratteri').max(1000) }), b);
    await this.studio.run(u, t, (tx, s) => this.documents.cancel(tx, s, p, d, input.reason, m));
  }

  /** FR-M5-02: il professionista scarica il PDF, lo firma in PAdES e lo ricarica. */
  @Post(':documentId/signed-upload')
  @HttpCode(201)
  startSigned(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('documentId') d: string) {
    return this.studio.run(u, t, (tx, s) => this.documents.startSignedUpload(tx, s, p, d));
  }

  @Post(':documentId/signed-upload/complete')
  @HttpCode(200)
  completeSigned(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('documentId') d: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(z.object({ key: z.string().min(10).max(500) }), b);
    return this.studio.run(u, t, (tx, s) => this.documents.completeSignedUpload(tx, s, p, d, input.key, m));
  }

  @Post(':documentId/share')
  @HttpCode(204)
  async share(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('documentId') d: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(z.object({ shared: z.boolean() }), b);
    await this.studio.run(u, t, (tx, s) => this.documents.share(tx, s, p, d, input.shared, m));
  }

  @Post(':documentId/send')
  @HttpCode(200)
  send(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('documentId') d: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(sendSchema, b);
    return this.studio.run(u, t, (tx, s) => this.documents.send(tx, s, p, d, input, m));
  }

  @Get(':documentId/deliveries')
  deliveries(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('documentId') d: string) {
    return this.studio.run(u, t, (tx, s) => this.documents.deliveries(tx, s, p, d));
  }
}

const studioListSchema = z.object({
  type: z.enum(['SITE_REPORT', 'RAI_REPORT', 'RAI_CHECK', 'APPROVAL_SUMMARY', 'PIN_EXPORT', 'UPLOAD']).optional(),
  status: z.enum(['DRAFT', 'FINAL', 'SIGNED', 'CANCELLED']).optional(),
  q: z.string().trim().max(100).optional(),
});

/** Archivio documentale dello studio su tutte le commesse visibili (FR-M5-06). */
@Controller('studio/documents')
@UseGuards(AuthGuard, TenantGuard)
export class StudioDocumentsController {
  constructor(
    private readonly studio: StudioDb,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Query() query: unknown) {
    const filter = parseBody(studioListSchema, query);
    return this.studio.run(u, t, (tx, s) => this.documents.listStudio(tx, s, filter));
  }
}
