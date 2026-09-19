import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Api, toApiError } from './api';

export type VisitType = 'ORDINARY' | 'EXTRAORDINARY' | 'TESTING' | 'OTHER';
export type VisitStatus = 'DRAFT' | 'AI_PROCESSING' | 'REVIEW' | 'FINAL' | 'SENT' | 'CANCELLED';
export type ReportSection = 'PROGRESS' | 'ISSUES' | 'ORDERS' | 'GENERAL';
export type AttendeeKind = 'MEMBER' | 'CLIENT' | 'CONTRACTOR' | 'OTHER';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  ORDINARY: 'Ordinario', EXTRAORDINARY: 'Straordinario', TESTING: 'Collaudo', OTHER: 'Altro',
};
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  DRAFT: 'Bozza', AI_PROCESSING: 'In elaborazione', REVIEW: 'Da revisionare', FINAL: 'Finalizzato', SENT: 'Inviato', CANCELLED: 'Annullato',
};
export const SECTION_LABEL: Record<ReportSection, string> = {
  PROGRESS: 'Avanzamento e lavorazioni', ISSUES: 'Difformità e non conformità', ORDERS: 'Disposizioni all’impresa', GENERAL: 'Note generali',
};
export const ATTENDEE_KIND_LABEL: Record<AttendeeKind, string> = {
  MEMBER: 'Studio', CLIENT: 'Committente', CONTRACTOR: 'Impresa', OTHER: 'Altro',
};
export const SEVERITY_LABEL: Record<Severity, string> = { LOW: 'Bassa', MEDIUM: 'Media', HIGH: 'Alta' };

export interface Weather {
  condition: string;
  temperatureC?: number;
  source?: 'MANUAL' | 'AUTO';
}

export interface VisitSummary {
  id: string;
  number: number;
  visitType: VisitType;
  startedAt: string;
  status: VisitStatus;
  sharedWithClient: boolean;
  photos: number;
  issues: number;
}

export interface Attendee {
  id?: string;
  kind: AttendeeKind;
  refId?: string | null;
  name: string;
  qualification?: string | null;
  organization?: string | null;
  isDirector: boolean;
}

export interface ReportItem {
  id: string;
  section: ReportSection;
  text: string;
  severity: Severity | null;
  addressee: string | null;
  dueDate: string | null;
  needsVerification: boolean;
  origin: 'AI' | 'HUMAN' | 'AI_EDITED';
  photoRefs: string[];
  sortOrder: number;
  version: number;
  /** Solo nel client: modifica salvata sul dispositivo e non ancora arrivata al server (FR-M4-14). */
  pending?: boolean;
}

export interface VisitPhoto {
  id: string;
  uploadStatus: 'PENDING' | 'UPLOADED' | 'FAILED';
  url: string | null;
  caption: string | null;
  section: ReportSection | null;
  takenAt: string | null;
  includeInReport: boolean;
  sortOrder: number;
}

export interface AudioNote {
  id: string;
  uploadStatus: 'PENDING' | 'UPLOADED' | 'FAILED';
  url: string | null;
  durationSec: number | null;
  recordedAt: string;
  transcriptionStatus: string;
}

export interface VisitDetail {
  id: string;
  number: number;
  visitType: VisitType;
  status: VisitStatus;
  startedAt: string;
  endedAt: string | null;
  weather: Weather | null;
  phase: string | null;
  generalNotes: string | null;
  sharedWithClient: boolean;
  finalizedAt: string | null;
  cancelReason: string | null;
  attendees: Attendee[];
  photos: VisitPhoto[];
  audio: AudioNote[];
  items: ReportItem[];
  openActionsToVerify: { id: string; sourceVisitNumber: number; text: string; dueDate: string | null }[];
}

export interface Site {
  projectId: string;
  code: string;
  title: string;
  municipality: string;
  lastVisitAt: string | null;
  drafts: number;
  openActions: number;
}

export interface ItemInput {
  section: ReportSection;
  text: string;
  severity?: Severity | null;
  addressee?: string | null;
  dueDate?: string | null;
  needsVerification?: boolean;
  origin?: ReportItem['origin'];
  sortOrder?: number;
}

