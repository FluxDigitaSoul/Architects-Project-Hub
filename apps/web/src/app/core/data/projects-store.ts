import { Injectable, computed, inject, signal } from '@angular/core';
import type { Outcome } from '@aph/rai-engine';
import type { Activity, ClientContact, Drawing, Project, SiteVisit } from '../models';
import { ACTIVITIES, DRAWINGS, PROJECTS, VISITS } from './mock-data';
import { RaiStore } from './rai-store';
import { ReviewStore } from './review-store';

export interface ProjectStats {
  drawingsPending: number;
  pinsOpen: number;
  visits: number;
  reportsDraft: number;
  raiOutcome: Outcome | 'NONE';
}

export interface NewProjectInput {
  code: string;
  title: string;
  address: string;
  municipality: string;
  interventionType: string;
  clientName: string;
  clientEmail: string;
}

const DEMO_IMAGE = '/demo/pianta.svg';

const SEED_CONTACTS: ClientContact[] = [
  { id: 'cc1', projectId: 'p1', name: 'Marco Colombo', email: 'marco.colombo@example.com', isSigner: true, token: 'demo-colombo' },
  { id: 'cc2', projectId: 'p1', name: 'Giulia Colombo', email: 'giulia.colombo@example.com', isSigner: false, token: 'demo-giulia' },
  { id: 'cc3', projectId: 'p2', name: 'Anna Bianchi', email: 'anna.bianchi@example.com', isSigner: true, token: 'demo-bianchi' },
  { id: 'cc4', projectId: 'p3', name: 'Avv. Paola Riva', email: 'p.riva@example.com', isSigner: true, token: 'demo-riva' },
];

let seq = 500;
const nextId = (prefix: string): string => `${prefix}${++seq}`;

