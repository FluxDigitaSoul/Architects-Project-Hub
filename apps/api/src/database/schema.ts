import type { ColumnType, Generated } from 'kysely';

/** Tipi delle tabelle dello schema `app` usate dall'API (supabase/migrations). */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface TenantsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSING' | 'DELETED';
  vat_number: string | null;
  email: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TenantBrandingTable {
  tenant_id: string;
  logo_keys: Record<string, string>;
  primary_color: string;
  secondary_color: string | null;
  portal_theme: 'LIGHT' | 'DARK' | 'AUTO';
}

export interface MembershipsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  role: 'OWNER' | 'ARCHITECT' | 'COLLABORATOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}

export interface PlanVersionsTable {
  id: Generated<string>;
  plan_code: string;
  version: number;
  entitlements: unknown;
  trial_days: number | null;
  published_at: Timestamp | null;
}

export interface SubscriptionsTable {
  id: Generated<string>;
  tenant_id: string;
  plan_version_id: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'UNPAID' | 'CANCELED' | 'PAUSED';
  trial_ends_at: Timestamp | null;
  current_period_end: Timestamp | null;
}

export interface EntitlementOverridesTable {
  id: Generated<string>;
  tenant_id: string;
  key: string;
  value: unknown;
  expires_at: Timestamp | null;
}

export interface Database {
  tenants: TenantsTable;
  tenant_branding: TenantBrandingTable;
  memberships: MembershipsTable;
  plan_versions: PlanVersionsTable;
  subscriptions: SubscriptionsTable;
  entitlement_overrides: EntitlementOverridesTable;
}
