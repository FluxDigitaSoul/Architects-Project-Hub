import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Variabili d'ambiente validate all'avvio: se manca qualcosa l'API non parte (fail fast). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PLATFORM_BASE_DOMAIN: z.string().min(1).default('localhost'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  DATABASE_URL: z.string().url(),
  /** Verifica del certificato TLS del pooler: attivare quando si configura il CA di Supabase. */
  DATABASE_SSL_STRICT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWKS_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default('project-files'),
  /** URL pubblico dell'interfaccia: base dei link nelle email (portale, documenti). */
  APP_BASE_URL: z.string().url().default('http://localhost:4200'),
  MAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().email().default('notifiche@example.com'),
  /**
   * Job pianificati (AFU cap. 14.3). `JOBS_SCHEDULER=on` li esegue dentro l'API (con più istanze
   * il lease su `job_runs` evita doppioni); `JOBS_SECRET` abilita `POST /api/v1/internal/jobs/:name`
   * per uno scheduler esterno (EventBridge, cron). Senza segreto l'endpoint non esiste.
   */
  JOBS_SCHEDULER: z.enum(['on', 'off']).optional(),
  JOBS_SECRET: z.string().min(32, 'JOBS_SECRET deve avere almeno 32 caratteri').optional(),
}).refine((env) => env.MAIL_PROVIDER !== 'resend' || Boolean(env.RESEND_API_KEY), {
  message: 'RESEND_API_KEY è obbligatoria con MAIL_PROVIDER=resend',
  path: ['RESEND_API_KEY'],
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new EnvValidationError(`Configurazione non valida: ${issues}`);
  }
  return result.data;
}

/** Carica `.env` dalla cartella corrente e dalla radice del monorepo. */
export function loadEnv(): Env {
  loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });
  return parseEnv(process.env);
}

export const ENV = Symbol('ENV');
