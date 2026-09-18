/** Modello dati del frontend (allineato all'AFU cap. 11). I dati arrivano dal BE via API; oggi da uno store in memoria. */

export type ProjectStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED';

export interface Project {
  id: string;
  code: string;
  title: string;
  address: string;
  municipality: string;
  clientName: string;
  status: ProjectStatus;
  interventionType: string;
  updatedAt: string;
}

export type DrawingStatus = 'DRAFT' | 'PUBLISHED' | 'APPROVED' | 'SUPERSEDED';

export interface Drawing {
  id: string;
  projectId: string;
  code: string;
  title: string;
  category: string;
  version: number;
  status: DrawingStatus;
  pinsOpen: number;
  pinsTotal: number;
  updatedAt: string;
  /** URL dell'anteprima della pagina (in produzione: URL firmato, AFU NFR-SEC-04). */
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// Revisione con il committente (AFU M2)
// ---------------------------------------------------------------------------

export type Actor = 'STUDIO' | 'CLIENT';
export type PinStatus = 'OPEN' | 'WAITING' | 'RESOLVED';

export interface PinComment {
  id: string;
  author: string;
  actor: Actor;
  text: string;
  at: string;
}

/** Pin con coordinate percentuali 0–100 sulla pagina (AFU FR-M2-07, BR-20). */
export interface Pin {
  id: string;
  drawingId: string;
  number: number;
  x: number;
  y: number;
  status: PinStatus;
  actor: Actor;
  comments: PinComment[];
}

export interface Approval {
  drawingId: string;
  version: number;
  signer: string;
  at: string;
  fileHash: string;
  verificationCode: string;
  openPinsAtApproval: number;
}

export interface ClientContact {
  id: string;
  projectId: string;
  name: string;
  email: string;
  isSigner: boolean;
  /** Token del Magic Link. In produzione il valore in chiaro esiste solo nel link (FR-M1-05). */
  token: string;
}

// ---------------------------------------------------------------------------
// Cantiere (AFU M4)
// ---------------------------------------------------------------------------

export type ReportSection = 'PROGRESS' | 'ISSUES' | 'ORDERS';

export interface ReportItem {
  id: string;
  section: ReportSection;
  text: string;
  needsVerification: boolean;
  origin: 'AI' | 'HUMAN' | 'AI_EDITED';
}

export interface VisitPhoto {
  id: string;
  url: string;
  caption: string;
  takenAt: string;
}

export interface AudioNote {
  id: string;
  url: string;
  durationSec: number;
  recordedAt: string;
}

export type AiState = 'IDLE' | 'RUNNING' | 'DONE';

export interface VisitDetail {
  visitId: string;
  attendees: string[];
  weather: string;
  photos: VisitPhoto[];
  audio: AudioNote[];
  items: ReportItem[];
  aiState: AiState;
}

export const REPORT_SECTION_LABEL: Record<ReportSection, string> = {
  PROGRESS: 'Avanzamento e lavorazioni',
  ISSUES: 'Difformità e non conformità',
  ORDERS: 'Disposizioni all’impresa',
};

export type VisitStatus = 'DRAFT' | 'REVIEW' | 'FINAL' | 'SENT';

export interface SiteVisit {
  id: string;
  projectId: string;
  number: number;
  date: string;
  status: VisitStatus;
  photos: number;
  issuesOpen: number;
}

export type ActivityKind = 'PIN' | 'PUBLISH' | 'APPROVAL' | 'VISIT' | 'RAI';

export interface Activity {
  id: string;
  projectId: string;
  kind: ActivityKind;
  text: string;
  at: string;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Attiva',
  SUSPENDED: 'Sospesa',
  CLOSED: 'Chiusa',
  ARCHIVED: 'Archiviata',
};

export const DRAWING_STATUS_LABEL: Record<DrawingStatus, string> = {
  DRAFT: 'Bozza',
  PUBLISHED: 'Pubblicata',
  APPROVED: 'Approvata',
  SUPERSEDED: 'Superata',
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  DRAFT: 'Bozza',
  REVIEW: 'Da revisionare',
  FINAL: 'Finalizzato',
  SENT: 'Inviato',
};
