import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { toApiError, uploadToSignedUrl } from '../api/api';
import { FieldApi, type ReportSection } from '../api/field-api';
import { idbAll, idbDelete, idbPut } from './field-db';
import { FieldOps } from './field-ops';

const RETRY_MS = 30_000;
const MAX_PHOTO_SIDE = 2560;
const JPEG_QUALITY = 0.85;

export interface QueuedMedia {
  id: string;
  projectId: string;
  visitId: string;
  kind: 'photos' | 'audio';
  blob: Blob;
  takenAt: string;
  caption?: string | null;
  section?: ReportSection | null;
  durationSec?: number | null;
  attempts: number;
  /** Errore definitivo (file rifiutato dal server): resta visibile finché l'utente non lo scarta. */
  error?: string | null;
}

/** Foto che il dispositivo non riesce a leggere (es. HEIC fuori da Safari): va scelta in un altro formato. */
export class PhotoNotSupportedError extends Error {}

const HEIC_TYPES = ['image/heic', 'image/heif'];

/**
 * Ogni foto si ricodifica in JPEG (lato lungo al massimo 2560 px) prima di partire:
 * - PRIV-11 / NFR-PRIV-03: la ricodifica elimina tutti i metadati EXIF, compresi GPS e modello del
 *   telefono, che altrimenti finirebbero nei verbali PDF;
 * - FR-M4-05: le foto HEIC dell'iPhone diventano JPEG (Safari le decodifica), il formato accettato;
 * - l'orientamento è già applicato da `createImageBitmap`, quindi la foto resta dritta.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const isHeic = HEIC_TYPES.includes(file.type) || /\.hei[cf]$/i.test(file.name);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoNotSupportedError(isHeic
      ? `${file.name}: questo dispositivo non legge le foto HEIC. Sull'iPhone imposta Fotocamera › Formati › "Più compatibile", oppure scatta direttamente dall'app.`
      : `${file.name}: immagine non leggibile.`);
  }
  try {
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoNotSupportedError(`${file.name}: impossibile preparare la foto su questo dispositivo.`);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new PhotoNotSupportedError(`${file.name}: impossibile preparare la foto su questo dispositivo.`);
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Coda persistente di foto e note vocali del cantiere (AFU FR-M4-05/08, BR-23, EC-06): i file restano
 * sul dispositivo (IndexedDB) finché il server non conferma di averli ricevuti, anche se si chiude
 * l'app o manca la rete. Si riprova al ritorno della connessione e ogni 30 secondi.
 */
@Injectable({ providedIn: 'root' })
export class MediaQueue {
  private readonly api = inject(FieldApi);
  private readonly ops = inject(FieldOps);
  private readonly items = signal<QueuedMedia[]>([]);
  private running = false;
  /** Cresce a ogni file arrivato al server (la pagina ricarica il sopralluogo). */
  readonly uploaded = signal(0);

  readonly all = this.items.asReadonly();
  readonly pendingCount = computed(() => this.items().filter((i) => !i.error).length);

  constructor() {
    const onOnline = () => void this.process();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => void this.process(), RETRY_MS);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    });
    void this.restore();
  }

  forVisit(visitId: string) {
    return computed(() => this.items().filter((i) => i.visitId === visitId));
  }

  async enqueue(item: Omit<QueuedMedia, 'attempts'>): Promise<void> {
    const entry: QueuedMedia = { ...item, attempts: 0 };
    await this.put(entry);
    this.items.update((list) => [...list.filter((i) => i.id !== entry.id), entry]);
    void this.process();
  }

  /** Scarta un file che il server ha rifiutato (o che l'utente non vuole più inviare). */
  async discard(id: string): Promise<void> {
    await this.delete(id);
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  async retry(id: string): Promise<void> {
    const item = this.items().find((i) => i.id === id);
    if (!item) return;
    await this.save({ ...item, error: null, attempts: 0 });
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.running || !navigator.onLine) return;
    this.running = true;
    try {
      for (const item of this.items().filter((i) => !i.error)) {
        // Un sopralluogo creato offline deve arrivare al server prima delle sue foto.
        if (this.ops.isVisitPending(item.visitId)) continue;
        const done = await this.send(item);
        if (!done) break; // rete assente o errore temporaneo: si riprova più tardi, nell'ordine
      }
    } finally {
      this.running = false;
    }
  }

  /** true se l'elemento è concluso (inviato o rifiutato definitivamente). */
  private async send(item: QueuedMedia): Promise<boolean> {
    try {
      const start = await this.api.startMedia(item.projectId, item.visitId, item.kind, {
        id: item.id, takenAt: item.takenAt, caption: item.caption ?? null, section: item.section ?? null,
        ...(item.kind === 'audio' ? { durationSec: item.durationSec ?? null } : {}),
      });
      if (start.uploadStatus !== 'UPLOADED' && start.uploadUrl) {
        await uploadToSignedUrl(start.uploadUrl, item.blob, item.blob.type || (item.kind === 'photos' ? 'image/jpeg' : 'audio/webm'));
        await this.api.completeMedia(item.projectId, item.visitId, item.kind, item.id);
      }
      await this.discard(item.id);
      this.uploaded.update((n) => n + 1);
      return true;
    } catch (e) {
      const err = toApiError(e);
      const permanent = ['UNSUPPORTED_FILE', 'NOT_FOUND', 'FORBIDDEN', 'REPORT_FINALIZED', 'INVALID_TRANSITION'].includes(err.code);
      await this.save({ ...item, attempts: item.attempts + 1, error: permanent ? err.userMessage : null });
      return permanent;
    }
  }

  private async save(item: QueuedMedia): Promise<void> {
    await this.put(item);
    this.items.update((list) => list.map((i) => (i.id === item.id ? item : i)));
  }

  private async restore(): Promise<void> {
    try {
      this.items.set(await idbAll<QueuedMedia>('uploads'));
      void this.process();
    } catch {
      /* IndexedDB non disponibile (navigazione privata): la coda vive solo in memoria */
    }
  }

  private async put(item: QueuedMedia): Promise<void> {
    try {
      await idbPut('uploads', item);
    } catch {
      /* solo in memoria */
    }
  }

  private async delete(id: string): Promise<void> {
    try {
      await idbDelete('uploads', id);
    } catch {
      /* solo in memoria */
    }
  }
}
