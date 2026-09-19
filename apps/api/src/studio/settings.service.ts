import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { isValidItalianFiscalId, isValidItalianVat, isValidProjectCodePattern } from '@aph/contracts';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { AuditService, type RequestMeta } from '../common/audit';
import { ENV, type Env } from '../config/env';
import type { Tx } from '../database/database';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { Mailer, brandedHtml } from '../mail/mailer';
import { loadStudioIdentity } from '../portal/magic-link.service';
import { FileStorage, storageKeys } from '../storage/file-storage';
import { detectFileType } from '../storage/file-type';
import { type StudioScope, assertUuid, requireRole } from './studio-scope';

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colore non valido (#RRGGBB)');
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** FR-M0-02: profilo dello studio, con P.IVA e codice fiscale validati (AC-FR-M0-02-1). */
export const studioProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  legalForm: z.string().trim().max(60).nullable(),
  vatNumber: z.string().trim().refine(isValidItalianVat, 'Partita IVA non valida').nullable(),
  taxCode: z.string().trim().toUpperCase().refine(isValidItalianFiscalId, 'Codice fiscale non valido').nullable(),
  legalAddress: z.object({
    street: z.string().trim().min(1).max(150),
    number: z.string().trim().max(20).optional(),
    zip: z.string().trim().regex(/^\d{5}$/, 'CAP non valido').optional(),
    city: z.string().trim().min(1).max(100),
    province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  }).nullable(),
  email: z.string().trim().toLowerCase().email().nullable(),
  pec: z.string().trim().toLowerCase().email().nullable(),
  phone: z.string().trim().max(30).nullable(),
  website: z.string().trim().url().max(200).nullable(),
  legalRepresentative: z.string().trim().max(150).nullable(),
}).partial();

/** FR-M0-11 e BR-03: impostazioni operative. */
export const studioSettingsSchema = z.object({
  codePattern: z.string().trim().refine(isValidProjectCodePattern, 'Pattern non valido: usa {YYYY} o {YY} e un solo {NNN}'),
  graceDays: z.number().int().min(0).max(365),
  requireOtpNewDevice: z.boolean(),
  audioRetentionDays: z.number().int().min(7).max(3650),
}).partial();

/** FR-M0-04/05 e FR-M5-00/20: aspetto e testi dei documenti. */
export const brandingSchema = z.object({
  primaryColor: hex,
  secondaryColor: hex.nullable(),
  portalTheme: z.enum(['LIGHT', 'DARK', 'AUTO']),
  attestationTemplate: z.string().trim().min(50).max(4000).nullable(),
  closingFormula: z.string().trim().max(300).nullable(),
}).partial();

/** FR-MT-04 / BR-08: profilo personale e iscrizione all'albo (serve per firmare). */
export const myProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(30).nullable(),
  phone: z.string().trim().max(30).nullable(),
  professionalOrder: z.string().trim().max(120).nullable(),
  registrationNumber: z.string().trim().max(30).nullable(),
  registrationSection: z.string().trim().max(30).nullable(),
  /** FR-MT-06: GROUPED = email raggruppate ogni 10 minuti, DAILY = riepilogo giornaliero, OFF = nessuna. */
  notificationMode: z.enum(['GROUPED', 'DAILY', 'OFF']),
}).partial();

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['OWNER', 'ARCHITECT', 'COLLABORATOR']),
});

