/**
 * Flussi completi della Beta contro il progetto Supabase di test (dati e2e-*):
 * commessa → elaborato → portale → pin → OTP → approvazione → riepilogo; R.A.I. → relazione;
 * sopralluogo → verbale → invio; firma digitale; revoca del link; isolamento tra studi (BR-04).
 * Le email si leggono dall'outbox del mailer di sviluppo (MAIL_PROVIDER=log).
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/automation/jobs.service';
import { GROUP_WINDOW_MS, NotificationsService } from '../src/automation/notifications.service';
import { addDays, localDate } from '../src/automation/time';
import { createApp } from '../src/bootstrap';
import { type LogMailer, Mailer } from '../src/mail/mailer';
import {
  type TestUser, adminClient, cookieFrom, createUser, e2eEnabled, removeTenantFiles, runId, samplePdf, samplePng, uploadSigned,
} from './support';

describe.skipIf(!e2eEnabled)('Flussi della Beta (cloud)', () => {
  let app: INestApplication;
  let admin: SupabaseClient;
  let outbox: LogMailer['outbox'];
  let owner: TestUser;
  let other: TestUser;
  const slug = `e2e-${runId}-flow`;
  const otherSlug = `e2e-${runId}-other`;
  const clientEmail = `e2e-${runId}-client@example.com`;
  const tenants: string[] = [];
  const state: Record<string, string> = {};

  type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
  const http = () => request(app.getHttpServer());
  const studio = (method: Method, path: string, user = owner, tenantSlug = slug) =>
    http()[method](`/api/v1/studio${path}`).set('Authorization', `Bearer ${user.token}`).set('X-Tenant-Slug', tenantSlug);
  const portal = (method: Method, path: string) => http()[method](`/api/v1/portal${path}`).set('Cookie', state.cookie ?? '');
  const lastMailTo = (email: string) => [...outbox].reverse().find((m) => m.to.includes(email));
  const p = () => `/projects/${state.projectId}`;

  beforeAll(async () => {
    admin = adminClient();
    app = await createApp();
    await app.init();
    outbox = (app.get(Mailer) as LogMailer).outbox;
    owner = await createUser(admin, 'owner');
    other = await createUser(admin, 'other');
    for (const [user, s] of [[owner, slug], [other, otherSlug]] as const) {
      const res = await http().post('/api/v1/onboarding/tenants').set('Authorization', `Bearer ${user.token}`)
        .send({ studioName: `Studio ${s}`, slug: s, firstName: 'Test', lastName: 'E2E', acceptedTerms: true }).expect(201);
      tenants.push(res.body.tenantId);
    }
  }, 120_000);

  afterAll(async () => {
    for (const t of tenants) await removeTenantFiles(admin, t).catch(() => undefined);
    await app?.close();
  }, 120_000);

  it('crea la commessa con codice progressivo e invia il Magic Link al committente', async () => {
    const next = await studio('get', '/projects/next-code').expect(200);
    expect(next.body.code).toMatch(/^\d{4}-001$/);
    const res = await studio('post', '/projects').send({
      title: 'Ristrutturazione Via Verdi 12', interventionType: 'RENOVATION', permitType: 'CILA',
      siteAddress: { street: 'Via Verdi', number: '12', zip: '20100', city: 'Milano', province: 'MI' }, municipality: 'Milano',
      contacts: [{ displayName: 'Maria Bianchi', email: clientEmail }],
    }).expect(201);
    state.projectId = res.body.id;
    expect(res.body.code).toBe(next.body.code);
    expect(res.body.invitesSent).toBe(1);
    expect(res.body.contacts[0]).toMatchObject({ isSigner: true, linkStatus: 'ACTIVE' });
    state.token = lastMailTo(clientEmail)?.text.match(/\/p\/([A-Za-z0-9_-]{40,64})/)?.[1] ?? '';
    expect(state.token).not.toBe('');

    const dup = await studio('post', '/projects').send({
      code: next.body.code, title: 'Duplicato', interventionType: 'OTHER', siteAddress: { street: 'Via X', city: 'Milano' },
      municipality: 'Milano', contacts: [{ displayName: 'X', email: 'x@example.com' }], sendInvites: false,
    }).expect(409);
    expect(dup.body.error.code).toBe('CODE_UNAVAILABLE');
  }, 60_000);

  it('nasconde la commessa agli altri studi (BR-04)', async () => {
    await studio('get', p(), other, otherSlug).expect(404);
    await studio('get', p(), owner, otherSlug).expect(404);
  });

  it('carica un elaborato PDF, lo verifica e lo pubblica', async () => {
    const drawing = await studio('post', `${p()}/drawings`).send({ title: 'Pianta piano terra', sheetCode: 'A01', category: 'PLAN' }).expect(201);
    state.drawingId = drawing.body.id;
    const start = await studio('post', `${p()}/drawings/${state.drawingId}/versions`).send({}).expect(201);
    expect(start.body.number).toBe(1);
    await uploadSigned(admin, start.body.key, start.body.uploadToken, await samplePdf(2), 'application/pdf');
    const done = await studio('post', `${p()}/drawings/${state.drawingId}/versions/${start.body.versionId}/complete`).expect(200);
    expect(done.body).toMatchObject({ status: 'DRAFT', pageCount: 2 });
    state.versionId = start.body.versionId;
    // Scadenza tra due giorni: il job dei promemoria la trova già oggi (FR-M2-05).
    state.dueDate = addDays(localDate(new Date()), 2);
    const pub = await studio('post', `${p()}/publish`)
      .send({ versionIds: [state.versionId], message: 'Prima emissione', reviewDueDate: state.dueDate }).expect(200);
    expect(pub.body).toEqual({ published: 1, notified: 1 });
  }, 90_000);

  it('il committente entra con il Magic Link e vede solo gli elaborati pubblicati', async () => {
    const res = await http().post('/api/v1/portal/session').send({ token: state.token }).expect(200);
    state.cookie = cookieFrom(res.headers['set-cookie'], 'aph_portal');
    expect(res.body.contact).toMatchObject({ name: 'Maria Bianchi', isSigner: true });
    const list = await portal('get', '/drawings').expect(200);
    expect(list.body).toHaveLength(1);
    const bad = await http().post('/api/v1/portal/session').send({ token: 'x'.repeat(43) }).expect(404);
    expect(bad.body.error.code).toBe('LINK_INVALID');
  }, 60_000);

  it('gestisce il thread del pin tra committente e studio (SM-PIN)', async () => {
    const pin = await portal('post', `/versions/${state.versionId}/pins`).send({ pageIndex: 0, x: 42.5, y: 30.25, body: 'Spostare la porta?' }).expect(201);
    state.pinId = pin.body.id;
    await studio('post', `${p()}/pins/${state.pinId}/comments`).send({ body: 'Sì, la spostiamo di 40 cm.' }).expect(201);
    let view = await portal('get', `/versions/${state.versionId}`).expect(200);
    expect(view.body.pins[0]).toMatchObject({ number: 1, status: 'WAITING', x: 42.5, y: 30.25 });
    await portal('post', `/pins/${state.pinId}/comments`).send({ body: 'Perfetto, grazie.' }).expect(201);
    view = await portal('get', `/versions/${state.versionId}`).expect(200);
    expect(view.body.pins[0].status).toBe('OPEN');
    const out = await portal('post', `/versions/${state.versionId}/pins`).send({ pageIndex: 0, x: 120, y: 10, body: 'fuori' }).expect(400);
    expect(out.body.error.code).toBe('VALIDATION_FAILED');
  }, 60_000);

  it('raggruppa le notifiche della revisione in una sola email per destinatario (FR-MT-06, AC-FR-MT-06-1)', async () => {
    const notifications = app.get(NotificationsService);
    const tenantId = tenants[0]!;
    // Nella finestra di 10 minuti non parte nulla.
    expect(await notifications.flushTenant(tenantId, new Date())).toEqual({ sent: 0, skipped: 0, failed: 0 });
    const before = outbox.length;
    const later = new Date(Date.now() + GROUP_WINDOW_MS + 60_000);
    expect(await notifications.flushTenant(tenantId, later)).toEqual({ sent: 2, skipped: 0, failed: 0 });
    const mails = outbox.slice(before);
    const toStudio = mails.find((m) => m.to.includes(owner.email));
    expect(toStudio?.subject).toMatch(/2 novità dalla revisione$/);
    expect(toStudio?.text).toContain('Spostare la porta?');
    expect(toStudio?.text).toContain('Perfetto, grazie.');
    const toClient = mails.find((m) => m.to.includes(clientEmail));
    expect(toClient?.text).toContain('Sì, la spostiamo di 40 cm.');
    expect(toClient?.text).toContain('/portale/tavole/');
    // Nessun doppione al giro successivo.
    expect(await notifications.flushTenant(tenantId, later)).toEqual({ sent: 0, skipped: 0, failed: 0 });
  }, 60_000);

  it('manda il promemoria di revisione una sola volta e non approva nulla (FR-M2-05, BR-19)', async () => {
    const jobs = app.get(JobsService);
    const before = outbox.length;
    const first = await jobs.reviewReminders(new Date());
    expect(first.queued).toBeGreaterThanOrEqual(1);
    const reminder = outbox.slice(before).find((m) => m.to.includes(clientEmail));
    expect(reminder?.subject).toMatch(/promemoria: revisione in scadenza$/);
    expect(reminder?.text).toContain(`${state.dueDate!.slice(8, 10)}/${state.dueDate!.slice(5, 7)}/${state.dueDate!.slice(0, 4)}`);
    expect(reminder?.text).toContain('nessun elaborato viene approvato in automatico');
    const again = outbox.length;
    await jobs.reviewReminders(new Date());
    expect(outbox.slice(again).some((m) => m.to.includes(clientEmail))).toBe(false);
    const view = await portal('get', `/versions/${state.versionId}`).expect(200);
    expect(view.body.version.status).toBe('PUBLISHED');
  }, 60_000);

  it('approva con OTP, congela la versione e invia il riepilogo (BR-01, BR-10, FR-M5-10)', async () => {
    const otp = await portal('post', '/otp').expect(201);
    const code = lastMailTo(clientEmail)?.subject.match(/(\d{6})$/)?.[1] ?? '';
    expect(code).toMatch(/^\d{6}$/);
    const wrongCode = code === '000000' ? '111111' : '000000';
    const wrong = await portal('post', `/versions/${state.versionId}/approve`)
      .send({ challengeId: otp.body.challengeId, code: wrongCode, declarationAccepted: true, openPinsAcknowledged: true }).expect(422);
    expect(wrong.body.error.code).toBe('OTP_INVALID');
    const ok = await portal('post', `/versions/${state.versionId}/approve`)
      .send({ challengeId: otp.body.challengeId, code, declarationAccepted: true, openPinsAcknowledged: true }).expect(201);
    expect(ok.body.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    const frozen = await portal('post', `/versions/${state.versionId}/pins`).send({ pageIndex: 0, x: 1, y: 1, body: 'tardi' }).expect(409);
    expect(frozen.body.error.code).toBe('VERSION_FROZEN');
    const docs = await studio('get', `${p()}/documents`).expect(200);
    expect(docs.body.find((d: { type: string }) => d.type === 'APPROVAL_SUMMARY')).toMatchObject({ status: 'FINAL' });
    expect(lastMailTo(owner.email)?.attachments?.[0]?.filename).toMatch(/^Approvazione_/);
  }, 90_000);

  it('calcola il R.A.I. lato server ed emette la relazione solo con firmatario abilitato (BR-06, BR-08)', async () => {
    const b = await studio('post', `${p()}/rai/buildings`).send({ name: 'Fabbricato A' }).expect(201);
    const u = await studio('post', `${p()}/rai/buildings/${b.body.id}/units`).send({ name: 'Appartamento 1', occupants: 2 }).expect(201);
    const r = await studio('post', `${p()}/rai/units/${u.body.id}/rooms`).send({
      name: 'Camera', use: 'DOUBLE_BEDROOM', floorArea: '14.5', ceiling: { type: 'FLAT', height: '2.70' },
    }).expect(201);
    await studio('post', `${p()}/rai/rooms/${r.body.id}/openings`).send({
      label: 'F1', kind: 'WINDOW', width: '1.40', height: '1.50', sillHeight: '0.90', operability: 'FULL',
    }).expect(201);
    const results = await studio('get', `${p()}/rai`).expect(200);
    expect(results.body.summary.counts.COMPLIANT).toBe(1);
    const snap = await studio('post', `${p()}/rai/snapshots`).send({}).expect(201);
    expect(snap.body.revision).toBe(0);
    const blocked = await studio('post', `${p()}/documents`).send({ type: 'RAI_REPORT', snapshotId: snap.body.id }).expect(422);
    expect(blocked.body.error.code).toBe('SIGNER_NOT_QUALIFIED');
    await studio('patch', '/me/profile').send({ title: 'Arch.', professionalOrder: 'Ordine degli Architetti di Milano', registrationNumber: '12345' }).expect(200);
    const report = await studio('post', `${p()}/documents`).send({ type: 'RAI_REPORT', snapshotId: snap.body.id }).expect(201);
    expect(report.body.verificationCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const dl = await studio('get', `${p()}/documents/${report.body.id}/download`).expect(200);
    expect(dl.body.url).toContain('token=');
  }, 90_000);

  it('chiude il sopralluogo, genera il verbale e lo invia (BR-05, BR-16, BR-23, BR-24, FR-M5-05)', async () => {
    const visitId = randomUUID();
    const v = await studio('post', `${p()}/visits`).send({ id: visitId, startedAt: new Date().toISOString(), weather: { condition: 'Sereno', temperatureC: 21 } }).expect(201);
    expect(v.body.number).toBe(1);
    const base = `${p()}/visits/${visitId}`;
    await studio('put', `${base}/attendees`).send([{ kind: 'MEMBER', name: 'Test E2E', qualification: 'DL', isDirector: true }]).expect(204);
    const photoId = randomUUID();
    const photo = await studio('post', `${base}/photos`).send({ id: photoId, caption: 'Tramezzo' }).expect(201);
    const pending = await studio('post', `${base}/finalize`).send({}).expect(422);
    expect(pending.body.error.code).toBe('SYNC_INCOMPLETE');
    await uploadSigned(admin, photo.body.key, photo.body.uploadToken, samplePng, 'image/png');
    await studio('post', `${base}/photos/${photoId}/complete`).expect(200);
    const opId = randomUUID();
    const item = { section: 'ISSUES', text: 'Tramezzo fuori quota', photoRefs: [photoId], needsVerification: true, origin: 'AI' };
    const first = await studio('post', `${base}/items`).set('X-Client-Op-Id', opId).send(item).expect(201);
    const again = await studio('post', `${base}/items`).set('X-Client-Op-Id', opId).send(item).expect(201);
    expect(again.body.id).toBe(first.body.id);
    const review = await studio('post', `${base}/finalize`).send({}).expect(422);
    expect(review.body.error.code).toBe('AI_REVIEW_PENDING');
    await studio('patch', `${base}/items/${first.body.id}`).send({ needsVerification: false, text: 'Tramezzo fuori quota di 3 cm' }).expect(204);
    await studio('post', `${base}/finalize`).send({}).expect(200);
    const late = await studio('post', `${base}/items`).send({ section: 'PROGRESS', text: 'tardi' }).expect(409);
    expect(late.body.error.code).toBe('REPORT_FINALIZED');
    const doc = await studio('post', `${p()}/documents`).send({ type: 'SITE_REPORT', visitId }).expect(201);
    const sent = await studio('post', `${p()}/documents/${doc.body.id}/send`)
      .send({ recipients: [{ email: `e2e-${runId}-impresa@example.com`, name: 'Impresa' }] }).expect(200);
    expect(sent.body.channel).toBe('EMAIL_ATTACHMENT');
    expect(lastMailTo(`e2e-${runId}-impresa@example.com`)?.attachments?.[0]?.filename).toMatch(/^Verbale_/);
  }, 120_000);

  it('rifiuta un PDF "firmato" che non corrisponde al documento generato (FR-M5-02)', async () => {
    const docs = await studio('get', `${p()}/documents`).expect(200);
    const report = docs.body.find((d: { type: string }) => d.type === 'RAI_REPORT');
    const start = await studio('post', `${p()}/documents/${report.id}/signed-upload`).expect(201);
    await uploadSigned(admin, start.body.key, start.body.uploadToken, await samplePdf(1), 'application/pdf');
    const res = await studio('post', `${p()}/documents/${report.id}/signed-upload/complete`).send({ key: start.body.key }).expect(422);
    expect(res.body.error.code).toBe('SIGNATURE_MISMATCH');
  }, 60_000);

  it('mostra la dashboard della commessa con tutti i widget (FR-M1-04)', async () => {
    const res = await studio('get', `${p()}/dashboard`).expect(200);
    expect(res.body.approvals.byStatus.APPROVED).toBe(1);
    expect(res.body.rai.counts.COMPLIANT).toBe(1);
    expect(res.body.field.visits).toBe(1);
    expect(res.body.activity.length).toBeGreaterThan(3);
  }, 60_000);

  it('revoca il Magic Link e chiude subito la sessione del portale (AC-FR-M1-06-1)', async () => {
    const detail = await studio('get', p()).expect(200);
    await studio('delete', `${p()}/contacts/${detail.body.contacts[0].id}/link`).expect(200);
    const res = await portal('get', '/context').expect(404);
    expect(res.body.error.code).toBe('LINK_INVALID');
  }, 60_000);
});
