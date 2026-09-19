import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { ChangeRequest, DrawingCategory, ReviewBackend, VersionStatus } from './review-api';
import type { NotificationMode } from './studio-settings';

export interface PortalContext {
  studio: {
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    primaryColor: string;
    secondaryColor: string | null;
    portalTheme: 'LIGHT' | 'DARK' | 'AUTO';
    hasLogo: boolean;
    logoUrl: string | null;
  };
  project: { id: string; code: string; title: string; status: string; address: string; permitType: string | null };
  contact: { name: string; isSigner: boolean; privacyAcknowledged: boolean; notificationMode: NotificationMode };
  readOnly: boolean;
}

export interface PortalDrawing {
  drawingId: string;
  title: string;
  sheetCode: string | null;
  category: DrawingCategory;
  notes: string | null;
  downloadAllowed: boolean;
  versionId: string;
  version: number;
  status: Extract<VersionStatus, 'PUBLISHED' | 'APPROVED' | 'SUPERSEDED'>;
  publishedAt: string | null;
  reviewDueDate: string | null;
  pinsOpen: number;
}

export interface SignOffInfo {
  canApprove: boolean;
  isSigner: boolean;
  openPins: number;
  declarationText: string;
  declarationVersion: string;
}

export interface PortalDocument {
  id: string;
  type: string;
  title: string;
  number: string | null;
  revision: number;
  createdAt: string;
  signed: boolean;
  verificationCode: string | null;
}

/**
 * Portale del committente (Modulo 2, BR-25). Nessun account: la sessione vive in un cookie
 * HttpOnly ottenuto scambiando il Magic Link; l'interceptor invia le credenziali solo a /portal.
 */
@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly api = inject(Api);

  /** Scambia il token del link con la sessione (cookie). */
  open(token: string): Promise<PortalContext> {
    return this.api.post('/portal/session', { token });
  }

  context(): Promise<PortalContext> {
    return this.api.get('/portal/context');
  }

  acknowledgePrivacy(): Promise<void> {
    return this.api.post('/portal/privacy-ack');
  }

  /** FR-MT-06: avvisi raggruppati, riepilogo giornaliero o nessuno. */
  setNotificationMode(notificationMode: NotificationMode): Promise<void> {
    return this.api.patch('/portal/preferences', { notificationMode });
  }

  close(): Promise<void> {
    return this.api.delete('/portal/session');
  }

  /** FR-M1-05 punto 7: nuovo link via email (risposta identica anche per email sconosciute). */
  requestLink(slug: string, email: string): Promise<{ message: string }> {
    return this.api.post('/portal/request-link', { slug, email });
  }

  drawings(): Promise<PortalDrawing[]> {
    return this.api.get('/portal/drawings');
  }

  signOffInfo(versionId: string): Promise<SignOffInfo> {
    return this.api.get(`/portal/versions/${versionId}/sign-off`);
  }

  requestOtp(): Promise<{ challengeId: string; sentTo: string; expiresInSec: number }> {
    return this.api.post('/portal/otp');
  }

  approve(
    versionId: string, input: { challengeId: string; code: string; declarationAccepted: true; openPinsAcknowledged: boolean },
  ): Promise<{ approvalId: string; approvedAt: string; verificationCode: string; fileSha256: string }> {
    return this.api.post(`/portal/versions/${versionId}/approve`, input);
  }

  requestChange(versionId: string, description: string): Promise<{ id: string }> {
    return this.api.post(`/portal/versions/${versionId}/change-requests`, { description });
  }

  changeRequests(): Promise<ChangeRequest[]> {
    return this.api.get('/portal/change-requests');
  }

  documents(): Promise<PortalDocument[]> {
    return this.api.get('/portal/documents');
  }

  documentUrl(documentId: string): Promise<{ url: string }> {
    return this.api.get(`/portal/documents/${documentId}/download`);
  }

  /** Adattatore per lo spazio di revisione condiviso con lo studio. */
  readonly backend: ReviewBackend = {
    actor: 'CLIENT',
    view: (versionId) => this.api.get(`/portal/versions/${versionId}`),
    file: (versionId, download = false) => this.api.get(`/portal/versions/${versionId}/file`, { download: download || undefined }),
    createPin: (versionId, input) => this.api.post(`/portal/versions/${versionId}/pins`, input),
    comment: (pinId, body) => this.api.post(`/portal/pins/${pinId}/comments`, { body }),
    editComment: (commentId, body) => this.api.patch(`/portal/comments/${commentId}`, { body }),
    reopen: (pinId, body) => this.api.post(`/portal/pins/${pinId}/reopen`, { body }),
    withdraw: (pinId) => this.api.post(`/portal/pins/${pinId}/withdraw`),
  };
}
