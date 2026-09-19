import { Injectable, inject } from '@angular/core';
import { Api, uploadToSignedUrl } from './api';

export type DocumentType = 'SITE_REPORT' | 'RAI_REPORT' | 'RAI_CHECK' | 'APPROVAL_SUMMARY' | 'PIN_EXPORT' | 'UPLOAD';
export type DocumentStatus = 'DRAFT' | 'FINAL' | 'SIGNED' | 'CANCELLED';

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  SITE_REPORT: 'Verbale di sopralluogo',
  RAI_REPORT: 'Relazione asseverata R.A.I.',
  RAI_CHECK: 'Report di verifica R.A.I.',
  APPROVAL_SUMMARY: 'Riepilogo di approvazione',
  PIN_EXPORT: 'Elenco osservazioni',
  UPLOAD: 'Documento caricato',
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: 'Bozza', FINAL: 'Definitivo', SIGNED: 'Firmato digitalmente', CANCELLED: 'Annullato',
};

/** Documenti che il professionista firma digitalmente prima dell'invio (FR-M5-02). */
export const SIGNABLE_TYPES: DocumentType[] = ['RAI_REPORT', 'SITE_REPORT'];

export interface StudioDocument {
  id: string;
  type: DocumentType;
  number: string;
  revision: number;
  revisionReason: string | null;
  title: string;
  status: DocumentStatus;
  fileName: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  verificationCode: string | null;
  signed: boolean;
  signedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  sharedWithClient: boolean;
  createdAt: string;
}

export interface StudioDocumentRow extends StudioDocument {
  projectId: string;
  projectCode: string;
  projectTitle: string;
}

export interface Recipient {
  email: string;
  name?: string;
}

export interface Delivery {
  id: string;
  channel: 'EMAIL_ATTACHMENT' | 'EMAIL_LINK' | 'MANUAL_PEC';
  recipients: Recipient[];
  message: string | null;
  sentAt: string;
  deliveryStatus: { email: string; status: string; at: string }[];
  linkExpiresAt: string | null;
}

/** Modulo 5 — Documentale: archivio, firma PAdES, invio, condivisione, annullamento (FR-M5-*). */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly api = inject(Api);

  private base(projectId: string): string {
    return `/studio/projects/${projectId}/documents`;
  }

  studio(filter: { type?: DocumentType; status?: DocumentStatus; q?: string } = {}): Promise<StudioDocumentRow[]> {
    return this.api.get('/studio/documents', { ...filter });
  }

  list(projectId: string): Promise<StudioDocument[]> {
    return this.api.get(this.base(projectId));
  }

  /** FR-M5-01: verbale PDF da un sopralluogo finalizzato. */
  generateSiteReport(projectId: string, visitId: string): Promise<{ id: string; existing: boolean }> {
    return this.api.post(this.base(projectId), { type: 'SITE_REPORT', visitId });
  }

  /** URL firmato di 5 minuti; i documenti annullati si scaricano con la filigrana. */
  async open(projectId: string, doc: StudioDocument): Promise<void> {
    if (doc.status === 'CANCELLED') {
      await this.api.download(`${this.base(projectId)}/${doc.id}/content`, doc.fileName ?? `${doc.number}.pdf`);
      return;
    }
    const r = await this.api.get<{ url: string | null }>(`${this.base(projectId)}/${doc.id}/download`);
    if (r.url) window.open(r.url, '_blank', 'noopener');
  }

  /** Scarica il PDF originale da firmare con il proprio dispositivo (smart card o firma remota). */
  downloadForSigning(projectId: string, doc: StudioDocument): Promise<void> {
    return this.api.download(`${this.base(projectId)}/${doc.id}/content`, doc.fileName ?? `${doc.number}.pdf`);
  }

  /** FR-M5-02: il PDF firmato deve contenere esattamente il documento generato, con firma PAdES. */
  async uploadSigned(projectId: string, documentId: string, file: File): Promise<{ status: 'SIGNED'; signedSha256: string }> {
    const start = await this.api.post<{ uploadUrl: string; key: string }>(`${this.base(projectId)}/${documentId}/signed-upload`);
    await uploadToSignedUrl(start.uploadUrl, file, 'application/pdf');
    return this.api.post(`${this.base(projectId)}/${documentId}/signed-upload/complete`, { key: start.key });
  }

  send(
    projectId: string, documentId: string, input: { channel: 'EMAIL' | 'MANUAL_PEC'; recipients: Recipient[]; message?: string | null },
  ): Promise<{ channel: Delivery['channel']; deliveries: Delivery['deliveryStatus'] }> {
    return this.api.post(`${this.base(projectId)}/${documentId}/send`, input);
  }

  deliveries(projectId: string, documentId: string): Promise<Delivery[]> {
    return this.api.get(`${this.base(projectId)}/${documentId}/deliveries`);
  }

  share(projectId: string, documentId: string, shared: boolean): Promise<void> {
    return this.api.post(`${this.base(projectId)}/${documentId}/share`, { shared });
  }

  cancel(projectId: string, documentId: string, reason: string): Promise<void> {
    return this.api.post(`${this.base(projectId)}/${documentId}/cancel`, { reason });
  }
}
