/**
 * Test end-to-end contro il progetto Supabase di test (cloud).
 * Crea due utenti temporanei (prefisso e2e-), attiva due studi e verifica isolamento e contratti.
 * Si salta da solo se mancano le chiavi Supabase nel file .env.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { createApp } from '../src/bootstrap';

const env = (() => {
  try {
    return loadEnv();
  } catch {
    return null;
  }
})();
const enabled = Boolean(env?.SUPABASE_SECRET_KEY && env?.SUPABASE_PUBLISHABLE_KEY);

interface TestUser {
  id: string;
  token: string;
}

const run = randomUUID().slice(0, 8);
const slugA = `e2e-${run}-a`;
const slugB = `e2e-${run}-b`;

describe.skipIf(!enabled)('API against Supabase cloud', () => {
  let app: INestApplication;
  let admin: SupabaseClient;
  const users: TestUser[] = [];

  async function createUser(label: string): Promise<TestUser> {
    const email = `e2e-${run}-${label}@example.com`;
    const password = `Pw-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
    const client = createClient(env!.SUPABASE_URL, env!.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error || !session.data.session) throw session.error ?? new Error('signIn failed');
    const user = { id: created.data.user.id, token: session.data.session.access_token };
    users.push(user);
    return user;
  }

  const http = () => request(app.getHttpServer());
  const provision = (token: string, slug: string, extra: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/onboarding/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ studioName: `Studio ${slug}`, slug, firstName: 'Test', lastName: 'E2E', acceptedTerms: true, ...extra });

  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    admin = createClient(env!.SUPABASE_URL, env!.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    app = await createApp();
    await app.init();
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  // Gli utenti proprietari di uno studio non si possono cancellare (membership ON DELETE RESTRICT,
  // audit append-only): i dati e2e-* si rimuovono con supabase/scripts/cleanup-e2e.sql.
  afterAll(async () => {
    await app?.close();
  });

  it('reports health with a reachable database', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects requests without a valid token', async () => {
    const res = await http().get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('provisions a studio in trial and lists it in /me', async () => {
    const created = await provision(alice.token, slugA).expect(201);
    expect(created.body.slug).toBe(slugA);

    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${alice.token}`).expect(200);
    expect(me.body.tenants).toEqual([expect.objectContaining({ slug: slugA, role: 'OWNER' })]);
  });

  it('returns the studio context with plan and entitlements', async () => {
    const res = await http()
      .get('/api/v1/studio/context')
      .set('Authorization', `Bearer ${alice.token}`)
      .set('X-Tenant-Slug', slugA)
      .expect(200);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.plan).toMatchObject({ planCode: 'TRIAL', status: 'TRIALING' });
    expect(res.body.plan.entitlements.limits).toBeTypeOf('object');
    expect(res.body.branding.primaryColor).toMatch(/^#/);
  });

  it('exposes only public data in the public tenant context', async () => {
    const res = await http().get(`/api/v1/public/tenant-context/${slugA}`).expect(200);
    expect(res.body).toMatchObject({ slug: slugA, status: 'ACTIVE' });
    expect(Object.keys(res.body).sort()).toEqual(['branding', 'name', 'slug', 'status', 'tenantId']);
    await http().get('/api/v1/public/tenant-context/e2e-does-not-exist').expect(404);
  });

  it('refuses a duplicate slug with 409', async () => {
    const res = await provision(bob.token, slugA).expect(409);
    expect(res.body.error.code).toBe('SLUG_UNAVAILABLE');
  });

  it('refuses reserved slugs and missing terms as validation errors', async () => {
    const reserved = await provision(bob.token, 'admin');
    expect(reserved.body.error.code).toBe('VALIDATION_FAILED');
    const noTerms = await provision(bob.token, slugB, { acceptedTerms: false });
    expect(noTerms.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('hides another studio behind 404 (BR-04)', async () => {
    await provision(bob.token, slugB).expect(201);
    const res = await http()
      .get('/api/v1/studio/context')
      .set('Authorization', `Bearer ${bob.token}`)
      .set('X-Tenant-Slug', slugA)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('manages invitations and keeps at least one active Owner (BR-12)', async () => {
    const asAlice = (req: request.Test) => req.set('Authorization', `Bearer ${alice.token}`).set('X-Tenant-Slug', slugA);
    const invited = await asAlice(http().post('/api/v1/studio/members/invitations'))
      .send({ email: `e2e-${run}-carla@example.com`, role: 'COLLABORATOR' }).expect(201);
    const inviteId = invited.body.membershipId as string;

    const activate = await asAlice(http().patch(`/api/v1/studio/members/${inviteId}`)).send({ status: 'ACTIVE' }).expect(409);
    expect(activate.body.error.code).toBe('INVALID_TRANSITION');
    await asAlice(http().patch(`/api/v1/studio/members/${inviteId}`)).send({ status: 'REMOVED' }).expect(204);

    const members = await asAlice(http().get('/api/v1/studio/members')).expect(200);
    expect(members.body).toHaveLength(1);
    const demote = await asAlice(http().patch(`/api/v1/studio/members/${members.body[0].membershipId}`)).send({ role: 'ARCHITECT' }).expect(409);
    expect(demote.body.error.code).toBe('LAST_OWNER');
  });

  it('saves operations and document texts, validating the code pattern (FR-M0-05, FR-M0-11)', async () => {
    const asAlice = (req: request.Test) => req.set('Authorization', `Bearer ${alice.token}`).set('X-Tenant-Slug', slugA);
    const bad = await asAlice(http().patch('/api/v1/studio/settings/operations')).send({ codePattern: 'COMMESSA' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await asAlice(http().patch('/api/v1/studio/settings/operations')).send({ codePattern: 'AB-{YY}/{NN}', graceDays: 60 }).expect(204);
    await asAlice(http().patch('/api/v1/studio/settings/branding')).send({ closingFormula: 'Letto e sottoscritto.' }).expect(204);

    const settings = await asAlice(http().get('/api/v1/studio/settings')).expect(200);
    expect(settings.body.settings).toMatchObject({ codePattern: 'AB-{YY}/{NN}', graceDays: 60 });
    expect(settings.body.branding.closingFormula).toBe('Letto e sottoscritto.');
  });
});
