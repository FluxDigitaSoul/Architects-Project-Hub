import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { StudioRole } from '../tenant/tenant-context';

// ---- Enum del Modulo 1 (allineati a projects.schemas.ts dell'API) --------------------------------

export type ProjectStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED';
export type InterventionType =
  | 'NEW_BUILD' | 'RENOVATION' | 'EXTRAORDINARY_MAINTENANCE' | 'RESTORATION'
  | 'CHANGE_OF_USE' | 'SPLIT_MERGE' | 'ATTIC_RECOVERY' | 'INTERIOR_DESIGN' | 'OTHER';
export type PermitType = 'CILA' | 'SCIA' | 'SCIA_ALT_PDC' | 'PDC' | 'FREE' | 'TBD';
export type ContactKind = 'PERSON' | 'COMPANY' | 'CONDOMINIUM' | 'PUBLIC_BODY';
export type ContactRole = 'OWNER' | 'CO_OWNER' | 'CONDO_ADMIN' | 'DELEGATE' | 'OTHER';
export type ProjectRole = 'LEAD' | 'DESIGNER' | 'SITE_DIRECTOR' | 'COLLABORATOR';
export type TransitionAction = 'SUSPEND' | 'REACTIVATE' | 'CLOSE' | 'REOPEN' | 'ARCHIVE' | 'RESTORE';
export type LinkStatus = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Attiva', SUSPENDED: 'Sospesa', CLOSED: 'Chiusa', ARCHIVED: 'Archiviata',
};

export const INTERVENTION_LABEL: Record<InterventionType, string> = {
  NEW_BUILD: 'Nuova costruzione',
  RENOVATION: 'Ristrutturazione edilizia',
  EXTRAORDINARY_MAINTENANCE: 'Manutenzione straordinaria',
  RESTORATION: 'Restauro e risanamento conservativo',
  CHANGE_OF_USE: 'Cambio di destinazione d’uso',
  SPLIT_MERGE: 'Frazionamento / accorpamento',
  ATTIC_RECOVERY: 'Recupero sottotetto',
  INTERIOR_DESIGN: 'Interior design',
  OTHER: 'Altro',
};

export const PERMIT_LABEL: Record<PermitType, string> = {
  CILA: 'CILA', SCIA: 'SCIA', SCIA_ALT_PDC: 'SCIA alternativa al PdC', PDC: 'Permesso di costruire',
  FREE: 'Edilizia libera', TBD: 'Da definire',
};

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  PERSON: 'Persona fisica', COMPANY: 'Società', CONDOMINIUM: 'Condominio', PUBLIC_BODY: 'Ente pubblico',
};

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  OWNER: 'Proprietario', CO_OWNER: 'Comproprietario', CONDO_ADMIN: 'Amministratore di condominio',
  DELEGATE: 'Delegato', OTHER: 'Altro',
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  LEAD: 'Responsabile', DESIGNER: 'Progettista', SITE_DIRECTOR: 'Direttore dei lavori', COLLABORATOR: 'Collaboratore',
};

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  NONE: 'Nessun link', ACTIVE: 'Link attivo', EXPIRED: 'Link scaduto', REVOKED: 'Link revocato',
};

/** SM-PROGETTO: azioni disponibili per stato, con etichetta e testo di conferma. */
export const TRANSITIONS: Record<ProjectStatus, { action: TransitionAction; label: string; confirm: string }[]> = {
  ACTIVE: [
    { action: 'SUSPEND', label: 'Sospendi', confirm: 'La commessa resta consultabile ma non si possono pubblicare tavole né creare sopralluoghi.' },
    { action: 'CLOSE', label: 'Chiudi', confirm: 'I link dei committenti restano attivi per il periodo di tolleranza, poi scadono.' },
  ],
  SUSPENDED: [
    { action: 'REACTIVATE', label: 'Riattiva', confirm: 'La commessa torna operativa.' },
    { action: 'CLOSE', label: 'Chiudi', confirm: 'I link dei committenti restano attivi per il periodo di tolleranza, poi scadono.' },
  ],
  CLOSED: [
    { action: 'REOPEN', label: 'Riapri', confirm: 'La commessa torna attiva.' },
    { action: 'ARCHIVE', label: 'Archivia', confirm: 'La commessa esce dagli elenchi e i link dei committenti vengono revocati; i dati restano conservati.' },
  ],
  ARCHIVED: [{ action: 'RESTORE', label: 'Ripristina', confirm: 'La commessa torna tra quelle chiuse.' }],
};

