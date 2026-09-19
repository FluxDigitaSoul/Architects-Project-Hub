import { Inject, Injectable, Logger } from '@nestjs/common';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { ENV, type Env } from '../config/env';
import { AppError } from '../common/app-error';

/**
 * Accesso ai file (elaborati, foto, audio, PDF). Il dominio usa SOLO questa interfaccia.
 *
 * ⚠️ Temporaneo: l'implementazione è su Supabase Storage (bucket privato) al posto di Amazon S3.
 * Il passaggio a S3 (ROADMAP, "Migrazione storage a S3") richiede solo un nuovo adapter
 * con gli stessi metodi: URL firmati di upload e download a scadenza breve.
 */
export abstract class FileStorage {
  /** URL firmato per caricare direttamente dal browser (il file non passa dall'API). */
  abstract createUploadUrl(key: string): Promise<{ url: string; token: string }>;
  /** URL firmato di download; scadenza breve per i file riservati (FR-M2-18: 5 minuti). */
  abstract createDownloadUrl(key: string, expiresInSec: number, downloadName?: string): Promise<string>;
  abstract read(key: string): Promise<Buffer>;
  abstract write(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract remove(keys: string[]): Promise<void>;
}

/** Chiavi degli oggetti sempre prefissate dal tenant (AFU cap. 11.3, BR-04). */
export const storageKeys = {
  drawingOriginal: (t: string, p: string, d: string, v: number, ext: string) =>
    `tenants/${t}/projects/${p}/drawings/${d}/v${v}/original.${ext}`,
  visitPhoto: (t: string, p: string, visit: string, photo: string, ext: string) =>
    `tenants/${t}/projects/${p}/visits/${visit}/photos/${photo}.${ext}`,
  visitAudio: (t: string, p: string, visit: string, audio: string, ext: string) =>
    `tenants/${t}/projects/${p}/visits/${visit}/audio/${audio}.${ext}`,
  document: (t: string, p: string, doc: string, revision: number, suffix = '') =>
    `tenants/${t}/projects/${p}/documents/${doc}/${revision}${suffix}.pdf`,
  branding: (t: string, asset: string, ext: string) => `tenants/${t}/branding/${asset}.${ext}`,
};

/** Controlla che una chiave appartenga al tenant corrente prima di firmare un URL (BR-04). */
export function assertTenantKey(key: string, tenantId: string): void {
  if (!key.startsWith(`tenants/${tenantId}/`) || key.includes('..')) {
    throw new AppError('NOT_FOUND', 'File non trovato.');
  }
}

@Injectable()
export class SupabaseFileStorage extends FileStorage {
  private readonly logger = new Logger('Storage');
  private client: SupabaseClient | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  private bucket() {
    if (!this.client) {
      if (!this.env.SUPABASE_SECRET_KEY) {
        throw new AppError('INTERNAL_ERROR', 'Storage non configurato (SUPABASE_SECRET_KEY mancante).');
      }
      this.client = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.client.storage.from(this.env.STORAGE_BUCKET);
  }

  private fail(op: string, key: string, message: string): never {
    this.logger.error(`${op} fallito per ${key}: ${message}`);
    throw new AppError('INTERNAL_ERROR', 'Operazione sul file non riuscita. Riprova.');
  }

  async createUploadUrl(key: string) {
    const { data, error } = await this.bucket().createSignedUploadUrl(key, { upsert: false });
    if (error || !data) this.fail('createUploadUrl', key, error?.message ?? 'nessun dato');
    return { url: data.signedUrl, token: data.token };
  }

  async createDownloadUrl(key: string, expiresInSec: number, downloadName?: string) {
    const { data, error } = await this.bucket().createSignedUrl(key, expiresInSec, {
      ...(downloadName ? { download: downloadName } : {}),
    });
    if (error || !data) this.fail('createDownloadUrl', key, error?.message ?? 'nessun dato');
    return data.signedUrl;
  }

  async read(key: string) {
    const { data, error } = await this.bucket().download(key);
    if (error || !data) throw new AppError('NOT_FOUND', 'File non trovato o non ancora caricato.');
    return Buffer.from(await data.arrayBuffer());
  }

  async write(key: string, body: Buffer, contentType: string) {
    const { error } = await this.bucket().upload(key, body, { contentType, upsert: false });
    if (error) this.fail('write', key, error.message);
  }

  async remove(keys: string[]) {
    if (!keys.length) return;
    const { error } = await this.bucket().remove(keys);
    if (error) this.fail('remove', keys.join(','), error.message);
  }
}
