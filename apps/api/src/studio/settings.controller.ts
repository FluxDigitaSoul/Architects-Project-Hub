import { Body, Controller, Get, HttpCode, Logger, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { Meta, type RequestMeta } from '../common/audit';
import { parseBody } from '../common/zod';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';
import {
  SettingsService,
  brandingSchema,
  inviteSchema,
  memberUpdateSchema,
  myProfileSchema,
  studioProfileSchema,
  studioSettingsSchema,
} from './settings.service';
import { StudioDb } from './studio-scope';

const logoKind = z.enum(['primary', 'print', 'icon']);

/** Impostazioni dello studio, profilo personale e membri (FR-M0-02..11, FR-MT-04). */
@Controller('studio')
@UseGuards(AuthGuard, TenantGuard)
export class SettingsController {
  private readonly logger = new Logger('Settings');

  constructor(
    private readonly studio: StudioDb,
    private readonly settings: SettingsService,
  ) {}

  @Get('settings')
  get(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext) {
    return this.studio.run(u, t, (tx, s) => this.settings.get(tx, s));
  }

  @Patch('settings/profile')
  @HttpCode(204)
  async profile(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(studioProfileSchema, b);
    await this.studio.run(u, t, (tx, s) => this.settings.updateProfile(tx, s, input, m));
  }

  @Patch('settings/operations')
  @HttpCode(204)
  async operations(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(studioSettingsSchema, b);
    await this.studio.run(u, t, (tx, s) => this.settings.updateSettings(tx, s, input, m));
  }

  @Patch('settings/branding')
  @HttpCode(204)
  async branding(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(brandingSchema, b);
    await this.studio.run(u, t, (tx, s) => this.settings.updateBranding(tx, s, input, m));
  }

  @Post('settings/logo/:kind')
  @HttpCode(201)
  startLogo(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('kind') kind: string) {
    const k = parseBody(logoKind, kind);
    return this.studio.run(u, t, (_tx, s) => this.settings.startLogoUpload(s, k));
  }

  @Post('settings/logo/:kind/complete')
  @HttpCode(204)
  async completeLogo(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('kind') kind: string,
    @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const k = parseBody(logoKind, kind);
    const input = parseBody(z.object({ key: z.string().min(10).max(300) }), b);
    await this.studio.run(u, t, (tx, s) => this.settings.completeLogoUpload(tx, s, k, input.key, m));
  }

  @Get('me/profile')
  myProfile(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext) {
    return this.studio.run(u, t, (tx, s) => this.settings.myProfile(tx, s));
  }

  @Patch('me/profile')
  updateMyProfile(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(myProfileSchema, b);
    return this.studio.run(u, t, (tx, s) => this.settings.updateMyProfile(tx, s, input, m));
  }

  @Get('members')
  members(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext) {
    return this.studio.run(u, t, (tx) => this.settings.members(tx));
  }

  @Post('members/invitations')
  @HttpCode(201)
  async invite(@CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Body() b: unknown, @Meta() m: RequestMeta) {
    const input = parseBody(inviteSchema, b);
    const result = await this.studio.run(u, t, (tx, s) => this.settings.invite(tx, s, input, m));
    let emailSent = true;
    try {
      await result.send();
    } catch (error) {
      emailSent = false;
      this.logger.warn(`Invito non inviato: ${(error as Error).message}`);
    }
    return { membershipId: result.id, emailSent };
  }

  @Patch('members/:membershipId')
  @HttpCode(204)
  async updateMember(
    @CurrentUser() u: AuthUser, @CurrentTenant() t: TenantContext, @Param('membershipId') id: string,
    @Body() b: unknown, @Meta() m: RequestMeta,
  ) {
    const input = parseBody(memberUpdateSchema, b);
    await this.studio.run(u, t, (tx, s) => this.settings.updateMember(tx, s, id, input, m));
  }
}
