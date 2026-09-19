import type { Generated } from 'kysely';
import type { JsonWithDefault, NullableTimestamp, Numeric, Timestamp, NullableJson } from './types';

/** Tabelle della migrazione 0700: elaborati, versioni, pagine, pin, commenti, approvazioni. */

export type VersionStatus = 'PROCESSING' | 'ERROR' | 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'APPROVED' | 'DISCARDED';
export type PinStatus = 'OPEN' | 'WAITING' | 'RESOLVED' | 'WITHDRAWN' | 'FROZEN' | 'TRANSFERRED';
export type AuthorType = 'MEMBER' | 'CLIENT';

export interface DrawingsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  title: string;
  sheet_code: string | null;
  category: Generated<string>;
  phase: string | null;
  scale: string | null;
  client_notes: string | null;
  download_allowed: Generated<boolean>;
  next_version_number: Generated<number>;
  created_at: Timestamp;
  created_by: string | null;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface DrawingVersionsTable {
  id: Generated<string>;
  tenant_id: string;
  drawing_id: string;
  number: number;
  status: Generated<VersionStatus>;
  original_file_key: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  sha256: string | null;
  page_count: number | null;
  revision_note: string | null;
  error_message: string | null;
  uploaded_by: string | null;
  uploaded_at: Timestamp;
  published_at: NullableTimestamp;
  published_by: string | null;
  review_due_date: string | null;
  frozen_at: NullableTimestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface DrawingPagesTable {
  id: Generated<string>;
  tenant_id: string;
  version_id: string;
  page_index: number;
  width_px: number;
  height_px: number;
  rotation: Generated<number>;
  preview_key: string | null;
  thumb_key: string | null;
}

export interface PinsTable {
  id: Generated<string>;
  tenant_id: string;
  version_id: string;
  page_id: string;
  number: number;
  x_pct: Numeric;
  y_pct: Numeric;
  category: string | null;
  status: Generated<PinStatus>;
  author_type: AuthorType;
  author_id: string;
  transferred_from_pin_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface CommentsTable {
  id: Generated<string>;
  tenant_id: string;
  pin_id: string;
  author_type: AuthorType;
  author_id: string;
  body: string;
  edit_history: JsonWithDefault<Array<{ body: string; editedAt: string }>>;
  edited_at: NullableTimestamp;
  retracted_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface ApprovalsTable {
  id: Generated<string>;
  tenant_id: string;
  version_id: string;
  client_contact_id: string;
  approved_at: Timestamp;
  ip: string | null;
  user_agent: string | null;
  file_sha256: string;
  declaration_text: string;
  declaration_version: string;
  otp_challenge_id: string;
  verification_code: string;
  open_pins_at_approval: Generated<number>;
  open_pins_acknowledged: Generated<boolean>;
  is_partial: Generated<boolean>;
}

export interface ChangeRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  version_id: string;
  client_contact_id: string;
  description: string;
  position_pct: NullableJson<{ x: number; y: number; pageIndex: number }>;
  status: Generated<
    'SUBMITTED' | 'IN_REVIEW' | 'ACCEPTED_IN_SCOPE' | 'ACCEPTED_EXTRA_SCOPE' | 'REJECTED' | 'CLOSED'
  >;
  assessment_note: string | null;
  indicative_amount_cents: string | number | null;
  visible_to_client: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}
