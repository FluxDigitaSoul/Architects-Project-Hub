import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env';
import { AppError } from '../common/app-error';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

/**
 * Verifica dei JWT di Supabase Auth con le chiavi pubbliche JWKS (ADR-003).
 * Dal token si prende solo l'identità: tenant e ruolo li decide il database.
 */
@Injectable()
export class TokenVerifier {
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(@Inject(ENV) env: Env) {
    this.jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));
    this.issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer, audience: 'authenticated' });
      if (typeof payload.sub !== 'string') throw new Error('sub mancante');
      return { id: payload.sub, email: typeof payload['email'] === 'string' ? payload['email'] : '' };
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Sessione non valida o scaduta.');
    }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED', 'Accesso richiesto.');
    req.user = await this.verifier.verify(match[1]);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new AppError('UNAUTHENTICATED', 'Accesso richiesto.');
  return user;
});
