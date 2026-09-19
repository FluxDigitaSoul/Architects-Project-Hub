import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { AppError } from '../common/app-error';

/**
 * Invio email (inviti al portale, OTP, invio documenti, notifiche).
 * White-label (FR-M0-09): mittente visualizzato = nome dello studio, Reply-To = email dello studio,
 * indirizzo tecnico della piattaforma (MAIL_FROM). Nessun pixel di tracciamento (FR-M5-05).
 */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  senderName: string;
  replyTo?: string | null;
  attachments?: MailAttachment[];
}

export interface MailResult {
  accepted: string[];
  providerId: string | null;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<MailResult>;
}

/** Sviluppo e test: non invia nulla, scrive un riepilogo nel log. Vietato in produzione. */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mail');
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<MailResult> {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    this.logger.log(`[dev] "${message.subject}" → ${message.to.join(', ')}\n${message.text}`);
    return { accepted: message.to, providerId: null };
  }
}

/** Resend (HTTP API). Attivo con MAIL_PROVIDER=resend e RESEND_API_KEY. */
@Injectable()
export class ResendMailer extends Mailer {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(message: MailMessage): Promise<MailResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${message.senderName.replace(/["<>]/g, '')} <${this.env.MAIL_FROM}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
    });
    if (!response.ok) {
      this.logger.error(`Invio fallito (${response.status}): ${await response.text()}`);
      throw new AppError('INTERNAL_ERROR', 'Invio email non riuscito. Riprova tra poco.');
    }
    const body = (await response.json()) as { id?: string };
    return { accepted: message.to, providerId: body.id ?? null };
  }
}

export function mailerFactory(env: Env): Mailer {
  if (env.MAIL_PROVIDER === 'resend') return new ResendMailer(env);
  if (env.NODE_ENV === 'production') {
    throw new Error('MAIL_PROVIDER=log non è ammesso in produzione');
  }
  return new LogMailer();
}

/** Escape per i testi inseriti nei template HTML (TC-SEC-03: nessuna esecuzione di markup). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Layout minimale con il colore dello studio; il testo resta leggibile anche senza HTML. */
export function brandedHtml(opts: {
  studioName: string;
  primaryColor: string;
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
}): string {
  const color = /^#[0-9a-f]{6}$/i.test(opts.primaryColor) ? opts.primaryColor : '#1F2937';
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const cta = opts.cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:${color};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="it"><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<div style="border-top:4px solid ${color};padding-top:16px"><strong>${escapeHtml(opts.studioName)}</strong></div>
<h1 style="font-size:18px;margin:16px 0">${escapeHtml(opts.title)}</h1>${body}${cta}
</body></html>`;
}
