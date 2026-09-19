import { Injectable, inject } from '@angular/core';
import { Api, ApiError, uploadToSignedUrl } from './api';

// ---- Enum del Modulo 2 (allineati ai check della migrazione 0700) -------------------------------

export type DrawingCategory = 'PLAN' | 'SECTION' | 'ELEVATION' | 'DETAIL' | 'RENDER' | 'SURVEY' | 'OTHER';
export type VersionStatus = 'PROCESSING' | 'DRAFT' | 'PUBLISHED' | 'APPROVED' | 'SUPERSEDED' | 'ERROR' | 'DISCARDED';
export type PinStatus = 'OPEN' | 'WAITING' | 'RESOLVED' | 'WITHDRAWN' | 'FROZEN' | 'TRANSFERRED';
export type AuthorType = 'MEMBER' | 'CLIENT';
export type ChangeRequestStatus = 'SUBMITTED' | 'IN_REVIEW' | 'ACCEPTED_IN_SCOPE' | 'ACCEPTED_EXTRA_SCOPE' | 'REJECTED' | 'CLOSED';

export const CATEGORY_LABEL: Record<DrawingCategory, string> = {
  PLAN: 'Pianta', SECTION: 'Sezione', ELEVATION: 'Prospetto', DETAIL: 'Dettaglio', RENDER: 'Render', SURVEY: 'Rilievo', OTHER: 'Altro',
};

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  PROCESSING: 'In elaborazione', DRAFT: 'Bozza', PUBLISHED: 'Pubblicata', APPROVED: 'Approvata',
  SUPERSEDED: 'Superata', ERROR: 'File non valido', DISCARDED: 'Scartata',
};

/** OPEN = attende lo studio; WAITING = attende il committente (SM-PIN). */
export const PIN_STATUS_LABEL: Record<PinStatus, string> = {
  OPEN: 'Da rispondere', WAITING: 'In attesa del committente', RESOLVED: 'Risolta',
  WITHDRAWN: 'Ritirata', FROZEN: 'Congelata', TRANSFERRED: 'Trasferita',
};

export const CHANGE_REQUEST_LABEL: Record<ChangeRequestStatus, string> = {
  SUBMITTED: 'Nuova', IN_REVIEW: 'In valutazione', ACCEPTED_IN_SCOPE: 'Accettata nell’incarico',
  ACCEPTED_EXTRA_SCOPE: 'Accettata extra-incarico', REJECTED: 'Respinta', CLOSED: 'Chiusa',
};

// ---- DTO ----------------------------------------------------------------------------------------

export interface DrawingListItem {
  id: string;
  title: string;
  sheetCode: string | null;
  category: DrawingCategory;
  phase: string | null;
  scale: string | null;
  downloadAllowed: boolean;
  latestVersion: { id: string; number: number; status: VersionStatus; publishedAt: string | null } | null;
  pinsOpen: number;
  updatedAt: string;
}

export interface DrawingVersion {
  id: string;
  number: number;
  status: VersionStatus;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  pageCount: number | null;
  revisionNote: string | null;
  errorMessage: string | null;
  uploadedAt: string;
  publishedAt: string | null;
  reviewDueDate: string | null;
  frozenAt: string | null;
}

export interface ReviewComment {
  id: string;
  authorType: AuthorType;
  authorName: string;
  isMine: boolean;
  body: string;
  retracted: boolean;
  edited: boolean;
  createdAt: string;
}

export interface ReviewPin {
  id: string;
  number: number;
  pageIndex: number;
  x: number;
  y: number;
  status: PinStatus;
  category: string | null;
  authorType: AuthorType;
  authorName: string;
  isMine: boolean;
  createdAt: string;
  comments: ReviewComment[];
}

export interface ReviewView {
  version: {
    id: string;
    number: number;
    status: VersionStatus;
    drawingId: string;
    title: string;
    sheetCode: string | null;
    pageCount: number | null;
    sha256: string | null;
    frozen: boolean;
    publishedAt: string | null;
    downloadAllowed: boolean;
  };
  pages: { index: number; width: number; height: number; rotation: number }[];
  pins: ReviewPin[];
}

export interface FileLink {
  url: string;
  mimeType: string | null;
  expiresInSec: number;
}

export interface FreezeLog {
  version: { id: string; number: number; status: VersionStatus; title: string; sha256: string | null };
  approvals: {
    id: string; signer: string; email: string; approvedAt: string; ip: string | null; userAgent: string | null;
    fileSha256: string; verificationCode: string; declarationText: string; openPinsAtApproval: number;
  }[];
  events: { at: string; actorType: string; action: string; objectType: string; objectId: string; details: unknown }[];
}

export interface ChangeRequest {
  id: string;
  description: string;
  status: ChangeRequestStatus;
  assessmentNote: string | null;
  indicativeAmountCents: number | null;
  drawingTitle: string;
  versionNumber: number;
  requestedBy: string;
  createdAt: string;
}

export interface DrawingInput {
  title: string;
  sheetCode?: string | null;
  category: DrawingCategory;
  phase?: string | null;
  scale?: string | null;
  clientNotes?: string | null;
  downloadAllowed: boolean;
}

export interface PinInput {
  pageIndex: number;
  x: number;
  y: number;
  body: string;
}

/**
 * Operazioni di revisione comuni a studio e portale del committente: lo stesso spazio di
 * lavoro (tavola + pin + thread) funziona con entrambi, cambiano solo gli endpoint e i permessi.
 */
