import { Controller, Get, Param } from '@nestjs/common';
import { isValidTenantSlug } from '@aph/contracts';
import { sql } from 'kysely';
import { AppError } from '../common/app-error';
import { DatabaseService } from '../database/database';

/** Rotte pubbliche: stato del servizio e contesto pubblico dello studio. */
@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('health')
  async health() {
    const db = await this.database.ping().then(
      (ok) => (ok ? 'ok' : 'down'),
      () => 'down',
    );
    return { status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString() };
  }

  /** NFR-BRAND-03: dati pubblici dello studio per accesso e portale, senza dati sensibili. */
  @Get('public/tenant-context/:slug')
  async tenantContext(@Param('slug') slug: string) {
    const normalized = slug.trim().toLowerCase();
    if (!isValidTenantSlug(normalized)) throw new AppError('NOT_FOUND', 'Studio non trovato.');
    const result = await sql<{ ctx: Record<string, unknown> | null }>`
      select app.public_tenant_context(${normalized}) as ctx`.execute(this.database.db);
    const ctx = result.rows[0]?.ctx;
    if (!ctx) throw new AppError('NOT_FOUND', 'Studio non trovato.');
    return ctx;
  }
}
