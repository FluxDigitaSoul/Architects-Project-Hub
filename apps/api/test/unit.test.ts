import { describe, expect, it } from 'vitest';
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
