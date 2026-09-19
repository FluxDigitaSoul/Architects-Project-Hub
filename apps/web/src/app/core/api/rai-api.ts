import { Injectable, inject } from '@angular/core';
import type {
  Ceiling,
  CheckId,
  DerogationCode,
  MechanicalVentilation,
  OpeningKind,
  Operability,
  Outcome,
  RoomUse,
  UnitInput,
  UnitResult,
  UnitType,
} from '@aph/rai-engine';
import { Api } from './api';

// ---- Struttura (righe salvate, con i campi descrittivi che il motore non usa) ---------------------

export interface RaiDerogation {
  id: string;
  code: DerogationCode;
  covers: CheckId[];
  justification: string;
  legalReference: string | null;
  createdAt: string;
}

export interface RaiOpening {
  id: string;
  label: string;
  kind: OpeningKind;
  quantity: number;
  width: string;
  height: string;
  sillHeight: string | null;
  glassWidth: string | null;
  glassHeight: string | null;
  operability: Operability;
  openableArea: string | null;
  overhangDepth: string | null;
  orientation: string | null;
  facesSuitableSpace: boolean;
  openingTypeId: string | null;
  notes: string | null;
}

export interface RaiRoom {
  id: string;
  name: string;
  code: string | null;
  use: RoomUse;
  floorArea: string;
  nonComputableArea: string | null;
  ceiling: Ceiling;
  isWindowless: boolean;
  mechanicalVentilation: MechanicalVentilation;
  notes: string | null;
  derogations: RaiDerogation[];
  openings: RaiOpening[];
}

export interface RaiUnit {
  id: string;
  name: string;
  floor: string | null;
  unitType: UnitType;
  occupants: number | null;
  isAttic: boolean;
  cadastral: Record<string, string> | null;
  regulationProfileVersionId: string | null;
  derogations: RaiDerogation[];
  rooms: RaiRoom[];
}

export interface RaiBuilding {
  id: string;
  name: string;
  address: string | null;
  floors: number | null;
  yearBuilt: number | null;
  constraints: string | null;
  units: RaiUnit[];
}

export interface RaiSummary {
  counts: Record<Outcome, number>;
  rooms: number;
  deficitSqm: string;
}

/** Risposta di GET /rai: esiti calcolati dal server + struttura per l'editor. */
export interface RaiProject {
  buildings: { id: string; name: string; units: { id: string; name: string; profileVersionId: string; input: UnitInput; result: UnitResult }[] }[];
  profile: { versionId: string; id: string; name: string; version: number };
  summary: RaiSummary;
  structure: RaiBuilding[];
  projectProfileVersionId: string | null;
  altitudeM: number | null;
}

export interface RegulationProfileOption {
  id: string;
  code: string;
  name: string;
  scope: 'SYSTEM' | 'TENANT';
  isTemplate: boolean;
  isDefault: boolean;
  versionId: string;
  version: number;
  legalReferences: string[];
  locked: boolean;
}

export interface RaiSnapshot {
  id: string;
  revision: number;
  reason: string | null;
  createdAt: string;
  inputsSha256: string;
  summary: RaiSummary | null;
}

// ---- Input ----------------------------------------------------------------------------------

export interface UnitFields {
  name: string;
  floor?: string | null;
  unitType?: UnitType;
  occupants?: number | null;
  isAttic?: boolean;
  regulationProfileVersionId?: string | null;
}

export interface RoomFields {
  name: string;
  code?: string | null;
  use: RoomUse;
  floorArea: string;
  nonComputableArea?: string | null;
  ceiling: Ceiling;
  isWindowless?: boolean;
  mechanicalVentilation?: MechanicalVentilation;
  notes?: string | null;
}

export interface OpeningFields {
  label: string;
  kind: OpeningKind;
  quantity?: number;
  width: string;
  height: string;
  sillHeight?: string | null;
  glassWidth?: string | null;
  glassHeight?: string | null;
  operability: Operability;
  openableArea?: string | null;
  overhangDepth?: string | null;
  orientation?: string | null;
  facesSuitableSpace?: boolean;
  notes?: string | null;
}

export interface DerogationFields {
  code: DerogationCode;
  covers: CheckId[];
  justification: string;
  legalReference?: string | null;
}

export type RaiKind = 'buildings' | 'units' | 'rooms' | 'openings' | 'derogations' | 'opening-types';

/** Modulo 3 — R.A.I. persistente con calcolo lato server (FR-M3-01..16). */
@Injectable({ providedIn: 'root' })
export class RaiApi {
  private readonly api = inject(Api);

  private base(projectId: string): string {
    return `/studio/projects/${projectId}/rai`;
  }

  profiles(): Promise<RegulationProfileOption[]> {
    return this.api.get('/studio/regulation-profiles');
  }

  load(projectId: string): Promise<RaiProject> {
    return this.api.get(this.base(projectId));
  }

  createBuilding(projectId: string, input: { name: string; address?: string | null }): Promise<{ id: string }> {
    return this.api.post(`${this.base(projectId)}/buildings`, input);
  }

  updateBuilding(projectId: string, id: string, patch: { name?: string; address?: string | null }): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/buildings/${id}`, patch);
  }

  createUnit(projectId: string, buildingId: string, input: UnitFields): Promise<{ id: string }> {
    return this.api.post(`${this.base(projectId)}/buildings/${buildingId}/units`, input);
  }

  updateUnit(projectId: string, id: string, patch: Partial<UnitFields>): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/units/${id}`, patch);
  }

  createRoom(projectId: string, unitId: string, input: RoomFields): Promise<{ id: string }> {
    return this.api.post(`${this.base(projectId)}/units/${unitId}/rooms`, input);
  }

  updateRoom(projectId: string, id: string, patch: Partial<RoomFields>): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/rooms/${id}`, patch);
  }

  createOpening(projectId: string, roomId: string, input: OpeningFields): Promise<{ id: string }> {
    return this.api.post(`${this.base(projectId)}/rooms/${roomId}/openings`, input);
  }

  updateOpening(projectId: string, id: string, patch: Partial<OpeningFields>): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/openings/${id}`, patch);
  }

  addDerogation(projectId: string, target: { roomId: string } | { unitId: string }, input: DerogationFields): Promise<{ id: string }> {
    const path = 'roomId' in target ? `rooms/${target.roomId}` : `units/${target.unitId}`;
    return this.api.post(`${this.base(projectId)}/${path}/derogations`, input);
  }

  remove(projectId: string, kind: RaiKind, id: string): Promise<void> {
    return this.api.delete(`${this.base(projectId)}/${kind}/${id}`);
  }

  snapshots(projectId: string): Promise<RaiSnapshot[]> {
    return this.api.get(`${this.base(projectId)}/snapshots`);
  }

  /** FR-M3-16: revisione immutabile del calcolo; dalla Rev. 1 serve il motivo. */
  createSnapshot(projectId: string, reason: string | null): Promise<{ id: string; revision: number; summary: RaiSummary }> {
    return this.api.post(`${this.base(projectId)}/snapshots`, { reason });
  }

  /** Relazione asseverativa (RAI_REPORT) o report di verifica (RAI_CHECK) da una revisione (FR-M5-20). */
  generateReport(projectId: string, snapshotId: string, type: 'RAI_REPORT' | 'RAI_CHECK'): Promise<{ id: string }> {
    return this.api.post(`/studio/projects/${projectId}/documents`, { type, snapshotId });
  }
}
