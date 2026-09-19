import { type ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Tx } from '../database/database';

/** Dati della richiesta HTTP registrati nell'audit (FR-MT-07, AC-FR-MT-07-1). */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request & { id?: string }>();
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, 400) ?? null,
    requestId: req.id ?? null,
  };
});

export interface AuditEntry {
  tenantId: string;
  actorType: 'USER' | 'CLIENT' | 'SYSTEM';
  actorId: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  outcome?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  details?: Record<string, unknown>;
  meta?: RequestMeta;
}

/**
 * Registro di audit applicativo, append-only (garantito dal trigger del database).
 * Si scrive nella stessa transazione dell'operazione: se l'operazione fallisce, niente audit orfano.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx
      .insertInto('audit_events')
      .values({
        tenant_id: entry.tenantId,
        actor_type: entry.actorType,
        actor_id: entry.actorId,
        action: entry.action,
        object_type: entry.objectType ?? null,
        object_id: entry.objectId ?? null,
        outcome: entry.outcome ?? 'SUCCESS',
        ip: entry.meta?.ip ?? null,
        user_agent: entry.meta?.userAgent ?? null,
        request_id: entry.meta?.requestId ?? null,
        details: JSON.stringify(entry.details ?? {}),
      })
      .execute();
  }
}
