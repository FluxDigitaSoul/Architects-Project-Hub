import { randomUUID } from 'node:crypto';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { type Env, loadEnv } from '../src/config/env';

/** Supporto ai test end-to-end contro il progetto Supabase di test (dati con prefisso e2e-). */
export const env: Env | null = (() => {
  try {
    return loadEnv();
  } catch {
    return null;
  }
})();

export const e2eEnabled = Boolean(env?.SUPABASE_SECRET_KEY && env?.SUPABASE_PUBLISHABLE_KEY);
export const runId = randomUUID().slice(0, 8);

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export function adminClient(): SupabaseClient {
  return createClient(env!.SUPABASE_URL, env!.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export async function createUser(admin: SupabaseClient, label: string): Promise<TestUser> {
  const email = `e2e-${runId}-${label}@example.com`;
  const password = `Pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
  const client = createClient(env!.SUPABASE_URL, env!.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session) throw session.error ?? new Error('signIn failed');
  return { id: created.data.user.id, email, token: session.data.session.access_token };
}

/** Caricamento diretto sullo storage con l'URL firmato restituito dall'API (come fa il browser). */
export async function uploadSigned(admin: SupabaseClient, key: string, token: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await admin.storage.from(env!.STORAGE_BUCKET).uploadToSignedUrl(key, token, body, { contentType });
  if (error) throw error;
}

/** Rimuove i file del tenant di test dallo storage (le righe del database le toglie cleanup-e2e.sql). */
export async function removeTenantFiles(admin: SupabaseClient, tenantId: string): Promise<void> {
  const bucket = admin.storage.from(env!.STORAGE_BUCKET);
  const walk = async (prefix: string): Promise<string[]> => {
    const { data } = await bucket.list(prefix, { limit: 1000 });
    const out: string[] = [];
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) out.push(path);
      else out.push(...(await walk(path)));
    }
    return out;
  };
  const files = await walk(`tenants/${tenantId}`);
  if (files.length) await bucket.remove(files);
}

export async function samplePdf(pages = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = pdf.addPage([842, 595]);
    page.drawText(`Tavola di prova ${i + 1}`, { x: 60, y: 520, size: 24, font });
  }
  return Buffer.from(await pdf.save());
}

/** PNG 1×1 valido. */
export const samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export function cookieFrom(setCookie: string[] | string | undefined, name: string): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = list.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`cookie ${name} mancante`);
  return found.split(';')[0] as string;
}
