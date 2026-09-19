import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { sql } from 'kysely';
import type { Request, Response } from 'express';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { newOpaqueToken, sha256, truncateIp } from '../common/crypto';
import { ENV, type Env } from '../config/env';
import { DatabaseService, type Tx } from '../database/database';

export const PORTAL_COOKIE = 'aph_portal';
const SESSION_DAYS = 30; // FR-M1-05 punto 4
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const OPAQUE = /^[A-Za-z0-9_-]{40,64}$/;

/** Contesto del committente autenticato nel portale. */
export interface PortalContext {
  sessionId: string;
  tokenId: string;
  tenantId: string;
  projectId: string;
  contactId: string;
}

export type PortalRequest = Request & { portal?: PortalContext };

export function readCookie(req: Request, name: string): string | null {
  const header = req.header('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const invalidLink = () => new AppError('LINK_INVALID', 'Il link non è più valido. Contatta lo studio.');

/**
 * Sessioni del portale (FR-M1-05/06). Il Magic Link si scambia con una sessione del browser
 * in cookie HttpOnly; la sessione vale 30 giorni con rinnovo a ogni uso. Se il token viene
 * revocato, `resolve_portal_session` non restituisce più nulla: l'accesso si chiude subito.
 */
@Injectable()
export class PortalSessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Esegue un'operazione nel contesto RLS del tenant del committente. */
  withPortal<T>(portal: PortalContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.database.withContext({ tenantId: portal.tenantId }, fn);
  }

  async open(token: string, meta: RequestMeta): Promise<{ secret: string; portal: PortalContext }> {
    if (!OPAQUE.test(token)) throw invalidLink();
    const found = await sql<{ token_id: string; tenant_id: string; project_id: string; client_contact_id: string }>`
      select token_id, tenant_id, project_id, client_contact_id from app.resolve_portal_token(${sha256(token)})`
      .execute(this.database.db);
    const row = found.rows[0];
    if (!row) throw invalidLink();

    const secret = newOpaqueToken();
    const ipTruncated = truncateIp(meta.ip ?? undefined);
    const portal = await this.database.withContext({ tenantId: row.tenant_id }, async (tx) => {
      const session = await tx.insertInto('client_sessions').values({
        tenant_id: row.tenant_id,
        access_token_id: row.token_id,
        session_hash: sha256(secret),
        expires_at: new Date(Date.now() + SESSION_MS),
        ip_truncated: ipTruncated,
        user_agent: meta.userAgent,
      }).returning('id').executeTakeFirstOrThrow();
      await tx.updateTable('access_tokens').set({ last_used_at: new Date() }).where('id', '=', row.token_id).execute();
      await this.audit.record(tx, {
        tenantId: row.tenant_id, actorType: 'CLIENT', actorId: row.client_contact_id, action: 'PORTAL_SESSION_OPENED',
        objectType: 'PROJECT', objectId: row.project_id, meta: { ...meta, ip: ipTruncated },
      });
      return { sessionId: session.id, tokenId: row.token_id, tenantId: row.tenant_id, projectId: row.project_id, contactId: row.client_contact_id };
    });
    return { secret, portal };
  }

  /** Verifica la sessione e la rinnova (scorrimento a 30 giorni). */
  async resolve(secret: string): Promise<PortalContext> {
    if (!OPAQUE.test(secret)) throw invalidLink();
    const found = await sql<{ session_id: string; token_id: string; tenant_id: string; project_id: string; client_contact_id: string }>`
      select session_id, token_id, tenant_id, project_id, client_contact_id from app.resolve_portal_session(${sha256(secret)})`
      .execute(this.database.db);
    const row = found.rows[0];
    if (!row) throw invalidLink();
    await this.database.withContext({ tenantId: row.tenant_id }, (tx) =>
      tx.updateTable('client_sessions')
        .set({ last_seen_at: new Date(), expires_at: new Date(Date.now() + SESSION_MS) })
        .where('id', '=', row.session_id).execute(),
    );
    return { sessionId: row.session_id, tokenId: row.token_id, tenantId: row.tenant_id, projectId: row.project_id, contactId: row.client_contact_id };
  }

  async close(portal: PortalContext): Promise<void> {
    await this.withPortal(portal, (tx) =>
      tx.updateTable('client_sessions').set({ revoked_at: new Date() }).where('id', '=', portal.sessionId).execute(),
    );
  }

  setCookie(req: Request, res: Response, secret: string): void {
    res.cookie(PORTAL_COOKIE, secret, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production' || req.secure,
      sameSite: 'lax',
      maxAge: SESSION_MS,
      path: '/api/v1/portal',
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(PORTAL_COOKIE, { path: '/api/v1/portal' });
  }
}

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly sessions: PortalSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PortalRequest>();
    const secret = readCookie(req, PORTAL_COOKIE);
    if (!secret) throw invalidLink();
    req.portal = await this.sessions.resolve(secret);
    return true;
  }
}

export const CurrentPortal = createParamDecorator((_: unknown, ctx: ExecutionContext): PortalContext => {
  const portal = ctx.switchToHttp().getRequest<PortalRequest>().portal;
  if (!portal) throw invalidLink();
  return portal;
});
