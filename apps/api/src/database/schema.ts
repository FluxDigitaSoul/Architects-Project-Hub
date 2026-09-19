import type { Generated, JSONColumnType } from 'kysely';
import type {
  AccessTokensTable,
  ClientContactsTable,
  ClientSessionsTable,
  ContractorsTable,
  OtpChallengesTable,
  ProjectAssignmentsTable,
  ProjectContractorsTable,
  ProjectsTable,
} from './schema/projects';
import type {
  ApprovalsTable,
  ChangeRequestsTable,
  CommentsTable,
  DrawingPagesTable,
  DrawingVersionsTable,
  DrawingsTable,
  PinsTable,
} from './schema/review';
import type {
  BuildingsTable,
  DerogationsTable,
  DwellingUnitsTable,
  OpeningTypesTable,
  OpeningsTable,
  RaiSnapshotsTable,
  RegulationProfileVersionsTable,
  RegulationProfilesTable,
  RoomsTable,
} from './schema/rai';
import type {
  AudioNotesTable,
  ClientOperationsTable,
  OpenActionsTable,
  ReportItemsTable,
  SiteVisitsTable,
  StructuredDraftsTable,
  TranscriptsTable,
  VisitAttendeesTable,
  VisitPhotosTable,
} from './schema/field';
import type { JsonWithDefault, NullableTimestamp, Timestamp, NullableJson } from './schema/types';

/** Tipi delle tabelle dello schema `app` usate dall'API (supabase/migrations 0100–1000). */

export interface TenantSettings {
  codePattern: string;
  graceDays: number;
  requireOtpNewDevice: boolean;
  /** PRIV-03: giorni di conservazione dell'audio grezzo dopo la finalizzazione (predefinito 90). */
  audioRetentionDays?: number;
}