export const memberUpdateSchema = z.object({
  role: z.enum(['OWNER', 'ARCHITECT', 'COLLABORATOR']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
});

const PROFILE_COLUMNS: Record<string, string> = {
  name: 'name', legalForm: 'legal_form', vatNumber: 'vat_number', taxCode: 'tax_code', email: 'email', pec: 'pec',
  phone: 'phone', website: 'website', legalRepresentative: 'legal_representative',
};

/** Impostazioni dello studio e profilo personale (FR-M0-02..05/08/11, FR-MT-04). */
@Injectable()
export class SettingsService {
  constructor(
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private log(tx: Tx, scope: StudioScope, action: string, details: Record<string, unknown>, meta: RequestMeta) {
    return this.audit.record(tx, { tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action, objectType: 'TENANT', objectId: scope.tenantId, details, meta });
  }

  async get(tx: Tx, scope: StudioScope) {
    const t = await tx.selectFrom('tenants as t').leftJoin('tenant_branding as b', 'b.tenant_id', 't.id')
      .select(['t.name', 't.slug', 't.legal_form', 't.vat_number', 't.tax_code', 't.legal_address', 't.email', 't.pec', 't.phone', 't.website',
        't.legal_representative', 't.settings', 'b.primary_color', 'b.secondary_color', 'b.portal_theme', 'b.logo_keys', 'b.document_settings'])
      .where('t.id', '=', scope.tenantId).executeTakeFirstOrThrow();
    const logos = t.logo_keys ?? {};
    const logoUrls = Object.fromEntries(await Promise.all(Object.entries(logos).map(async ([kind, key]) =>
      [kind, await this.storage.createDownloadUrl(key, 3600).catch(() => null)] as const)));
    const docs = (t.document_settings ?? {}) as { attestationTemplate?: string; closingFormula?: string };
    return {
      profile: {
        name: t.name, slug: t.slug, legalForm: t.legal_form, vatNumber: t.vat_number, taxCode: t.tax_code, legalAddress: t.legal_address,
        email: t.email, pec: t.pec, phone: t.phone, website: t.website, legalRepresentative: t.legal_representative,
      },
      settings: t.settings,
      branding: {
        primaryColor: t.primary_color ?? '#1F2937', secondaryColor: t.secondary_color, portalTheme: t.portal_theme ?? 'LIGHT',
        logos: logoUrls, attestationTemplate: docs.attestationTemplate ?? null, closingFormula: docs.closingFormula ?? null,
      },
    };
  }

  async updateProfile(tx: Tx, scope: StudioScope, input: z.infer<typeof studioProfileSchema>, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    const values = input as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(PROFILE_COLUMNS)) if (values[key] !== undefined) patch[column] = values[key];
    if (input.legalAddress !== undefined) patch.legal_address = JSON.stringify(input.legalAddress);
    if (Object.keys(patch).length) await tx.updateTable('tenants').set(patch).where('id', '=', scope.tenantId).execute();
    await this.log(tx, scope, 'STUDIO_PROFILE_UPDATED', { fields: Object.keys(input) }, meta);
  }

  async updateSettings(tx: Tx, scope: StudioScope, input: z.infer<typeof studioSettingsSchema>, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    const t = await tx.selectFrom('tenants').select('settings').where('id', '=', scope.tenantId).executeTakeFirstOrThrow();
    const next = { ...t.settings, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    await tx.updateTable('tenants').set({ settings: JSON.stringify(next) }).where('id', '=', scope.tenantId).execute();
    await this.log(tx, scope, 'STUDIO_SETTINGS_UPDATED', { fields: Object.keys(input) }, meta);
  }

  async updateBranding(tx: Tx, scope: StudioScope, input: z.infer<typeof brandingSchema>, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    const b = await tx.selectFrom('tenant_branding').select('document_settings').executeTakeFirstOrThrow();
    const docs = { ...(b.document_settings ?? {}) } as Record<string, unknown>;
    if (input.attestationTemplate !== undefined) docs.attestationTemplate = input.attestationTemplate;
    if (input.closingFormula !== undefined) docs.closingFormula = input.closingFormula;
    await tx.updateTable('tenant_branding').set({
      ...(input.primaryColor !== undefined ? { primary_color: input.primaryColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondary_color: input.secondaryColor } : {}),
      ...(input.portalTheme !== undefined ? { portal_theme: input.portalTheme } : {}),
      document_settings: JSON.stringify(docs),
    }).where('tenant_id', '=', scope.tenantId).execute();
    await this.log(tx, scope, 'STUDIO_BRANDING_UPDATED', { fields: Object.keys(input) }, meta);
  }

  /** FR-M0-03: logo caricato direttamente sullo storage; PNG, JPEG o WebP fino a 2 MB (niente SVG nella Beta, TC-SEC-06). */
  async startLogoUpload(scope: StudioScope, kind: 'primary' | 'print' | 'icon') {
    requireRole(scope, ['OWNER']);
    const key = storageKeys.branding(scope.tenantId, `${kind}-${randomUUID()}`, 'img');
    const upload = await this.storage.createUploadUrl(key);
    return { key, uploadUrl: upload.url, uploadToken: upload.token };
  }

  async completeLogoUpload(tx: Tx, scope: StudioScope, kind: 'primary' | 'print' | 'icon', key: string, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    if (!key.startsWith(`tenants/${scope.tenantId}/branding/${kind}-`) || key.includes('..')) throw new AppError('NOT_FOUND', 'File non trovato.');
    const buf = await this.storage.read(key);
    const type = detectFileType(buf);
    if (type.kind !== 'image' || type.mime === 'image/heic' || buf.length > LOGO_MAX_BYTES) {
      await this.storage.remove([key]).catch(() => undefined);
      throw new AppError('UNSUPPORTED_FILE', 'Il logo deve essere PNG, JPEG o WebP e non superare 2 MB.');
    }
    const b = await tx.selectFrom('tenant_branding').select('logo_keys').executeTakeFirstOrThrow();
    const previous = b.logo_keys?.[kind];
    await tx.updateTable('tenant_branding').set({ logo_keys: JSON.stringify({ ...(b.logo_keys ?? {}), [kind]: key }) })
      .where('tenant_id', '=', scope.tenantId).execute();
    if (previous && previous !== key) await this.storage.remove([previous]).catch(() => undefined);
    await this.log(tx, scope, 'STUDIO_LOGO_UPDATED', { kind }, meta);
  }

  // ---- Profilo personale (FR-MT-04) ------------------------------------------------------------

  async myProfile(tx: Tx, scope: StudioScope) {
    const u = await tx.selectFrom('user_profiles').selectAll().where('id', '=', scope.userId).executeTakeFirstOrThrow();
    const m = await tx.selectFrom('memberships').select(['role', 'professional_order', 'registration_number', 'registration_section', 'notification_mode'])
      .where('id', '=', scope.membershipId).executeTakeFirstOrThrow();
    return {
      email: u.email, firstName: u.first_name, lastName: u.last_name, title: u.title, phone: u.phone, role: m.role,
      professionalOrder: m.professional_order, registrationNumber: m.registration_number, registrationSection: m.registration_section,
      notificationMode: m.notification_mode,
      canSign: m.role !== 'COLLABORATOR' && Boolean(m.professional_order && m.registration_number),
    };
  }

  async updateMyProfile(tx: Tx, scope: StudioScope, input: z.infer<typeof myProfileSchema>, meta: RequestMeta) {
    const userPatch = {
      ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
      ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    };
    const memberPatch = {
      ...(input.professionalOrder !== undefined ? { professional_order: input.professionalOrder } : {}),
      ...(input.registrationNumber !== undefined ? { registration_number: input.registrationNumber } : {}),
      ...(input.registrationSection !== undefined ? { registration_section: input.registrationSection } : {}),
      ...(input.notificationMode !== undefined ? { notification_mode: input.notificationMode } : {}),
    };
    if (Object.keys(userPatch).length) await tx.updateTable('user_profiles').set(userPatch).where('id', '=', scope.userId).execute();
    if (Object.keys(memberPatch).length) await tx.updateTable('memberships').set(memberPatch).where('id', '=', scope.membershipId).execute();
    await this.audit.record(tx, {
      tenantId: scope.tenantId, actorType: 'USER', actorId: scope.userId, action: 'MY_PROFILE_UPDATED',
      objectType: 'MEMBERSHIP', objectId: scope.membershipId, details: { fields: Object.keys(input) }, meta,
    });
    return this.myProfile(tx, scope);
  }

  // ---- Membri (FR-M0-08, BR-12) ------------------------------------------------------------------

  async members(tx: Tx) {
    const rows = await tx.selectFrom('memberships as m').leftJoin('user_profiles as u', 'u.id', 'm.user_id')
      .select(['m.id', 'm.role', 'm.status', 'm.invited_email', 'm.invited_at', 'u.first_name', 'u.last_name', 'u.email', 'm.professional_order', 'm.registration_number'])
      .where('m.status', '<>', 'REMOVED').orderBy('m.status').orderBy('u.last_name').execute();
    return rows.map((r) => ({
      membershipId: r.id, role: r.role, status: r.status, email: r.email ?? r.invited_email,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || r.invited_email || '—',
      invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : null,
      canSign: r.role !== 'COLLABORATOR' && Boolean(r.professional_order && r.registration_number),
    }));
  }

  /** Invito con email; il limite di postazioni del piano si verifica prima (BR-28). L'email parte dopo il commit. */
  async invite(tx: Tx, scope: StudioScope, input: z.infer<typeof inviteSchema>, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    const { n } = await tx.selectFrom('memberships').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('status', 'in', ['ACTIVE', 'INVITED']).executeTakeFirstOrThrow();
    await this.entitlements.assertLimit(tx, 'seats.max', Number(n));
    const existing = await tx.selectFrom('memberships as m').leftJoin('user_profiles as u', 'u.id', 'm.user_id').select('m.id')
      .where((eb) => eb.or([eb('m.invited_email', '=', input.email), eb('u.email', '=', input.email)]))
      .where('m.status', 'in', ['ACTIVE', 'INVITED', 'SUSPENDED']).executeTakeFirst();
    if (existing) throw new AppError('CONFLICT', 'Questa persona fa già parte dello studio o è già stata invitata.');
    const row = await tx.insertInto('memberships').values({
      tenant_id: scope.tenantId, user_id: null, role: input.role, status: 'INVITED', invited_email: input.email, invited_at: new Date(),
    }).returning('id').executeTakeFirstOrThrow();
    await this.log(tx, scope, 'MEMBER_INVITED', { membershipId: row.id, role: input.role }, meta);
    const studio = await loadStudioIdentity(tx, scope.tenantId);
    const url = `${this.env.APP_BASE_URL.replace(/\/$/, '')}/login?invito=1`;
    const paragraphs = [`${studio.name} ti ha invitato a collaborare nel suo spazio di lavoro.`, 'Accedi o registrati usando questo indirizzo email.'];
    return {
      id: row.id,
      send: () => this.mailer.send({
        to: [input.email], subject: `${studio.name} ti invita nel Project Hub`, senderName: studio.name, replyTo: studio.email,
        text: `${paragraphs.join('\n')}\n\n${url}`,
        html: brandedHtml({ studioName: studio.name, primaryColor: studio.primaryColor, title: 'Invito a collaborare', paragraphs, cta: { label: 'Accetta l’invito', url } }),
      }),
    };
  }

  /** Cambio ruolo o stato; l'ultimo Owner non si declassa né si rimuove (BR-12, garantito anche dal database). */
  async updateMember(tx: Tx, scope: StudioScope, membershipId: string, input: z.infer<typeof memberUpdateSchema>, meta: RequestMeta) {
    requireRole(scope, ['OWNER']);
    assertUuid(membershipId, 'Membro');
    const m = await tx.selectFrom('memberships').select(['id', 'status']).where('id', '=', membershipId).executeTakeFirst();
    if (!m) throw new AppError('NOT_FOUND', 'Membro non trovato.');
    if (m.status === 'INVITED' && input.status && input.status !== 'REMOVED') {
      throw new AppError('INVALID_TRANSITION', 'L’invito diventa attivo solo quando la persona lo accetta: puoi solo revocarlo.');
    }
    if (m.status === 'SUSPENDED' && input.status === 'ACTIVE') {
      const { n } = await tx.selectFrom('memberships').select((eb) => eb.fn.countAll<string>().as('n'))
        .where('status', 'in', ['ACTIVE', 'INVITED']).executeTakeFirstOrThrow();
      await this.entitlements.assertLimit(tx, 'seats.max', Number(n));
    }
    if (m.status === 'INVITED' && input.status === 'REMOVED') {
      await tx.deleteFrom('memberships').where('id', '=', m.id).execute();
    } else {
      await tx.updateTable('memberships').set({
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
      }).where('id', '=', m.id).execute();
      if (input.status === 'REMOVED' || input.status === 'SUSPENDED') {
        await tx.updateTable('project_assignments').set({ valid_to: new Date() }).where('membership_id', '=', m.id).where('valid_to', 'is', null).execute();
      }
    }
    await this.log(tx, scope, 'MEMBER_UPDATED', { membershipId, ...input }, meta);
  }
}
