import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';
import { DatabaseService } from '../database/database';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { CurrentTenant, type TenantContext, TenantGuard } from '../tenancy/tenancy';

/** Area dello studio: ogni rotta richiede utente autenticato e membership attiva (BR-04). */
@Controller('studio')
@UseGuards(AuthGuard, TenantGuard)
export class StudioController {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Contesto dello studio per il frontend: ruolo, piano, diritti d'uso, branding. */
  @Get('context')
  context(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantContext) {
    return this.database.withContext({ tenantId: tenant.tenantId, userId: user.id }, async (tx) => {
      const plan = await this.entitlements.planState(tx);
      const branding = await tx
        .selectFrom('tenant_branding')
        .select(['primary_color', 'secondary_color', 'logo_keys', 'portal_theme'])
        .executeTakeFirst();
      return {
        tenant: { id: tenant.tenantId, slug: tenant.slug, name: tenant.name },
        role: tenant.role,
        plan,
        branding: branding
          ? {
              primaryColor: branding.primary_color,
              secondaryColor: branding.secondary_color,
              logoKeys: branding.logo_keys,
              portalTheme: branding.portal_theme,
            }
          : null,
      };
    });
  }
}