// ---- DTO ----------------------------------------------------------------------------------------

export interface SiteAddress {
  street: string;
  number?: string;
  zip?: string;
  city: string;
  province?: string;
}

export interface Cadastral {
  sheet?: string;
  parcel?: string;
  sub?: string;
  category?: string;
}

export interface ProjectSummary {
  id: string;
  code: string;
  title: string;
  status: ProjectStatus;
  interventionType: InterventionType;
  permitType: PermitType | null;
  municipality: string;
  address: string;
  isDemo: boolean;
  updatedAt: string;
  version: number;
}

export interface ProjectListItem extends ProjectSummary {
  clientName: string | null;
  pinsOpen: number;
  drawingsAwaitingApproval: number;
  lastVisitAt: string | null;
}

export interface Page<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface Contact {
  id: string;
  kind: ContactKind;
  displayName: string;
  taxId: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  roleInProject: ContactRole | null;
  isSigner: boolean;
  portalEnabled: boolean;
  emailStatus: string;
  privacyAcknowledgedAt: string | null;
  linkStatus: LinkStatus;
  lastAccessAt: string | null;
  version: number;
}

export interface TeamMember {
  assignmentId: string;
  membershipId: string;
  projectRole: ProjectRole;
  studioRole: StudioRole;
  name: string;
  email: string | null;
  professionalRegistration: string | null;
  since: string;
}

export interface Contractor {
  id: string;
  name: string;
  vatNumber: string | null;
  contactName: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  category: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  siteAddress: SiteAddress;
  geo: { lat: number; lng: number } | null;
  cadastral: Cadastral[];
  altitudeM: number | null;
  regulationProfileVersionId: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  closedAt: string | null;
  team: TeamMember[];
  contacts: Contact[];
  contractors: Contractor[];
}

export type ActivityKind = 'PUBLISH' | 'PIN' | 'APPROVAL' | 'VISIT' | 'DOCUMENT';

export interface ProjectDashboard {
  project: { id: string; code: string; title: string; status: ProjectStatus };
  approvals: { byStatus: Partial<Record<string, number>>; awaitingOverDays: number; overdueThresholdDays: number };
  pins: { awaitingStudio: number; awaitingClient: number; resolved: number; averageOpenAgeDays: number };
  rai: { counts: Partial<Record<string, number>>; rooms: number; deficitSqm: string; profile: string };
  field: { visits: number; lastVisitAt: string | null; drafts: number; openIssues: number };
  changeRequests: { open: number; extraScope: number };
  activity: { kind: ActivityKind; text: string; at: string; ref: string }[];
  clients: { id: string; name: string; lastAccessAt: string | null; linkStatus: LinkStatus; isSigner: boolean }[];
}

export interface StudioDashboard {
  totals: {
    activeProjects: number;
    awaitingApproval: number;
    overdueApprovals: number;
    pinsAwaitingStudio: number;
    reportsDraft: number;
    openIssues: number;
  };
  overdueThresholdDays: number;
  todo: { kind: 'PINS' | 'VISIT' | 'APPROVAL'; projectId: string; projectCode: string; refId: string; label: string; count: number; since: string }[];
  activity: { kind: ActivityKind; text: string; at: string; projectId: string; projectCode: string; ref: string }[];
}

export interface AccessLogEntry {
  firstSeenAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  active: boolean;
}

// ---- Input --------------------------------------------------------------------------------------

export interface ContactInput {
  kind: ContactKind;
  displayName: string;
  taxId?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  roleInProject?: ContactRole | null;
  isSigner?: boolean;
  portalEnabled?: boolean;
}

export interface ProjectFields {
  title: string;
  description?: string | null;
  interventionType: InterventionType;
  permitType?: PermitType | null;
  siteAddress: SiteAddress;
  municipality: string;
  startDate?: string | null;
  endDate?: string | null;
  cadastral?: Cadastral[];
  tags?: string[];
  /** Altitudine [m s.l.m.]: sopra la soglia del profilo si applicano le altezze montane (FR-M3-01). */
  altitudeM?: number | null;
  /** Profilo normativo della commessa per il calcolo R.A.I. (null = predefinito). */
  regulationProfileVersionId?: string | null;
}

