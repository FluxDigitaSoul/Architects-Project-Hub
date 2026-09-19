import type { Ceiling, RegulationProfile } from '@aph/rai-engine';
import type { Generated, JSONColumnType } from 'kysely';
import type { NullableNumeric, NullableTimestamp, Numeric, Timestamp, NullableJson } from './types';

/** Tabelle della migrazione 0800: profili normativi, fabbricati, unità, vani, aperture, snapshot. */

export interface RegulationProfilesTable {
  id: Generated<string>;
  tenant_id: string | null;
  scope: 'SYSTEM' | 'TENANT';
  code: string;
  name: string;
  jurisdiction: string | null;
  is_template: Generated<boolean>;
  is_default: Generated<boolean>;
  created_at: Timestamp;
}

export interface RegulationProfileVersionsTable {
  id: Generated<string>;
  tenant_id: string | null;
  profile_id: string;
  version_number: number;
  parameters: JSONColumnType<RegulationProfile>;
  legal_references: Generated<string[]>;
  valid_from: string | null;
  published_at: NullableTimestamp;
  locked_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface BuildingsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  name: string;
  address: string | null;
  floors: number | null;
  year_built: number | null;
  constraints: string | null;
  sort_order: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface DwellingUnitsTable {
  id: Generated<string>;
  tenant_id: string;
  building_id: string;
  name: string;
  floor: string | null;
  cadastral: NullableJson<Record<string, string>>;
  unit_type: Generated<'DWELLING' | 'STUDIO_APARTMENT' | 'OTHER'>;
  occupants: number | null;
  is_attic: Generated<boolean>;
  regulation_profile_version_id: string | null;
  sort_order: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface RoomsTable {
  id: Generated<string>;
  tenant_id: string;
  unit_id: string;
  name: string;
  code: string | null;
  use: string;
  floor_area: Numeric;
  non_computable_area: NullableNumeric;
  ceiling: JSONColumnType<Ceiling>;
  is_windowless: Generated<boolean>;
  mechanical_ventilation: Generated<string>;
  notes: string | null;
  sort_order: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

interface OpeningColumns {
  kind: string;
  width: Numeric;
  height: Numeric;
  sill_height: NullableNumeric;
  glass_width: NullableNumeric;
  glass_height: NullableNumeric;
  operability: 'FULL' | 'PARTIAL' | 'FIXED';
  openable_area: NullableNumeric;
}

export interface OpeningTypesTable extends OpeningColumns {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  label: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface OpeningsTable extends OpeningColumns {
  id: Generated<string>;
  tenant_id: string;
  room_id: string;
  opening_type_id: string | null;
  label: string;
  orientation: string | null;
  quantity: Generated<number>;
  overhang_depth: NullableNumeric;
  faces_suitable_space: Generated<boolean>;
  notes: string | null;
  sort_order: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface DerogationsTable {
  id: Generated<string>;
  tenant_id: string;
  room_id: string | null;
  unit_id: string | null;
  code: 'D-01' | 'D-02' | 'D-03' | 'D-99';
  covers: string[];
  justification: string;
  legal_reference: string | null;
  created_at: Timestamp;
  created_by: string | null;
}

export interface RaiSnapshotsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  revision: number;
  reason: string | null;
  profile_version_id: string;
  inputs: JSONColumnType<object>;
  results: JSONColumnType<object>;
  inputs_sha256: string;
  created_at: Timestamp;
  created_by: string | null;
}
