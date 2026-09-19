import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { type MembershipRole, isValidTenantSlug } from '@aph/contracts';
import { sql } from 'kysely';
import { ENV, type Env } from '../config/env';
import { AppError } from '../common/app-error';
import { DatabaseService } from '../database/database';
import type { AuthedRequest } from '../auth/auth';

export interface TenantContext {
  tenantId: string;
  slug: string;
  name: string;
  role: MembershipRole;
}

export type TenantRequest = AuthedRequest & { tenant?: TenantContext };

/**
 * Tenant della richiesta: dal sottodominio ({slug}.{PLATFORM_BASE_DOMAIN}) oppure, in sviluppo
 * dove non ci sono sottodomini, dall'header `X-Tenant-Slug`. Lo slug indica solo QUALE studio:
 * l'accesso è concesso solo se l'utente ne è membro attivo (BR-04). Altrimenti 404, mai 403.
 */
export function slugFromRequest(host: string | undefined, header: string | undefined, baseDomain: string): string | null {
  const hostname = (host ?? '').split(':')[0]?.toLowerCase() ?? '';
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (hostname.endsWith(suffix)) {
    const sub = hostname.slice(0, -suffix.length);
    if (isValidTenantSlug(sub)) return sub;
  }
  const h = header?.trim().toLowerCase();
  return h && isValidTenantSlug(h) ? h : null;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    if (!req.user) throw new AppError('UNAUTHENTICATED', 'Accesso richiesto.');
    const slug = slugFromRequest(req.header('host'), req.header('x-tenant-slug'), this.env.PLATFORM_BASE_DOMAIN);
    if (!slug) throw new AppError('NOT_FOUND', 'Studio non trovato.');

    const rows = await sql<{ tenant_id: string; slug: string; name: string; role: MembershipRole }>`
      select tenant_id, slug, name, role from app.list_user_tenants(${req.user.id}::uuid)`.execute(this.database.db);
    const match = rows.rows.find((r) => r.slug === slug);
    if (!match) throw new AppError('NOT_FOUND', 'Studio non trovato.');

    req.tenant = { tenantId: match.tenant_id, slug: match.slug, name: match.name, role: match.role };
    return true;
  }
}

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const tenant = ctx.switchToHttp().getRequest<TenantRequest>().tenant;
  if (!tenant) throw new AppError('NOT_FOUND', 'Studio non trovato.');
  return tenant;
});