/** Token casuale a 256 bit in base64url (FR-M1-05). */
export function newAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Dati delle commesse. Oggi in memoria; domani un adapter HTTP verso /api/v1/studio. */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  private readonly rai = inject(RaiStore);
  private readonly review = inject(ReviewStore);

  readonly projects = signal<Project[]>(PROJECTS);
  private readonly baseDrawings = signal<Drawing[]>(DRAWINGS.map((d) => ({ ...d, imageUrl: DEMO_IMAGE })));
  readonly visits = signal<SiteVisit[]>(VISITS);
  readonly activities = signal<Activity[]>(ACTIVITIES);
  readonly contacts = signal<ClientContact[]>(SEED_CONTACTS);

  /** Tavole con conteggi dei pin e stato di approvazione presi dallo store della revisione. */
  readonly drawings = computed<Drawing[]>(() => {
    const counts = this.review.counts();
    const approved = this.review.approvedIds();
    return this.baseDrawings().map((d) => ({
      ...d,
      pinsOpen: counts[d.id]?.open ?? 0,
      pinsTotal: counts[d.id]?.total ?? 0,
      status: approved.has(d.id) ? 'APPROVED' : d.status,
    }));
  });

  readonly active = computed(() => this.projects().filter((p) => p.status === 'ACTIVE'));

  readonly totals = computed(() => ({
    active: this.active().length,
    pendingApprovals: this.drawings().filter((d) => d.status === 'PUBLISHED').length,
    pinsOpen: this.drawings().reduce((n, d) => n + d.pinsOpen, 0),
    reportsDraft: this.visits().filter((v) => v.status === 'DRAFT' || v.status === 'REVIEW').length,
  }));

  /** Prossimo codice secondo il pattern {YYYY}-{NNN} (FR-M0-11). */
  readonly nextCode = computed(() => {
    const year = new Date().getFullYear();
    const max = this.projects()
      .map((p) => /^(\d{4})-(\d{3})$/.exec(p.code))
      .filter((m): m is RegExpExecArray => m !== null && Number(m[1]) === year)
      .reduce((n, m) => Math.max(n, Number(m[2])), 0);
    return `${year}-${String(max + 1).padStart(3, '0')}`;
  });

  byId(id: string) {
    return computed(() => this.projects().find((p) => p.id === id) ?? null);
  }

  drawingsOf(projectId: string) {
    return computed(() => this.drawings().filter((d) => d.projectId === projectId));
  }

  drawingById(id: string) {
    return computed(() => this.drawings().find((d) => d.id === id) ?? null);
  }

  visitsOf(projectId: string) {
    return computed(() =>
      this.visits()
        .filter((v) => v.projectId === projectId)
        .sort((a, b) => b.number - a.number),
    );
  }

  contactsOf(projectId: string) {
    return computed(() => this.contacts().filter((c) => c.projectId === projectId));
  }

  contactByToken(token: string): ClientContact | null {
    return this.contacts().find((c) => c.token === token) ?? null;
  }

  stats(projectId: string) {
    const evaluation = this.rai.evaluation(projectId);
    return computed<ProjectStats>(() => {
      const drawings = this.drawings().filter((d) => d.projectId === projectId);
      const visits = this.visits().filter((v) => v.projectId === projectId);
      const result = evaluation();
      return {
        drawingsPending: drawings.filter((d) => d.status === 'PUBLISHED').length,
        pinsOpen: drawings.reduce((n, d) => n + d.pinsOpen, 0),
        visits: visits.length,
        reportsDraft: visits.filter((v) => v.status !== 'SENT' && v.status !== 'FINAL').length,
        raiOutcome: result.rooms.length === 0 ? 'NONE' : result.outcome,
      };
    });
  }

  codeOf(id: string): string {
    return this.projects().find((p) => p.id === id)?.code ?? '';
  }

  isCodeTaken(code: string): boolean {
    const c = code.trim().toLowerCase();
    return this.projects().some((p) => p.code.toLowerCase() === c);
  }

  /** FR-M1-01 + FR-M1-05: crea la commessa e il primo contatto committente con Magic Link. */
  create(input: NewProjectInput): Project {
    const project: Project = {
      id: nextId('p'),
      code: input.code.trim(),
      title: input.title.trim(),
      address: input.address.trim(),
      municipality: input.municipality.trim(),
      clientName: input.clientName.trim(),
      status: 'ACTIVE',
      interventionType: input.interventionType,
      updatedAt: new Date().toISOString(),
    };
    this.projects.update((all) => [project, ...all]);
    this.contacts.update((all) => [
      ...all,
      {
        id: nextId('cc'),
        projectId: project.id,
        name: input.clientName.trim(),
        email: input.clientEmail.trim(),
        isSigner: true,
        token: newAccessToken(),
      },
    ]);
    this.log(project.id, 'PUBLISH', `Creata la commessa ${project.code}`);
    return project;
  }

  /** FR-M1-06: revoca il token e ne genera uno nuovo. */
  regenerateToken(contactId: string): ClientContact | null {
    let updated: ClientContact | null = null;
    this.contacts.update((all) =>
      all.map((c) => {
        if (c.id !== contactId) return c;
        updated = { ...c, token: newAccessToken() };
        return updated;
      }),
    );
    return updated;
  }

  addVisit(projectId: string): SiteVisit {
    const number = this.visits().filter((v) => v.projectId === projectId).reduce((n, v) => Math.max(n, v.number), 0) + 1;
    const visit: SiteVisit = {
      id: nextId('v'),
      projectId,
      number,
      date: new Date().toISOString(),
      status: 'DRAFT',
      photos: 0,
      issuesOpen: 0,
    };
    this.visits.update((all) => [visit, ...all]);
    return visit;
  }

  updateVisit(id: string, patch: Partial<SiteVisit>): void {
    this.visits.update((all) => all.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  log(projectId: string, kind: Activity['kind'], text: string): void {
    this.activities.update((all) => [{ id: nextId('a'), projectId, kind, text, at: new Date().toISOString() }, ...all]);
  }
}