export interface VisitPatch {
  visitType?: VisitType;
  startedAt?: string;
  endedAt?: string | null;
  weather?: Weather | null;
  phase?: string | null;
  generalNotes?: string | null;
}

export interface MediaStart {
  id: string;
  uploadStatus: 'PENDING' | 'UPLOADED';
  key: string | null;
  uploadUrl: string | null;
}

/** Modulo 4 — Diario di cantiere (FR-M4-02..15). */
@Injectable({ providedIn: 'root' })
export class FieldApi {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);

  private base(projectId: string, visitId?: string): string {
    return `/studio/projects/${projectId}/visits${visitId ? `/${visitId}` : ''}`;
  }

  sites(): Promise<Site[]> {
    return this.api.get('/studio/field/sites');
  }

  list(projectId: string): Promise<VisitSummary[]> {
    return this.api.get(this.base(projectId));
  }

  /** L'id lo genera il client: ripetere la chiamata (rete instabile) non crea doppioni (FR-M4-03). */
  create(
    projectId: string, input: { id: string; visitType: VisitType; startedAt: string; weather?: Weather | null; phase?: string | null },
  ): Promise<{ id: string; number: number }> {
    return this.api.post(this.base(projectId), input);
  }

  detail(projectId: string, visitId: string): Promise<VisitDetail> {
    return this.api.get(this.base(projectId, visitId));
  }

  update(projectId: string, visitId: string, patch: VisitPatch): Promise<void> {
    return this.api.patch(this.base(projectId, visitId), patch);
  }

  setAttendees(projectId: string, visitId: string, attendees: Attendee[]): Promise<void> {
    return this.api.put(`${this.base(projectId, visitId)}/attendees`, attendees.map(({ id: _id, ...a }) => a));
  }

  /** Idempotente con X-Client-Op-Id: la stessa operazione ripetuta non duplica la voce (BR-23). */
  async addItem(projectId: string, visitId: string, input: ItemInput, opId: string): Promise<{ id: string }> {
    try {
      return await firstValueFrom(this.http.post<{ id: string }>(
        `${environment.apiBase}${this.base(projectId, visitId)}/items`, input, { headers: new HttpHeaders({ 'X-Client-Op-Id': opId }) },
      ));
    } catch (e) {
      throw toApiError(e);
    }
  }

  updateItem(projectId: string, visitId: string, itemId: string, patch: Partial<ItemInput>): Promise<void> {
    return this.api.patch(`${this.base(projectId, visitId)}/items/${itemId}`, patch);
  }

  removeItem(projectId: string, visitId: string, itemId: string): Promise<void> {
    return this.api.delete(`${this.base(projectId, visitId)}/items/${itemId}`);
  }

  startMedia(
    projectId: string, visitId: string, kind: 'photos' | 'audio',
    input: { id: string; takenAt?: string | null; caption?: string | null; section?: ReportSection | null; durationSec?: number | null },
  ): Promise<MediaStart> {
    return this.api.post(`${this.base(projectId, visitId)}/${kind}`, input);
  }

  completeMedia(projectId: string, visitId: string, kind: 'photos' | 'audio', mediaId: string): Promise<{ uploadStatus: 'UPLOADED' }> {
    return this.api.post(`${this.base(projectId, visitId)}/${kind}/${mediaId}/complete`);
  }

  updatePhoto(
    projectId: string, visitId: string, photoId: string, patch: { caption?: string | null; section?: ReportSection | null; includeInReport?: boolean },
  ): Promise<void> {
    return this.api.patch(`${this.base(projectId, visitId)}/photos/${photoId}`, patch);
  }

  removeMedia(projectId: string, visitId: string, kind: 'photos' | 'audio', mediaId: string): Promise<void> {
    return this.api.delete(`${this.base(projectId, visitId)}/${kind}/${mediaId}`);
  }

  /** FR-M4-12: finalizzazione (firma del DL); le difformità verificate si chiudono. */
  finalize(projectId: string, visitId: string, resolvedActionIds: string[]): Promise<{ id: string; number: number; status: 'FINAL' }> {
    return this.api.post(`${this.base(projectId, visitId)}/finalize`, { resolvedActionIds });
  }

  cancel(projectId: string, visitId: string, reason: string): Promise<void> {
    return this.api.post(`${this.base(projectId, visitId)}/cancel`, { reason });
  }
}
