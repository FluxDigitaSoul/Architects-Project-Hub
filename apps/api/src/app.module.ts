import { Module } from '@nestjs/common';
import { ENV, type Env, loadEnv } from './config/env';
import { DatabaseService } from './database/database';
import { AuthGuard, TokenVerifier } from './auth/auth';
import { TenantGuard } from './tenancy/tenancy';
import { AuditService } from './common/audit';
import { EntitlementsService } from './entitlements/entitlements.service';
import { FileStorage, SupabaseFileStorage } from './storage/file-storage';
import { Mailer, mailerFactory } from './mail/mailer';
import { StudioDb } from './studio/studio-scope';
import { MagicLinkService } from './portal/magic-link.service';
import { ProjectsService } from './projects/projects.service';
import { ContactsService } from './projects/contacts.service';
import { TeamService } from './projects/team.service';
import { AccountController } from './account/account.controller';
import { StudioController } from './studio/studio.controller';
import { HealthController } from './health/health.controller';
import { ProjectsController } from './projects/projects.controller';
import { RateLimiter } from './common/rate-limit';
import { DrawingsService } from './review/drawings.service';
import { PinsService } from './review/pins.service';
import { SignoffService } from './review/signoff.service';
import { ReviewController } from './review/review.controller';
import { PortalGuard, PortalSessionService } from './portal/portal-session';
import { PortalController } from './portal/portal.controller';
import { RaiStructureService } from './rai/rai-structure.service';
import { RaiCalcService } from './rai/rai-calc.service';
import { RaiController } from './rai/rai.controller';
import { FieldService } from './field/field.service';
import { FieldController } from './field/field.controller';
import { DocumentData } from './documents/document-data';
import { DocumentsService } from './documents/documents.service';
import { DocumentsController, StudioDocumentsController } from './documents/documents.controller';
import { SettingsService } from './studio/settings.service';
import { SettingsController } from './studio/settings.controller';
import { DashboardService } from './projects/dashboard.service';
import { NotificationsService } from './automation/notifications.service';
import { JobsService } from './automation/jobs.service';
import { JobsScheduler } from './automation/jobs.scheduler';
import { JobsController } from './automation/jobs.controller';

@Module({
  controllers: [HealthController, AccountController, StudioController, ProjectsController, ReviewController, PortalController, RaiController, FieldController, DocumentsController, StudioDocumentsController, SettingsController, JobsController],
  providers: [
    { provide: ENV, useFactory: loadEnv },
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => mailerFactory(env) },
    { provide: FileStorage, useClass: SupabaseFileStorage },
    DatabaseService,
    TokenVerifier,
    AuthGuard,
    TenantGuard,
    AuditService,
    EntitlementsService,
    StudioDb,
    MagicLinkService,
    ProjectsService,
    ContactsService,
    TeamService,
    RateLimiter,
    DrawingsService,
    PinsService,
    SignoffService,
    PortalSessionService,
    PortalGuard,
    RaiStructureService,
    RaiCalcService,
    FieldService,
    DocumentData,
    DocumentsService,
    SettingsService,
    DashboardService,
    NotificationsService,
    JobsService,
    JobsScheduler,
  ],
})
export class AppModule {}
