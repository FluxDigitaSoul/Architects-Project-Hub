import { Injectable, computed, inject, signal } from '@angular/core';
import type { ReportItem, ReportSection, VisitDetail } from '../models';
import { ProjectsStore } from './projects-store';

let seq = 2000;
const nextId = (prefix: string): string => `${prefix}${++seq}`;

/**
 * Bozza AI simulata. In produzione: trascrizione (ASR) + strutturazione LLM lato server
 * (AFU FR-M4-09/10). Il testo è quello del criterio AC-FR-M4-10-1.
 */
const AI_SAMPLE: Omit<ReportItem, 'id'>[] = [
  { section: 'PROGRESS', text: 'Completato il massetto al primo piano.', needsVerification: false, origin: 'AI' },
  { section: 'PROGRESS', text: 'In corso la posa dei controtelai delle finestre sul fronte strada.', needsVerification: false, origin: 'AI' },
  { section: 'ISSUES', text: 'Nel bagno lo scarico risulta spostato di 20 cm rispetto al progetto.', needsVerification: false, origin: 'AI' },
  { section: 'ORDERS', text: 'Si dispone all’impresa di ripristinare la posizione dello scarico del bagno come da progetto entro [DA VERIFICARE: "venerdì" — indicare la data].', needsVerification: true, origin: 'AI' },
];

const emptyDetail = (visitId: string): VisitDetail => ({
  visitId,
  attendees: ['Direttore dei Lavori'],
  weather: 'Sereno',
  photos: [],
  audio: [],
  items: [],
  aiState: 'IDLE',
});

/** Dettaglio dei sopralluoghi (AFU M4). Foto e audio restano sul dispositivo finché non c'è il backend. */
@Injectable({ providedIn: 'root' })
export class FieldStore {
  private readonly projects = inject(ProjectsStore);
  private readonly details = signal<Record<string, VisitDetail>>({
    v1: {
      ...emptyDetail('v1'),
      attendees: ['Direttore dei Lavori', 'Capocantiere — Edil Srl'],
      items: AI_SAMPLE.map((i) => ({ ...i, id: nextId('it') })),
      aiState: 'DONE',
    },
  });

  detail(visitId: string) {
    return computed<VisitDetail>(() => this.details()[visitId] ?? emptyDetail(visitId));
  }

  /** BR-05 + BR-23: niente voci da verificare, almeno una voce e il DL tra i presenti. */
  blockers(visitId: string) {
    return computed<string[]>(() => {
      const d = this.details()[visitId] ?? emptyDetail(visitId);
      const out: string[] = [];
      if (d.items.length === 0) out.push('Aggiungi almeno una voce al verbale.');
      const pending = d.items.filter((i) => i.needsVerification).length;
      if (pending) out.push(`${pending} ${pending === 1 ? 'voce da verificare' : 'voci da verificare'} (segnate dall’AI).`);
      if (!d.attendees.some((a) => a.startsWith('Direttore dei Lavori'))) out.push('Il Direttore dei Lavori deve risultare tra i presenti.');
      return out;
    });
  }

  start(projectId: string): string {
    const visit = this.projects.addVisit(projectId);
    this.details.update((all) => ({ ...all, [visit.id]: emptyDetail(visit.id) }));
    return visit.id;
  }

  setWeather(visitId: string, weather: string): void {
    this.patch(visitId, () => ({ weather }));
  }

  addAttendee(visitId: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    this.patch(visitId, (d) => ({ attendees: d.attendees.includes(n) ? d.attendees : [...d.attendees, n] }));
  }

  removeAttendee(visitId: string, name: string): void {
    this.patch(visitId, (d) => ({ attendees: d.attendees.filter((a) => a !== name) }));
  }

  addPhotos(visitId: string, files: readonly File[]): void {
    const photos = files
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ id: nextId('ph'), url: URL.createObjectURL(f), caption: '', takenAt: new Date(f.lastModified).toISOString() }));
    this.patch(visitId, (d) => ({ photos: [...d.photos, ...photos] }));
  }

  setCaption(visitId: string, photoId: string, caption: string): void {
    this.patch(visitId, (d) => ({ photos: d.photos.map((p) => (p.id === photoId ? { ...p, caption } : p)) }));
  }

  removePhoto(visitId: string, photoId: string): void {
    this.patch(visitId, (d) => ({ photos: d.photos.filter((p) => p.id !== photoId) }));
  }

  addAudio(visitId: string, blob: Blob, durationSec: number): void {
    const note = { id: nextId('au'), url: URL.createObjectURL(blob), durationSec, recordedAt: new Date().toISOString() };
    this.patch(visitId, (d) => ({ audio: [...d.audio, note] }));
  }

  removeAudio(visitId: string, audioId: string): void {
    this.patch(visitId, (d) => ({ audio: d.audio.filter((a) => a.id !== audioId) }));
  }

  /** Simula trascrizione e strutturazione (FR-M4-09/10). */
  runAi(visitId: string): Promise<void> {
    this.patch(visitId, () => ({ aiState: 'RUNNING' }));
    this.projects.updateVisit(visitId, { status: 'DRAFT' });
    return new Promise((resolve) =>
      setTimeout(() => {
        this.patch(visitId, (d) => ({
          aiState: 'DONE',
          items: [...d.items, ...AI_SAMPLE.map((i) => ({ ...i, id: nextId('it') }))],
        }));
        this.projects.updateVisit(visitId, { status: 'REVIEW' });
        resolve();
      }, 1600),
    );
  }

  addItem(visitId: string, section: ReportSection): string {
    const id = nextId('it');
    this.patch(visitId, (d) => ({ items: [...d.items, { id, section, text: '', needsVerification: false, origin: 'HUMAN' }] }));
    return id;
  }

  /** Modificare una voce AI la conferma: il DL se ne assume la responsabilità (BR-05). */
  updateItem(visitId: string, itemId: string, text: string): void {
    this.patch(visitId, (d) => ({
      items: d.items.map((i) =>
        i.id === itemId
          ? { ...i, text, needsVerification: text.includes('[DA VERIFICARE'), origin: i.origin === 'HUMAN' ? 'HUMAN' : 'AI_EDITED' }
          : i,
      ),
    }));
  }

  moveItem(visitId: string, itemId: string, section: ReportSection): void {
    this.patch(visitId, (d) => ({ items: d.items.map((i) => (i.id === itemId ? { ...i, section } : i)) }));
  }

  removeItem(visitId: string, itemId: string): void {
    this.patch(visitId, (d) => ({ items: d.items.filter((i) => i.id !== itemId) }));
  }

  /** FR-M4-13: il verbale diventa immutabile (BR-09). */
  finalize(visitId: string): boolean {
    if (this.blockers(visitId)().length > 0) return false;
    const d = this.details()[visitId] ?? emptyDetail(visitId);
    const visit = this.projects.visits().find((v) => v.id === visitId);
    this.projects.updateVisit(visitId, {
      status: 'FINAL',
      photos: d.photos.length,
      issuesOpen: d.items.filter((i) => i.section === 'ISSUES').length,
    });
    if (visit) this.projects.log(visit.projectId, 'VISIT', `Finalizzato il verbale di sopralluogo n. ${visit.number}`);
    return true;
  }

  private patch(visitId: string, fn: (d: VisitDetail) => Partial<VisitDetail>): void {
    this.details.update((all) => {
      const current = all[visitId] ?? emptyDetail(visitId);
      return { ...all, [visitId]: { ...current, ...fn(current) } };
    });
  }
}
