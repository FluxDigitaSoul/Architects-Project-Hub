import { Module } from '@nestjs/common';
import { ENV, loadEnv } from './config/env';
import { DatabaseService } from './database/database';
import { AuthGuard, TokenVerifier } from './auth/auth';
import { TenantGuard } from './tenancy/tenancy';
import { EntitlementsService } from './entitlements/entitlements.service';
import { AccountController } from './account/account.controller';
import { StudioController } from './studio/studio.controller';
import { HealthController } from './health/health.controller';

@Module({
  controllers: [HealthController, AccountController, StudioController],
  providers: [
    { provide: ENV, useFactory: loadEnv },
    DatabaseService,
    TokenVerifier,
    AuthGuard,
    TenantGuard,
    EntitlementsService,
  ],
})
export class AppModule {}