export interface ReviewBackend {
  readonly actor: AuthorType;
  view(versionId: string): Promise<ReviewView>;
  file(versionId: string, download?: boolean): Promise<FileLink>;
  createPin(versionId: string, input: PinInput): Promise<{ id: string; number: number }>;
  comment(pinId: string, body: string): Promise<unknown>;
  editComment(commentId: string, body: string): Promise<void>;
  reopen(pinId: string, body: string): Promise<void>;
  withdraw(pinId: string): Promise<void>;
  /** Solo lo studio segna le osservazioni come risolte. */
  resolve?(pinId: string): Promise<void>;
}

/** Tipi di file accettati per gli elaborati (FR-M2-01, TC-SEC-05). */
export const DRAWING_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
export const DRAWING_MAX_BYTES = 200 * 1024 * 1024;

/** Modulo 2 lato studio: elaborati, versioni, pubblicazione e revisione (FR-M2-01..18). */
@Injectable({ providedIn: 'root' })
export class StudioReviewApi {
  private readonly api = inject(Api);

  private base(projectId: string): string {
    return `/studio/projects/${projectId}`;
  }

  drawings(projectId: string): Promise<DrawingListItem[]> {
    return this.api.get(`${this.base(projectId)}/drawings`);
  }

  createDrawing(projectId: string, input: DrawingInput): Promise<{ id: string }> {
    return this.api.post(`${this.base(projectId)}/drawings`, input);
  }

  updateDrawing(projectId: string, drawingId: string, patch: Partial<DrawingInput>): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/drawings/${drawingId}`, patch);
  }

  versions(projectId: string, drawingId: string): Promise<DrawingVersion[]> {
    return this.api.get(`${this.base(projectId)}/drawings/${drawingId}/versions`);
  }

  /**
   * Carica una nuova versione: l'API crea la versione e un URL firmato, il file va diretto allo
   * storage, poi "complete" ne verifica tipo reale e pagine. Esito DRAFT oppure ERROR con motivo.
   */
  async uploadVersion(
    projectId: string, drawingId: string, file: File, revisionNote: string | null,
  ): Promise<{ versionId: string; number: number; status: 'DRAFT' | 'ERROR'; error?: string }> {
    if (file.size > DRAWING_MAX_BYTES) throw new ApiError(413, 'UNSUPPORTED_FILE', 'Il file supera i 200 MB.', null, undefined);
    const started = await this.api.post<{ versionId: string; number: number; uploadUrl: string }>(
      `${this.base(projectId)}/drawings/${drawingId}/versions`, { revisionNote },
    );
    try {
      await uploadToSignedUrl(started.uploadUrl, file);
    } catch (e) {
      // La versione rimasta in caricamento si scarta, così non resta un numero "appeso".
      await this.discard(projectId, drawingId, started.versionId).catch(() => undefined);
      throw e;
    }
    const done = await this.api.post<{ status: 'DRAFT' | 'ERROR'; error?: string }>(
      `${this.base(projectId)}/drawings/${drawingId}/versions/${started.versionId}/complete`,
    );
    return { versionId: started.versionId, number: started.number, ...done };
  }

  withdrawVersion(projectId: string, drawingId: string, versionId: string): Promise<void> {
    return this.api.post(`${this.base(projectId)}/drawings/${drawingId}/versions/${versionId}/withdraw`);
  }

  discard(projectId: string, drawingId: string, versionId: string): Promise<void> {
    return this.api.delete(`${this.base(projectId)}/drawings/${drawingId}/versions/${versionId}`);
  }

  publish(
    projectId: string, input: { versionIds: string[]; reviewDueDate?: string | null; message?: string | null; notifyClients: boolean },
  ): Promise<{ published: number; notified: number }> {
    return this.api.post(`${this.base(projectId)}/publish`, input);
  }

  freezeLog(projectId: string, versionId: string): Promise<FreezeLog> {
    return this.api.get(`${this.base(projectId)}/versions/${versionId}/freeze-log`);
  }

  transferPins(projectId: string, toVersionId: string, fromVersionId: string): Promise<{ transferred: number }> {
    return this.api.post(`${this.base(projectId)}/versions/${toVersionId}/transfer-pins`, { fromVersionId });
  }

  changeRequests(projectId: string): Promise<ChangeRequest[]> {
    return this.api.get(`${this.base(projectId)}/change-requests`);
  }

  assessChangeRequest(
    projectId: string, requestId: string,
    input: { status: ChangeRequestStatus; note?: string | null; indicativeAmountCents?: number | null; visibleToClient?: boolean },
  ): Promise<void> {
    return this.api.patch(`${this.base(projectId)}/change-requests/${requestId}`, input);
  }

  /** Adattatore per lo spazio di revisione condiviso con il portale. */
  backend(projectId: string): ReviewBackend {
    const base = this.base(projectId);
    return {
      actor: 'MEMBER',
      view: (versionId) => this.api.get(`${base}/versions/${versionId}`),
      file: (versionId, download = false) => this.api.get(`${base}/versions/${versionId}/file`, { download: download || undefined }),
      createPin: (versionId, input) => this.api.post(`${base}/versions/${versionId}/pins`, input),
      comment: (pinId, body) => this.api.post(`${base}/pins/${pinId}/comments`, { body }),
      editComment: (commentId, body) => this.api.patch(`${base}/comments/${commentId}`, { body }),
      reopen: (pinId, body) => this.api.post(`${base}/pins/${pinId}/reopen`, { body }),
      withdraw: (pinId) => this.api.post(`${base}/pins/${pinId}/withdraw`),
      resolve: (pinId) => this.api.post(`${base}/pins/${pinId}/resolve`),
    };
  }
}
