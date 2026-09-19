import type { Generated, JSONColumnType } from 'kysely';
import type { JsonWithDefault, NullableTimestamp, Timestamp, NullableJson } from './types';

/** Tabelle della migrazione 0900: sopralluoghi, presenti, foto, audio, voci, azioni aperte. */

export type VisitStatus = 'DRAFT' | 'AI_PROCESSING' | 'REVIEW' | 'FINAL' | 'SENT' | 'CANCELLED';
export type ReportSection = 'PROGRESS' | 'ISSUES' | 'ORDERS' | 'GENERAL';
export type UploadStatus = 'PENDING' | 'UPLOADED' | 'FAILED';

export interface Weather {
  condition: string;
  temperatureC?: number;
  source: 'MANUAL' | 'AUTO';
}

export interface SiteVisitsTable {
  id: string;
  tenant_id: string;
  project_id: string;
  number: number;
  visit_type: Generated<'ORDINARY' | 'EXTRAORDINARY' | 'TESTING' | 'OTHER'>;
  started_at: Timestamp;
  ended_at: NullableTimestamp;
  weather: NullableJson<Weather>;
  phase: string | null;
  geo: NullableJson<{ lat: number; lng: number }>;
  status: Generated<VisitStatus>;
  director_membership_id: string;
  general_notes: string | null;
  finalized_at: NullableTimestamp;
  finalized_by: string | null;
  cancelled_at: NullableTimestamp;
  cancel_reason: string | null;
  replaces_visit_id: string | null;
  shared_with_client: Generated<boolean>;
  created_at: Timestamp;
  created_by: string | null;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface VisitAttendeesTable {
  id: Generated<string>;
  tenant_id: string;
  visit_id: string;
  kind: 'MEMBER' | 'CLIENT' | 'CONTRACTOR' | 'OTHER';
  ref_id: string | null;
  name: string;
  qualification: string | null;
  organization: string | null;
  is_director: Generated<boolean>;
  sort_order: Generated<number>;
}

export interface VisitPhotosTable {
  id: string;
  tenant_id: string;
  visit_id: string;
  file_key: string | null;
  thumb_key: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  upload_status: Generated<UploadStatus>;
  taken_at: NullableTimestamp;
  geo: NullableJson<{ lat: number; lng: number }>;
  sort_order: Generated<number>;
  caption: string | null;
  section: ReportSection | null;
  include_in_report: Generated<boolean>;
  derived_from_photo_id: string | null;
  created_at: Timestamp;
}

export interface AudioNotesTable {
  id: string;
  tenant_id: string;
  visit_id: string;
  file_key: string | null;
  mime_type: string | null;
  duration_sec: number | null;
  upload_status: Generated<UploadStatus>;
  recorded_at: Timestamp;
  transcription_status: Generated<'NONE' | 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'>;
  created_at: Timestamp;
  purged_at: NullableTimestamp;
}

export interface TranscriptsTable {
  id: Generated<string>;
  tenant_id: string;
  audio_note_id: string;
  provider: string;
  language: Generated<string>;
  text: string;
  segments: JsonWithDefault<Array<{ start: number; end: number; text: string; confidence?: number }>>;
  avg_confidence: string | null;
  created_at: Timestamp;
}

export interface StructuredDraftsTable {
  id: Generated<string>;
  tenant_id: string;
  visit_id: string;
  model: string;
  prompt_version: string;
  input_sha256: string;
  output: JSONColumnType<object>;
  created_at: Timestamp;
}

export interface ReportItemsTable {
  id: Generated<string>;
  tenant_id: string;
  visit_id: string;
  section: ReportSection;
  sort_order: Generated<number>;
  text: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  addressee: string | null;
  due_date: string | null;
  needs_verification: Generated<boolean>;
  origin: Generated<'AI' | 'HUMAN' | 'AI_EDITED'>;
  photo_refs: Generated<string[]>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface OpenActionsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  source_item_id: string;
  source_visit_number: number;
  status: Generated<'OPEN' | 'RESOLVED' | 'SUPERSEDED'>;
  due_date: string | null;
  resolved_in_visit_id: string | null;
  resolved_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface ClientOperationsTable {
  tenant_id: string;
  client_op_id: string;
  user_id: string;
  operation: string;
  result: JSONColumnType<object>;
  applied_at: Timestamp;
}
