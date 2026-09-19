import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { type ApiError, toApiError } from '../api/api';
import { type Attendee, FieldApi, type ItemInput, type ReportItem, type VisitDetail, type VisitPatch, type VisitType } from '../api/field-api';
import { idbAll, idbDelete, idbGet, idbPut } from './field-db';

const RETRY_MS = 30_000;
const LOCAL_PREFIX = 'local:';

interface OpBase {
  /** uuid dell'operazione: per le voci nuove è anche l'X-Client-Op-Id (idempotenza, BR-24). */
  id: string;
  projectId: string;
  visitId: string;
  createdAt: string;
  attempts: number;
  /** Errore definitivo (il server ha rifiutato l'operazione): resta visibile finché non si scarta. */
  error?: string | null;
}

export type FieldOp = OpBase & (
  | { kind: 'create-visit'; input: { id: string; visitType: VisitType; startedAt: string } }
  | { kind: 'update-visit'; patch: VisitPatch }
  | { kind: 'set-attendees'; attendees: Attendee[] }
  | { kind: 'add-item'; input: ItemInput }
  | { kind: 'update-item'; itemId: string; patch: Partial<ItemInput> }
  | { kind: 'remove-item'; itemId: string }
);

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewFieldOp = DistributiveOmit<FieldOp, 'id' | 'createdAt' | 'attempts' | 'error'>;

interface CacheEntry<T> {
  id: string;
  savedAt: string;
  data: T;
}

/** Errori per cui conviene riprovare più tardi (rete assente, server momentaneamente non disponibile). */
export function isRetryable(error: ApiError): boolean {
  return error.status === 0 || error.status >= 500 || error.code === 'RATE_LIMITED' || error.code === 'UNAUTHENTICATED';
}

export const isLocalItem = (id: string) => id.startsWith(LOCAL_PREFIX);

/**
 * Lavoro in cantiere senza rete (AFU FR-M4-14, BR-24, EC-06). Ogni modifica al sopralluogo passa da
 * qui: si prova subito e, se la rete manca, resta sul dispositivo (IndexedDB) e parte da sola al
 * ritorno della connessione, nell'ordine in cui è stata fatta. Le modifiche a una voce non ancora
 * inviata si fondono nella voce stessa, così non servono corrispondenze tra id locali e del server.
 * Il server riconosce voci e sopralluoghi già ricevuti (X-Client-Op-Id, id del client) e non crea doppioni.
 */
@Injectable({ providedIn: 'root' })
export class FieldOps {
  private readonly api = inject(FieldApi);
  private readonly ops = signal<FieldOp[]>([]);
  private running = false;
  private readonly restored: Promise<void>;

  readonly all = this.ops.asReadonly();
  readonly pendingCount = computed(() => this.ops().filter((o) => !o.error).length);
  /** Cresce a ogni operazione arrivata al server (le pagine ricaricano i dati). */
  readonly synced = signal(0);