export interface CreateProjectInput extends ProjectFields {
  code?: string;
  contacts: ContactInput[];
  sendInvites: boolean;
}

export type UpdateProjectInput = Partial<ProjectFields> & { code?: string; version: number };

export interface ContractorInput {
  name: string;
  vatNumber?: string | null;
  contactName?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  category?: string | null;
}

export interface ListQuery {
  status?: ProjectStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Commesse, committenti, team e imprese (AFU Modulo 1). */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly api = inject(Api);

  studioDashboard(): Promise<StudioDashboard> {
    return this.api.get('/studio/dashboard');
  }

  list(query: ListQuery = {}): Promise<Page<ProjectListItem>> {
    return this.api.get('/studio/projects', { ...query });
  }

  nextCode(): Promise<{ code: string }> {
    return this.api.get('/studio/projects/next-code');
  }

  create(input: CreateProjectInput): Promise<ProjectDetail & { invitesSent: number }> {
    return this.api.post('/studio/projects', input);
  }

  detail(id: string): Promise<ProjectDetail> {
    return this.api.get(`/studio/projects/${id}`);
  }

  dashboard(id: string): Promise<ProjectDashboard> {
    return this.api.get(`/studio/projects/${id}/dashboard`);
  }

  update(id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    return this.api.patch(`/studio/projects/${id}`, input);
  }

  transition(id: string, action: TransitionAction, revokeLinksNow = false): Promise<unknown> {
    return this.api.post(`/studio/projects/${id}/transition`, { action, revokeLinksNow });
  }

  // ---- Committenti e Magic Link (FR-M1-03/05/06) ----

  /** Con `send = false` il link non parte per email e l'API ne restituisce l'URL da copiare. */
  addContact(projectId: string, input: ContactInput, send = true): Promise<{ id: string; invitesSent: number; url: string | null }> {
    return this.api.post(`/studio/projects/${projectId}/contacts${send ? '' : '?send=false'}`, input);
  }

  updateContact(projectId: string, contactId: string, patch: Partial<ContactInput>): Promise<void> {
    return this.api.patch(`/studio/projects/${projectId}/contacts/${contactId}`, patch);
  }

  removeContact(projectId: string, contactId: string): Promise<void> {
    return this.api.delete(`/studio/projects/${projectId}/contacts/${contactId}`);
  }

  /** Revoca il link precedente e ne crea uno nuovo; con `send` lo invia anche per email. */
  regenerateLink(projectId: string, contactId: string, send: boolean): Promise<{ url: string; invitesSent: number }> {
    return this.api.post(`/studio/projects/${projectId}/contacts/${contactId}/link${send ? '' : '?send=false'}`);
  }

  revokeLink(projectId: string, contactId: string): Promise<{ revoked: number }> {
    return this.api.delete(`/studio/projects/${projectId}/contacts/${contactId}/link`);
  }

  accessLog(projectId: string, contactId: string): Promise<AccessLogEntry[]> {
    return this.api.get(`/studio/projects/${projectId}/contacts/${contactId}/accesses`);
  }

  // ---- Team e imprese (FR-M1-03, BR-17) ----

  assign(projectId: string, membershipId: string, projectRole: ProjectRole): Promise<void> {
    return this.api.post(`/studio/projects/${projectId}/team`, { membershipId, projectRole });
  }

  unassign(projectId: string, assignmentId: string): Promise<void> {
    return this.api.delete(`/studio/projects/${projectId}/team/${assignmentId}`);
  }

  contractors(q?: string): Promise<Contractor[]> {
    return this.api.get('/studio/contractors', { q });
  }

  createContractor(input: ContractorInput): Promise<{ id: string }> {
    return this.api.post('/studio/contractors', input);
  }

  linkContractor(projectId: string, contractorId: string): Promise<void> {
    return this.api.post(`/studio/projects/${projectId}/contractors/${contractorId}`);
  }

  unlinkContractor(projectId: string, contractorId: string): Promise<void> {
    return this.api.delete(`/studio/projects/${projectId}/contractors/${contractorId}`);
  }
}
