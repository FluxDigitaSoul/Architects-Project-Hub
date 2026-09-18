/** Enum di dominio condivisi. Allineati ai tipi enum del database (supabase/migrations). */

export const MEMBERSHIP_ROLES = ['OWNER', 'ARCHITECT', 'COLLABORATOR'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSING', 'DELETED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'UNPAID',
  'CANCELED',
  'PAUSED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLAN_CODES = ['TRIAL', 'SOLO', 'PRO', 'ENTERPRISE', 'BETA_PARTNER'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const LEGAL_DOCUMENT_TYPES = ['TOS', 'DPA', 'PRIVACY'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

/** Slug del tenant: FR-M0-01. */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'static',
  'cdn',
  'status',
  'help',
  'docs',
  'portal',
  'auth',
  'billing',
  'support',
]);

export function isValidTenantSlug(slug: string): boolean {
  return TENANT_SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Propone uno slug a partire dalla denominazione dello studio (FR-M6-02). */
export function suggestTenantSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `studio-${base || 'nuovo'}`;
}
