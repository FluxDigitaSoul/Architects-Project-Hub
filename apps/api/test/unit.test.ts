import { describe, expect, it } from 'vitest';
import { JobsController } from '../src/automation/jobs.controller';
import type { JobsService } from '../src/automation/jobs.service';
import { addDays, formatDateIt, localDate, nextDailySlot, zonedToUtc } from '../src/automation/time';
import { EnvValidationError, parseEnv } from '../src/config/env';
import { slugFromRequest } from '../src/tenancy/tenancy';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/postgres',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
};

describe('parseEnv', () => {
  it('applies defaults and splits CORS origins', () => {
    const env = parseEnv({ ...VALID, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_SSL_STRICT).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast when a required variable is missing', () => {
    expect(() => parseEnv({ SUPABASE_URL: VALID.SUPABASE_URL })).toThrow(EnvValidationError);
  });
});

describe('slugFromRequest', () => {
  it('reads the tenant from the subdomain', () => {
    expect(slugFromRequest('studio-rossi.projecthub.it', undefined, 'projecthub.it')).toBe('studio-rossi');
  });

  it('falls back to the X-Tenant-Slug header', () => {
    expect(slugFromRequest('localhost:3000', 'Studio-Rossi', 'projecthub.it')).toBe('studio-rossi');
  });

  it('rejects reserved or malformed slugs', () => {
    expect(slugFromRequest('api.projecthub.it', undefined, 'projecthub.it')).toBeNull();
    expect(slugFromRequest('localhost', 'x', 'projecthub.it')).toBeNull();
  });
});

describe('orari degli studi (Europe/Rome)', () => {
  it('converte ora locale in UTC con e senza ora legale', () => {
    expect(zonedToUtc('2026-07-15', 18).toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(zonedToUtc('2026-12-15', 18).toISOString()).toBe('2026-12-15T17:00:00.000Z');
  });

  it('usa il giorno locale e non quello UTC', () => {
    expect(localDate(new Date('2026-09-19T22:30:00Z'))).toBe('2026-09-20');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(formatDateIt('2026-09-21')).toBe('21/09/2026');
  });

  it('fissa il riepilogo giornaliero alle 18 di oggi o di domani', () => {
    expect(nextDailySlot(new Date('2026-09-19T10:00:00Z'), 18).toISOString()).toBe('2026-09-19T16:00:00.000Z');
    expect(nextDailySlot(new Date('2026-09-19T17:00:00Z'), 18).toISOString()).toBe('2026-09-20T16:00:00.000Z');
  });
});

describe('JobsController', () => {
  const jobs = { find: () => undefined } as unknown as JobsService;
  const env = (secret?: string) => parseEnv({ ...VALID, ...(secret ? { JOBS_SECRET: secret } : {}) });

  it('non esiste senza JOBS_SECRET', () => {
    expect(() => new JobsController(jobs, env()).run('notifications', 'Bearer x')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('rifiuta un segreto sbagliato', () => {
    const controller = new JobsController(jobs, env('s'.repeat(40)));
    expect(() => controller.run('notifications', 'Bearer sbagliato')).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    expect(() => controller.run('notifications', undefined)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    expect(() => controller.run('nessuno', `Bearer ${'s'.repeat(40)}`)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});
