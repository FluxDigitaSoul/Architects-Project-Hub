import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { AuditService, type RequestMeta } from '../common/audit';
import { newOpaqueToken, sha256 } from '../common/crypto';
import type { Tx } from '../database/database';
import { Mailer, brandedHtml } from '../mail/mailer';

/** Identità dello studio mostrata nelle email e nel portale (white-label, FR-M0-09). */
export interface StudioIdentity {
  name: string;
  email: string | null;
  primaryColor: string;
}

export async function loadStudioIdentity(tx: Tx, tenantId: string): Promise<StudioIdentity> {
  const row = await tx
    .selectFrom('tenants as t')
    .leftJoin('tenant_branding as b', 'b.tenant_id', 't.id')
    .select(['t.name', 't.email', 'b.primary_color'])
    .where('t.id', '=', tenantId)
    .executeTakeFirstOrThrow();
  return { name: row.name, email: row.email, primaryColor: row.primary_color ?? '#1F2937' };
}

export interface Actor {
  type: 'USER' | 'CLIENT' | 'SYSTEM';
  id: string | null;
}

interface ContactRef {
  id: string;
  projectId: string;
  displayName: string;
  email: string;
}

/**
 * Magic Link del committente (FR-M1-05/06, BR-03, SM-TOKEN).
 * - il token ha 256 bit di entropia e nel database c'è solo il suo SHA-256;
 * - rigenerare = revocare il token attivo e crearne uno nuovo (un token revocato non torna valido);
 * - la revoca chiude subito tutte le sessioni del portale collegate (AC-FR-M1-06-1).
 */
@Injectable()
export class MagicLinkService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  portalUrl(token: string): string {
    return `${this.env.APP_BASE_URL.replace(/\/$/, '')}/p/${token}`;
  }

  /** Crea un nuovo token per il contatto; restituisce il valore in chiaro UNA sola volta. */
  async issue(tx: Tx, tenantId: string, contact: ContactRef, actor: Actor, meta?: RequestMeta): Promise<string> {
    await this.revokeForContacts(tx, tenantId, [contact.id], 'REGENERATED', actor, meta);
    const token = newOpaqueToken();
    await tx
      .insertInto('access_tokens')
      .values({
        tenant_id: tenantId,
        project_id: contact.projectId,
        client_contact_id: contact.id,
        token_hash: sha256(token),
      })
      .execute();
    await this.audit.record(tx, {
      tenantId,
      actorType: actor.type,
      actorId: actor.id,
      action: 'PORTAL_LINK_ISSUED',
      objectType: 'CLIENT_CONTACT',
      objectId: contact.id,
      meta,
    });
    return token;
  }

  /**
   * FR-M1-05 punto 7: link richiesto dal committente dalla pagina del portale.
   * Vale 24 ore e NON revoca il link principale della commessa.
   */
  async issueSelfService(tx: Tx, tenantId: string, contact: ContactRef, meta?: RequestMeta): Promise<string> {
    const token = newOpaqueToken();
    await tx.insertInto('access_tokens').values({
      tenant_id: tenantId,
      project_id: contact.projectId,
      client_contact_id: contact.id,
      token_hash: sha256(token),
      kind: 'SELF_SERVICE',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }).execute();
    await this.audit.record(tx, {
      tenantId, actorType: 'CLIENT', actorId: contact.id, action: 'PORTAL_LINK_SELF_SERVICE',
      objectType: 'CLIENT_CONTACT', objectId: contact.id, meta,
    });
    return token;
  }

  /** Revoca i token attivi dei contatti e chiude le loro sessioni del portale. */
  async revokeForContacts(
    tx: Tx,
    tenantId: string,
    contactIds: string[],
    reason: string,
    actor: Actor,
    meta?: RequestMeta,
  ): Promise<number> {
    if (!contactIds.length) return 0;
    const revoked = await tx
      .updateTable('access_tokens')
      .set({ status: 'REVOKED', revoked_at: new Date(), revoked_by: `${actor.type}:${actor.id ?? '-'}`, revoke_reason: reason })
      .where('client_contact_id', 'in', contactIds)
      .where('status', '=', 'ACTIVE')
      .returning('id')
      .execute();
    if (!revoked.length) return 0;
    await tx
      .updateTable('client_sessions')
      .set({ revoked_at: new Date() })
      .where('access_token_id', 'in', revoked.map((r) => r.id))
      .where('revoked_at', 'is', null)
      .execute();
    if (reason !== 'REGENERATED') {
      await this.audit.record(tx, {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: 'PORTAL_LINK_REVOKED',
        objectType: 'CLIENT_CONTACT',
        objectId: contactIds.join(','),
        details: { reason, tokens: revoked.length },
        meta,
      });
    }
    return revoked.length;
  }

  async revokeForProject(tx: Tx, tenantId: string, projectId: string, reason: string, actor: Actor, meta?: RequestMeta) {
    const contacts = await tx.selectFrom('client_contacts').select('id').where('project_id', '=', projectId).execute();
    return this.revokeForContacts(tx, tenantId, contacts.map((c) => c.id), reason, actor, meta);
  }

  /** Email di invito con il marchio dello studio (FR-M1-05 punto 6). */
  async sendInvite(studio: StudioIdentity, contact: ContactRef, projectTitle: string, token: string): Promise<void> {
    const url = this.portalUrl(token);
    const paragraphs = [
      `Gentile ${contact.displayName},`,
      `${studio.name} ti ha dato accesso al portale della commessa "${projectTitle}", dove puoi consultare gli elaborati, lasciare commenti sulle tavole e approvarli.`,
      'Il link è personale: non inoltrarlo. Se lo ricevi per errore, ignora questa email.',
    ];
    await this.mailer.send({
      to: [contact.email],
      subject: `${studio.name} — accesso al portale della commessa`,
      senderName: studio.name,
      replyTo: studio.email,
      text: `${paragraphs.join('\n\n')}\n\nApri il portale: ${url}`,
      html: brandedHtml({
        studioName: studio.name,
        primaryColor: studio.primaryColor,
        title: 'Accesso al portale della commessa',
        paragraphs,
        cta: { label: 'Apri il portale', url },
      }),
    });
  }
}
