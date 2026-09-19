import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { StudioDb } from '../studio/studio-scope';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import { FieldService } from './field.service';

const SECTIONS = ['PROGRESS', 'ISSUES', 'ORDERS', 'GENERAL'] as const;
const isoDateTime = z.string().datetime({ offset: true });
const weatherSchema = z.object({
  condition: z.string().trim().min(1).max(60),
  temperatureC: z.number().min(-40).max(60).optional(),
  source: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
});
const visitSchema = z.object({
  id: z.string().uuid(),
  visitType: z.enum(['ORDINARY', 'EXTRAORDINARY', 'TESTING', 'OTHER']).default('ORDINARY'),
  startedAt: isoDateTime,
  endedAt: isoDateTime.optional().nullable(),
  weather: weatherSchema.optional().nullable(),
  phase: z.string().trim().max(100).optional().nullable(),
  generalNotes: z.string().trim().max(5000).optional().nullable(),
});
const attendeesSchema = z.array(z.object({
  kind: z.enum(['MEMBER', 'CLIENT', 'CONTRACTOR', 'OTHER']),
  refId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(150),
  qualification: z.string().trim().max(100).optional().nullable(),
  organization: z.string().trim().max(150).optional().nullable(),
  isDirector: z.boolean().default(false),
})).max(100);
const itemSchema = z.object({
  section: z.enum(SECTIONS),
  text: z.string().trim().min(1).max(5000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
  addressee: z.string().trim().max(150).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  needsVerification: z.boolean().default(false),
  origin: z.enum(['AI', 'HUMAN', 'AI_EDITED']).default('HUMAN'),
  photoRefs: z.array(z.string().uuid()).max(50).default([]),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
const mediaSchema = z.object({
  id: z.string().uuid(),
  takenAt: isoDateTime.optional().nullable(),
  caption: z.string().trim().max(500).optional().nullable(),
  section: z.enum(SECTIONS).optional().nullable(),
  durationSec: z.number().int().min(1).max(3600).optional().nullable(),
});
const photoPatchSchema = z.object({
  caption: z.string().trim().max(500).optional().nullable(),
  section: z.enum(SECTIONS).optional().nullable(),
  includeInReport: z.boolean().optional(),
});

/** Modulo 4 — Diario di cantiere (FR-M4-02..15). */
@Controller('studio')
@UseGuards(AuthGuard, TenantGuard)
export class FieldController {
  constructor(
    private readonly studio: StudioDb,
    private readonly field: FieldService,
  ) {}

  @Get('field/sites')
  sites(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext) {
    return this.studio.run(u, t, (tx, s) => this.field.mySites(tx, s));
  }

  @Get('projects/:projectId/visits')
  list(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string) {
    return this.studio.run(u, t, (tx, s) => this.field.list(tx, s, p));
  }

  @Post('projects/:projectId/visits')
  @HttpCode(201)
  create(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(visitSchema, b);
    return this.studio.run(u, t, (tx, s) => this.field.create(tx, s, p, input, m));
  }

  @Get('projects/:projectId/visits/:visitId')
  detail(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string) {
    return this.studio.run(u, t, (tx, s) => this.field.detail(tx, s, p, v));
  }

  @Patch('projects/:projectId/visits/:visitId')
  @HttpCode(204)
  async update(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(visitSchema.omit({ id: true }).partial(), b);
    await this.studio.run(u, t, (tx, s) => this.field.update(tx, s, p, v, input, m));
  }

  @Put('projects/:projectId/visits/:visitId/attendees')
  @HttpCode(204)
  async attendees(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Body() b: unknown) {
    const input = parseBody(attendeesSchema, b);
    await this.studio.run(u, t, (tx, s) => this.field.setAttendees(tx, s, p, v, input));
  }

  /** Voci del verbale; con l'header X-Client-Op-Id la stessa operazione offline si applica una volta sola (BR-24). */
  @Post('projects/:projectId/visits/:visitId/items')
  @HttpCode(201)
  addItem(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Body() b: unknown, @Headers('x-client-op-id') opId?: string,
  ) {
    const input = parseBody(itemSchema, b);
    return this.studio.run(u, t, (tx, s) => this.field.idempotent(tx, s, opId, 'ADD_ITEM', () => this.field.addItem(tx, s, p, v, input)));
  }

  @Patch('projects/:projectId/visits/:visitId/items/:itemId')
  @HttpCode(204)
  async updateItem(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Param('itemId') itemId: string, @Body() b: unknown,
  ) {
    const input = parseBody(itemSchema.partial(), b);
    await this.studio.run(u, t, (tx, s) => this.field.updateItem(tx, s, p, v, itemId, input));
  }

  @Delete('projects/:projectId/visits/:visitId/items/:itemId')
  @HttpCode(204)
  async removeItem(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Param('itemId') itemId: string) {
    await this.studio.run(u, t, (tx, s) => this.field.removeItem(tx, s, p, v, itemId));
  }

  // ---- Foto e audio (upload diretto con URL firmato, poi conferma) -------------------------------

  @Post('projects/:projectId/visits/:visitId/photos')
  @HttpCode(201)
  startPhoto(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Body() b: unknown) {
    const input = parseBody(mediaSchema, b);
    return this.studio.run(u, t, (tx, s) => this.field.startMedia(tx, s, p, v, 'photo', input));
  }

  @Post('projects/:projectId/visits/:visitId/audio')
  @HttpCode(201)
  startAudio(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Body() b: unknown) {
    const input = parseBody(mediaSchema, b);
    return this.studio.run(u, t, (tx, s) => this.field.startMedia(tx, s, p, v, 'audio', input));
  }

  @Post('projects/:projectId/visits/:visitId/photos/:mediaId/complete')
  @HttpCode(200)
  completePhoto(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Param('mediaId') id: string) {
    return this.studio.run(u, t, (tx, s) => this.field.completeMedia(tx, s, p, v, 'photo', id));
  }

  @Post('projects/:projectId/visits/:visitId/audio/:mediaId/complete')
  @HttpCode(200)
  completeAudio(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Param('mediaId') id: string) {
    return this.studio.run(u, t, (tx, s) => this.field.completeMedia(tx, s, p, v, 'audio', id));
  }

  @Patch('projects/:projectId/visits/:visitId/photos/:photoId')
  @HttpCode(204)
  async updatePhoto(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Param('photoId') photoId: string, @Body() b: unknown,
  ) {
    const input = parseBody(photoPatchSchema, b);
    await this.studio.run(u, t, (tx, s) => this.field.updatePhoto(tx, s, p, v, photoId, input));
  }

  @Delete('projects/:projectId/visits/:visitId/photos/:mediaId')
  @HttpCode(204)
  async removePhoto(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Param('mediaId') id: string) {
    await this.studio.run(u, t, (tx, s) => this.field.removeMedia(tx, s, p, v, 'photo', id));
  }

  @Delete('projects/:projectId/visits/:visitId/audio/:mediaId')
  @HttpCode(204)
  async removeAudio(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Param('mediaId') id: string) {
    await this.studio.run(u, t, (tx, s) => this.field.removeMedia(tx, s, p, v, 'audio', id));
  }

  @Put('projects/:projectId/visits/:visitId/photo-order')
  @HttpCode(204)
  async reorder(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Param('visitId') v: string, @Body() b: unknown) {
    const input = parseBody(z.object({ photoIds: z.array(z.string().uuid()).max(500) }), b);
    await this.studio.run(u, t, (tx, s) => this.field.reorderPhotos(tx, s, p, v, input.photoIds));
  }

  // ---- Chiusura del verbale ---------------------------------------------------------------------

  @Post('projects/:projectId/visits/:visitId/finalize')
  @HttpCode(200)
  finalize(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(z.object({ resolvedActionIds: z.array(z.string().uuid()).max(200).default([]) }), b ?? {});
    return this.studio.run(u, t, (tx, s) => this.field.finalize(tx, s, p, v, input.resolvedActionIds, m));
  }

  @Post('projects/:projectId/visits/:visitId/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('visitId') v: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(z.object({ reason: z.string().trim().min(10, 'Motivo di almeno 10 caratteri').max(1000) }), b);
    await this.studio.run(u, t, (tx, s) => this.field.cancel(tx, s, p, v, input.reason, m));
  }
}
