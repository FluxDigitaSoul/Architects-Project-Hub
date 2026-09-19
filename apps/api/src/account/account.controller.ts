import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { type MembershipRole, isValidTenantSlug } from '@aph/contracts';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { parseBody } from '../common/zod';
import { DatabaseService } from '../database/database';
import { AuthGuard, type AuthUser, CurrentUser } from '../auth/auth';

const provisionSchema = z.object({
  studioName: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidTenantSlug, 'Indirizzo non valido o riservato'),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  acceptedTerms: z.literal(true, { message: 'Devi accettare termini e DPA' }),
});

/** Eccezioni sollevate da app.provision_tenant tradotte nel formato d'errore dell'API. */
const PROVISION_ERRORS: Record<string, { code: 'SLUG_UNAVAILABLE' | 'VALIDATION_FAILED'; message: string }> = {
  SLUG_UNAVAILABLE: { code: 'SLUG_UNAVAILABLE', message: 'Indirizzo del portale già in uso.' },
  SLUG_INVALID: { code: 'VALIDATION_FAILED', message: 'Indirizzo del portale non valido.' },
  PLAN_NOT_AVAILABLE: { code: 'VALIDATION_FAILED', message: 'Piano non disponibile.' },
};

interface TenantRow {
  tenant_id: string;
  slug: string;
  name: string;
  role: MembershipRole;
}

/** Account dell'utente dello studio: i suoi studi e l'attivazione di un nuovo studio. */
@Controller()
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly database: DatabaseService) {}

  /** FR-MT-03: studi di cui l'utente è membro attivo. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    // FR-M0-08: al primo accesso l'utente entra negli studi che lo hanno invitato con la sua email.
    if (user.email) await sql`select app.claim_invitations(${user.id}::uuid, ${user.email})`.execute(this.database.db);
    const result = await sql<TenantRow>`
      select tenant_id, slug, name, role from app.list_user_tenants(${user.id}::uuid)`.execute(this.database.db);
    return {
      user,
      tenants: result.rows.map((r) => ({ tenantId: r.tenant_id, slug: r.slug, name: r.name, role: r.role })),
    };
  }

  /** FR-M6-02 / BR-26: provisioning atomico del nuovo studio in prova gratuita. */
  @Post('onboarding/tenants')
  @HttpCode(201)
  async provision(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Req() req: Request & { id?: string },
  ) {
    const input = parseBody(provisionSchema, body);
    try {
      const result = await sql<{ id: string }>`
        select app.provision_tenant(
          ${user.id}::uuid, ${user.email}, ${input.firstName}, ${input.lastName},
          ${input.studioName}, ${input.slug}, 'TRIAL', ${req.id ?? null}
        ) as id`.execute(this.database.db);
      const tenantId = result.rows[0]?.id;
      if (!tenantId) throw new AppError('PROVISIONING_FAILED', 'Attivazione dello studio non riuscita.');
      await this.recordLegalAcceptances(tenantId, user.id, req.ip ?? null);
      return { tenantId, slug: input.slug };
    } catch (e) {
      const mapped = PROVISION_ERRORS[(e as { message?: string }).message ?? ''];
      if (mapped) throw new AppError(mapped.code, mapped.message);
      throw e;
    }
  }

  /** FR-M6-17: accettazione (append-only) delle versioni correnti di termini, DPA e informativa privacy. */
  private async recordLegalAcceptances(tenantId: string, userId: string, ip: string | null): Promise<void> {
    await this.database.withContext({ tenantId, userId }, async (tx) => {
      const docs = await tx.selectFrom('legal_documents').select(['type', 'version', 'published_at'])
        .orderBy('published_at', 'desc').execute();
      const latest = new Map<string, string>();
      for (const d of docs) if (!latest.has(d.type)) latest.set(d.type, d.version);
      if (!latest.size) return;
      await tx.insertInto('legal_acceptances').values([...latest.entries()].map(([type, version]) => ({
        user_id: userId, tenant_id: tenantId, document_type: type as 'TOS' | 'DPA' | 'PRIVACY', document_version: version, ip,
      }))).execute();
    });
  }
}
