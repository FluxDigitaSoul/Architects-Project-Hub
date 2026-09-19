import type { Generated, JSONColumnType } from 'kysely';
import type { NullableTimestamp, Timestamp, NullableJson } from './types';

/** Tabelle della migrazione 0600: commesse, team, imprese, committenti, accesso al portale. */

export interface SiteAddress {
  street: string;
  number?: string;
  zip?: string;
  city: string;
  province?: string;
}

export interface CadastralEntry {
  sheet?: string;
  parcel?: string;
  sub?: string;
  category?: string;
}

export interface ProjectsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  title: string;
  description: string | null;
  intervention_type: string;
  permit_type: string | null;
  site_address: JSONColumnType<SiteAddress>;
  municipality: string;
  geo: NullableJson<{ lat: number; lng: number }>;
  cadastral: JSONColumnType<CadastralEntry[]>;
  altitude_m: number | null;
  regulation_profile_version_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: Generated<'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED'>;
  tags: Generated<string[]>;
  cover_image_key: string | null;
  is_demo: Generated<boolean>;
  closed_at: NullableTimestamp;
  archived_at: NullableTimestamp;
  next_visit_number: Generated<number>;
  created_at: Timestamp;
  created_by: string | null;
  updated_at: Timestamp;
  updated_by: string | null;
  version: Generated<number>;
}

export interface ProjectAssignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  membership_id: string;
  project_role: 'LEAD' | 'DESIGNER' | 'SITE_DIRECTOR' | 'COLLABORATOR';
  valid_from: Timestamp;
  valid_to: NullableTimestamp;
}

export interface ContractorsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  vat_number: string | null;
  contact_name: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  category: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface ProjectContractorsTable {
  tenant_id: string;
  project_id: string;
  contractor_id: string;
  created_at: Timestamp;
}

export interface ClientContactsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  kind: Generated<'PERSON' | 'COMPANY' | 'CONDOMINIUM' | 'PUBLIC_BODY'>;
  display_name: string;
  tax_id: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  role_in_project: string | null;
  is_signer: Generated<boolean>;
  portal_enabled: Generated<boolean>;
  privacy_acknowledged_at: NullableTimestamp;
  email_status: Generated<'OK' | 'BOUNCED'>;
  notification_mode: Generated<'GROUPED' | 'DAILY' | 'OFF'>;
  removed_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface AccessTokensTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  client_contact_id: string;
  token_hash: Buffer;
  kind: Generated<'PROJECT' | 'SELF_SERVICE'>;
  status: Generated<'ACTIVE' | 'REVOKED' | 'EXPIRED'>;
  expires_at: NullableTimestamp;
  revoked_at: NullableTimestamp;
  revoked_by: string | null;
  revoke_reason: string | null;
  last_used_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface ClientSessionsTable {
  id: Generated<string>;
  tenant_id: string;
  access_token_id: string;
  session_hash: Buffer;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  ip_truncated: string | null;
  user_agent: string | null;
  revoked_at: NullableTimestamp;
}

export interface OtpChallengesTable {
  id: Generated<string>;
  tenant_id: string;
  client_contact_id: string;
  purpose: 'SIGN_OFF' | 'NEW_DEVICE';
  code_hash: Buffer;
  expires_at: Timestamp;
  attempts: Generated<number>;
  verified_at: NullableTimestamp;
  created_at: Timestamp;
}