export interface TenantsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSING' | 'DELETED';
  legal_form: string | null;
  vat_number: string | null;
  tax_code: string | null;
  legal_address: NullableJson<Record<string, string>>;
  email: string | null;
  pec: string | null;
  phone: string | null;
  website: string | null;
  legal_representative: string | null;
  settings: JsonWithDefault<TenantSettings>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface TenantBrandingTable {
  tenant_id: string;
  logo_keys: JsonWithDefault<Record<string, string>>;
  primary_color: string;
  secondary_color: string | null;
  portal_theme: 'LIGHT' | 'DARK' | 'AUTO';
  document_settings: JsonWithDefault<Record<string, unknown>>;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface UserProfilesTable {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  locale: Generated<string>;
  timezone: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface MembershipsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  role: 'OWNER' | 'ARCHITECT' | 'COLLABORATOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  invited_email: string | null;
  invited_at: NullableTimestamp;
  professional_order: string | null;
  registration_number: string | null;
  registration_section: string | null;
  signature_image_key: string | null;
  notification_mode: Generated<'GROUPED' | 'DAILY' | 'OFF'>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface PlanVersionsTable {
  id: Generated<string>;
  plan_code: string;
  version: number;
  entitlements: unknown;
  trial_days: number | null;
  published_at: NullableTimestamp;
}

export interface SubscriptionsTable {
  id: Generated<string>;
  tenant_id: string;
  plan_version_id: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'UNPAID' | 'CANCELED' | 'PAUSED';
  trial_ends_at: NullableTimestamp;
  current_period_end: NullableTimestamp;
}

export interface EntitlementOverridesTable {
  id: Generated<string>;
  tenant_id: string;
  key: string;
  value: unknown;
  expires_at: NullableTimestamp;
}

export interface UsageCountersTable {
  tenant_id: string;
  metric: 'SEATS' | 'ACTIVE_PROJECTS' | 'STORAGE_BYTES' | 'AI_MINUTES';
  period: string;
  value: Generated<string | number>;
  recalculated_at: NullableTimestamp;
}

export interface LegalAcceptancesTable {
  id: Generated<string>;
  user_id: string;
  tenant_id: string | null;
  document_type: 'TOS' | 'DPA' | 'PRIVACY';
  document_version: string;
  accepted_at: Timestamp;
  ip: string | null;
}

export interface LegalDocumentsTable {
  type: 'TOS' | 'DPA' | 'PRIVACY';
  version: string;
  url: string;
  published_at: Timestamp;
}

export interface AuditEventsTable {
  id: Generated<string>;
  tenant_id: string | null;
  occurred_at: Timestamp;
  actor_type: 'USER' | 'CLIENT' | 'SYSTEM' | 'PLATFORM_ADMIN';
  actor_id: string | null;
  on_behalf_of: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  outcome: Generated<'SUCCESS' | 'FAILURE' | 'DENIED'>;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  details: JSONColumnType<Record<string, unknown>>;
}

export interface DocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  type: 'SITE_REPORT' | 'RAI_REPORT' | 'RAI_CHECK' | 'APPROVAL_SUMMARY' | 'PIN_EXPORT' | 'UPLOAD';
  number: string;
  revision: Generated<number>;
  revision_reason: string | null;
  title: string;
  status: Generated<'DRAFT' | 'FINAL' | 'SIGNED' | 'CANCELLED'>;
  file_key: string | null;
  file_name: string | null;
  size_bytes: string | number | null;
  sha256: string | null;
  verification_code: string | null;
  source_type: 'SITE_VISIT' | 'RAI_SNAPSHOT' | 'APPROVAL' | 'DRAWING_VERSION' | null;
  source_id: string | null;
  signer_membership_id: string | null;
  signed_file_key: string | null;
  signed_sha256: string | null;
  signed_at: NullableTimestamp;
  cancelled_at: NullableTimestamp;
  cancel_reason: string | null;
  cancelled_by: string | null;
  shared_with_client: Generated<boolean>;
  created_at: Timestamp;
  created_by: string | null;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface DocumentDeliveriesTable {
  id: Generated<string>;
  tenant_id: string;
  document_id: string;
  recipients: JSONColumnType<Array<{ email: string; name?: string }>>;
  channel: 'EMAIL_ATTACHMENT' | 'EMAIL_LINK' | 'MANUAL_PEC';
  message: string | null;
  sent_at: Timestamp;
  sent_by: string | null;
  delivery_status: JsonWithDefault<Array<{ email: string; status: string; at: string }>>;
  link_expires_at: NullableTimestamp;
}

export interface NotificationsTable {
  id: Generated<string>;
  tenant_id: string;
  recipient_type: 'MEMBER' | 'CLIENT';
  recipient_id: string;
  event: string;
  payload: JsonWithDefault<Record<string, unknown>>;
  channel: 'IN_APP' | 'EMAIL';
  status: Generated<'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'>;
  digest_key: string | null;
  read_at: NullableTimestamp;
  created_at: Timestamp;
  sent_at: NullableTimestamp;
  send_after: Timestamp;
  attempts: Generated<number>;
  last_error: string | null;
  dedupe_key: string | null;
}

export type NotificationMode = 'GROUPED' | 'DAILY' | 'OFF';

/** Esecuzioni dei job pianificati (dati di piattaforma, migrazione 20260919000100). */
export interface JobRunsTable {
  id: Generated<string>;
  job: string;
  status: Generated<'RUNNING' | 'DONE' | 'FAILED'>;
  trigger: 'SCHEDULER' | 'HTTP';
  started_at: Timestamp;
  finished_at: NullableTimestamp;
  stats: JsonWithDefault<Record<string, unknown>>;
  error: string | null;
}

export interface JobsTable {
  id: Generated<string>;
  tenant_id: string;
  type: 'FILE_PROCESS' | 'TRANSCRIBE' | 'STRUCTURE' | 'PDF' | 'EXPORT' | 'EMAIL';
  idempotency_key: string;
  status: Generated<'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'DEAD'>;
  attempts: Generated<number>;
  last_error: string | null;
  payload: JsonWithDefault<Record<string, unknown>>;
  run_after: Timestamp;
  created_at: Timestamp;
  finished_at: NullableTimestamp;
}

export interface Database {
  tenants: TenantsTable;
  tenant_branding: TenantBrandingTable;
  user_profiles: UserProfilesTable;
  memberships: MembershipsTable;
  plan_versions: PlanVersionsTable;
  subscriptions: SubscriptionsTable;
  entitlement_overrides: EntitlementOverridesTable;
  usage_counters: UsageCountersTable;
  legal_documents: LegalDocumentsTable;
  legal_acceptances: LegalAcceptancesTable;
  audit_events: AuditEventsTable;
  projects: ProjectsTable;
  project_assignments: ProjectAssignmentsTable;
  contractors: ContractorsTable;
  project_contractors: ProjectContractorsTable;
  client_contacts: ClientContactsTable;
  access_tokens: AccessTokensTable;
  client_sessions: ClientSessionsTable;
  otp_challenges: OtpChallengesTable;
  drawings: DrawingsTable;
  drawing_versions: DrawingVersionsTable;
  drawing_pages: DrawingPagesTable;
  pins: PinsTable;
  comments: CommentsTable;
  approvals: ApprovalsTable;
  change_requests: ChangeRequestsTable;
  regulation_profiles: RegulationProfilesTable;
  regulation_profile_versions: RegulationProfileVersionsTable;
  buildings: BuildingsTable;
  dwelling_units: DwellingUnitsTable;
  rooms: RoomsTable;
  opening_types: OpeningTypesTable;
  openings: OpeningsTable;
  derogations: DerogationsTable;
  rai_snapshots: RaiSnapshotsTable;
  site_visits: SiteVisitsTable;
  visit_attendees: VisitAttendeesTable;
  visit_photos: VisitPhotosTable;
  audio_notes: AudioNotesTable;
  transcripts: TranscriptsTable;
  structured_drafts: StructuredDraftsTable;
  report_items: ReportItemsTable;
  open_actions: OpenActionsTable;
  client_operations: ClientOperationsTable;
  documents: DocumentsTable;
  document_deliveries: DocumentDeliveriesTable;
  notifications: NotificationsTable;
  jobs: JobsTable;
  job_runs: JobRunsTable;
}