  constructor() {
    const onOnline = () => void this.process();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => void this.process(), RETRY_MS);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    });
    this.restored = this.restore();
  }

  forVisit(visitId: string) {
    return computed(() => this.ops().filter((o) => o.visitId === visitId));
  }

  /** Il sopralluogo è stato creato offline e il server non lo conosce ancora. */
  isVisitPending(visitId: string): boolean {
    return this.ops().some((o) => o.kind === 'create-visit' && o.visitId === visitId);
  }

  /** FR-M4-03: nuovo sopralluogo; senza rete nasce sul telefono e il numero arriva alla sincronizzazione (BR-16). */
  async startVisit(projectId: string): Promise<{ id: string; number: number | null }> {
    const input = { id: crypto.randomUUID(), visitType: 'ORDINARY' as VisitType, startedAt: new Date().toISOString() };
    try {
      return await this.api.create(projectId, input);
    } catch (e) {
      const err = toApiError(e);
      if (!isRetryable(err)) throw err;
      await this.cache(`visit:${input.id}`, emptyVisit(input.id, input.visitType, input.startedAt));
      await this.enqueue({ kind: 'create-visit', projectId, visitId: input.id, input });
      return { id: input.id, number: null };
    }
  }

  async enqueue(op: NewFieldOp): Promise<void> {
    await this.restored;
    const entry = { ...op, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 } as FieldOp;
    if (!(await this.coalesce(entry))) {
      await this.persist(entry);
      this.ops.update((list) => [...list, entry]);
    }
    void this.process();
  }

  async discard(id: string): Promise<void> {
    await this.remove(id);
  }

  async retry(id: string): Promise<void> {
    const op = this.ops().find((o) => o.id === id);
    if (!op) return;
    await this.save({ ...op, error: null, attempts: 0 });
    void this.process();
  }

  /** Sovrappone le modifiche in coda ai dati del server (o della copia locale). */
  apply(detail: VisitDetail): VisitDetail {
    let next: VisitDetail = { ...detail };
    for (const op of this.ops().filter((o) => o.visitId === detail.id)) {
      switch (op.kind) {
        case 'update-visit': next = { ...next, ...op.patch }; break;
        case 'set-attendees': next = { ...next, attendees: op.attendees }; break;
        case 'add-item': next = { ...next, items: [...next.items, localItem(op.id, op.input)] }; break;
        case 'update-item':
          next = { ...next, items: next.items.map((it) => (it.id === op.itemId ? { ...it, ...op.patch, pending: true } as ReportItem : it)) };
          break;
        case 'remove-item': next = { ...next, items: next.items.filter((it) => it.id !== op.itemId) }; break;
        case 'create-visit': break;
      }
    }
    return next;
  }

  // ---- Copia locale dei dati per aprire le pagine senza rete ----------------------------------

  async cache<T>(key: string, data: T): Promise<void> {
    try {
      await idbPut<CacheEntry<T>>('visits', { id: key, savedAt: new Date().toISOString(), data });
    } catch {
      /* archivio locale non disponibile */
    }
  }

  async cached<T>(key: string): Promise<{ data: T; savedAt: string } | null> {
    try {
      const entry = await idbGet<CacheEntry<T>>('visits', key);
      return entry ? { data: entry.data, savedAt: entry.savedAt } : null;
    } catch {
      return null;
    }
  }

  /**
   * Carica dal server e salva una copia; se la rete manca (o il sopralluogo è nato offline e non è
   * ancora arrivato al server) restituisce l'ultima copia salvata sul dispositivo.
   */
  async load<T>(key: string, fetch: () => Promise<T>, allowNotFound = false): Promise<{ data: T; offlineSince: string | null }> {
    try {
      const data = await fetch();
      void this.cache(key, data);
      return { data, offlineSince: null };
    } catch (e) {
      const err = toApiError(e);
      if (isRetryable(err) || (allowNotFound && err.code === 'NOT_FOUND')) {
        const copy = await this.cached<T>(key);
        if (copy) return { data: copy.data, offlineSince: copy.savedAt };
      }
      throw err;
    }
  }

  // ---- Coda --------------------------------------------------------------------------------------

  /** Fonde l'operazione con una già in coda; true se non serve aggiungerla. */
  private async coalesce(op: FieldOp): Promise<boolean> {
    const pending = this.ops().filter((o) => o.visitId === op.visitId && !o.error);
    if ((op.kind === 'update-item' || op.kind === 'remove-item') && isLocalItem(op.itemId)) {
      const add = pending.find((o) => o.kind === 'add-item' && o.id === op.itemId.slice(LOCAL_PREFIX.length));
      if (!add || add.kind !== 'add-item') return true; // voce locale già scartata
      if (op.kind === 'remove-item') await this.remove(add.id);
      else await this.save({ ...add, input: { ...add.input, ...op.patch } });
      return true;
    }
    if (op.kind === 'update-item') {
      const same = pending.find((o) => o.kind === 'update-item' && o.itemId === op.itemId);
      if (same && same.kind === 'update-item') {
        await this.save({ ...same, patch: { ...same.patch, ...op.patch } });
        return true;
      }
    }
    if (op.kind === 'remove-item') {
      for (const o of pending) if (o.kind === 'update-item' && o.itemId === op.itemId) await this.remove(o.id);
    }
    if (op.kind === 'update-visit') {
      const same = pending.find((o) => o.kind === 'update-visit');
      if (same && same.kind === 'update-visit') {
        await this.save({ ...same, patch: { ...same.patch, ...op.patch } });
        return true;
      }
    }
    if (op.kind === 'set-attendees') {
      const same = pending.find((o) => o.kind === 'set-attendees');
      if (same && same.kind === 'set-attendees') {
        await this.save({ ...same, attendees: op.attendees });
        return true;
      }
    }
    return false;
  }

  private async process(): Promise<void> {
    if (this.running || !navigator.onLine) return;
    this.running = true;
    try {
      await this.restored;
      for (const op of this.ops().filter((o) => !o.error)) {
        // Le operazioni di un sopralluogo creato offline aspettano la sua creazione sul server.
        if (op.kind !== 'create-visit' && this.isVisitPending(op.visitId)) continue;
        const outcome = await this.send(op);
        if (outcome === 'retry') break; // rete assente: si riprova più tardi, nello stesso ordine
      }
    } finally {
      this.running = false;
    }
  }

  private async send(op: FieldOp): Promise<'done' | 'retry' | 'failed'> {
    try {
      switch (op.kind) {
        case 'create-visit': await this.api.create(op.projectId, op.input); break;
        case 'update-visit': await this.api.update(op.projectId, op.visitId, op.patch); break;
        case 'set-attendees': await this.api.setAttendees(op.projectId, op.visitId, op.attendees); break;
        case 'add-item': await this.api.addItem(op.projectId, op.visitId, op.input, op.id); break;
        case 'update-item': await this.api.updateItem(op.projectId, op.visitId, op.itemId, op.patch); break;
        case 'remove-item': await this.api.removeItem(op.projectId, op.visitId, op.itemId); break;
      }
    } catch (e) {
      const err = toApiError(e);
      const alreadyGone = op.kind === 'remove-item' && err.code === 'NOT_FOUND';
      if (!alreadyGone) {
        if (isRetryable(err)) {
          await this.save({ ...op, attempts: op.attempts + 1 });
          return 'retry';
        }
        await this.save({ ...op, attempts: op.attempts + 1, error: err.userMessage });
        return 'failed';
      }
    }
    await this.remove(op.id);
    this.synced.update((n) => n + 1);
    return 'done';
  }

  private async restore(): Promise<void> {
    try {
      const all = await idbAll<FieldOp>('ops');
      this.ops.set(all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch {
      /* archivio locale non disponibile: la coda vive in memoria */
    }
  }

  private async save(op: FieldOp): Promise<void> {
    await this.persist(op);
    this.ops.update((list) => list.map((o) => (o.id === op.id ? op : o)));
  }

  private async remove(id: string): Promise<void> {
    try {
      await idbDelete('ops', id);
    } catch {
      /* solo in memoria */
    }
    this.ops.update((list) => list.filter((o) => o.id !== id));
  }

  private async persist(op: FieldOp): Promise<void> {
    try {
      await idbPut('ops', op);
    } catch {
      /* solo in memoria */
    }
  }
}

function localItem(opId: string, input: ItemInput): ReportItem {
  return {
    id: `${LOCAL_PREFIX}${opId}`, section: input.section, text: input.text, severity: input.severity ?? null, addressee: input.addressee ?? null,
    dueDate: input.dueDate ?? null, needsVerification: input.needsVerification ?? false, origin: input.origin ?? 'HUMAN',
    photoRefs: [], sortOrder: input.sortOrder ?? 0, version: 0, pending: true,
  };
}

/** Sopralluogo appena creato senza rete: vuoto, numero in attesa del server. */
function emptyVisit(id: string, visitType: VisitType, startedAt: string): VisitDetail {
  return {
    id, number: 0, visitType, status: 'DRAFT', startedAt, endedAt: null, weather: null, phase: null, generalNotes: null,
    sharedWithClient: false, finalizedAt: null, cancelReason: null, attendees: [], photos: [], audio: [], items: [], openActionsToVerify: [],
  };
}
