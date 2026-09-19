import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { AppError } from '../common/app-error';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { StudioDb } from '../studio/studio-scope';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import { RaiCalcService } from './rai-calc.service';
import { type RaiEntity, RaiStructureService } from './rai-structure.service';
import {
  buildingSchema,
  derogationSchema,
  openingPatchSchema,
  openingSchema,
  openingTypePatchSchema,
  openingTypeSchema,
  roomSchema,
  snapshotSchema,
  unitSchema,
} from './rai.schemas';

const DELETABLE: Record<string, RaiEntity> = {
  buildings: 'building', units: 'unit', rooms: 'room', openings: 'opening', 'opening-types': 'opening-type', derogations: 'derogation',
};

/** Modulo 3 — R.A.I. persistente e calcolo lato server (FR-M3-01..16). */
@Controller('studio')
@UseGuards(AuthGuard, TenantGuard)
export class RaiController {
  constructor(
    private readonly studio: StudioDb,
    private readonly structure: RaiStructureService,
    private readonly calc: RaiCalcService,
  ) {}

  @Get('regulation-profiles')
  profiles(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext) {
    return this.studio.run(u, t, (tx) => this.calc.listProfiles(tx));
  }

  /** Struttura completa con esiti per vano e unità, riepilogo e deficit (FR-M3-10/14/15). */
  @Get('projects/:projectId/rai')
  results(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') projectId: string) {
    return this.studio.run(u, t, (tx, scope) => this.calc.projectResults(tx, scope, projectId));
  }

  @Post('projects/:projectId/rai/buildings')
  @HttpCode(201)
  createBuilding(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(buildingSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.createBuilding(tx, s, p, input, m));
  }

  @Patch('projects/:projectId/rai/buildings/:id')
  @HttpCode(204)
  async updateBuilding(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(buildingSchema.partial(), b);
    await this.studio.run(u, t, (tx, s) => this.structure.updateBuilding(tx, s, p, id, input, m));
  }

  @Post('projects/:projectId/rai/buildings/:id/units')
  @HttpCode(201)
  createUnit(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(unitSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.createUnit(tx, s, p, id, input, m));
  }

  @Patch('projects/:projectId/rai/units/:id')
  @HttpCode(204)
  async updateUnit(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(unitSchema.partial(), b);
    await this.studio.run(u, t, (tx, s) => this.structure.updateUnit(tx, s, p, id, input, m));
  }

  @Post('projects/:projectId/rai/units/:id/rooms')
  @HttpCode(201)
  createRoom(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(roomSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.createRoom(tx, s, p, id, input, m));
  }

  @Patch('projects/:projectId/rai/rooms/:id')
  @HttpCode(204)
  async updateRoom(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(roomSchema.partial(), b);
    await this.studio.run(u, t, (tx, s) => this.structure.updateRoom(tx, s, p, id, input, m));
  }

  @Post('projects/:projectId/rai/rooms/:id/openings')
  @HttpCode(201)
  createOpening(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(openingSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.createOpening(tx, s, p, id, input, m));
  }

  @Patch('projects/:projectId/rai/openings/:id')
  @HttpCode(204)
  async updateOpening(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(openingPatchSchema, b);
    await this.studio.run(u, t, (tx, s) => this.structure.updateOpening(tx, s, p, id, input, m));
  }

  @Get('projects/:projectId/rai/opening-types')
  openingTypes(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string) {
    return this.studio.run(u, t, (tx, s) => this.structure.listOpeningTypes(tx, s, p));
  }

  @Post('projects/:projectId/rai/opening-types')
  @HttpCode(201)
  createOpeningType(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(openingTypeSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.createOpeningType(tx, s, p, input, m));
  }

  /** Restituisce quanti vani vengono ricalcolati (AC-FR-M3-07-1). */
  @Patch('projects/:projectId/rai/opening-types/:id')
  updateOpeningType(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(openingTypePatchSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.updateOpeningType(tx, s, p, id, input, m));
  }

  @Post('projects/:projectId/rai/rooms/:id/derogations')
  @HttpCode(201)
  roomDerogation(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(derogationSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.addDerogation(tx, s, p, { roomId: id }, input, m));
  }

  @Post('projects/:projectId/rai/units/:id/derogations')
  @HttpCode(201)
  unitDerogation(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('id') id: string, @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(derogationSchema, b);
    return this.studio.run(u, t, (tx, s) => this.structure.addDerogation(tx, s, p, { unitId: id }, input, m));
  }

  @Get('projects/:projectId/rai/snapshots')
  snapshots(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string) {
    return this.studio.run(u, t, (tx, s) => this.calc.listSnapshots(tx, s, p));
  }

  /** FR-M3-16: emissione di una revisione immutabile del calcolo (base della relazione per CILA/SCIA). */
  @Post('projects/:projectId/rai/snapshots')
  @HttpCode(201)
  snapshot(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(snapshotSchema, b ?? {});
    return this.studio.run(u, t, (tx, s) => this.calc.createSnapshot(tx, s, p, input.reason ?? null, m));
  }

  @Delete('projects/:projectId/rai/:kind/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('projectId') p: string,
    @Param('kind') kind: string, @Param('id') id: string, @Meta() m: RequestMeta,
  ) {
    const entity = DELETABLE[kind];
    if (!entity) throw new AppError('NOT_FOUND', 'Risorsa non trovata.');
    await this.studio.run(u, t, (tx, s) => this.structure.remove(tx, s, p, entity, id, m));
  }
}
