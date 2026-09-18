import { Injectable, computed, signal } from '@angular/core';
import type { Actor, Approval, Pin, PinComment } from '../models';

const ago = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

let seq = 1000;
const nextId = (prefix: string): string => `${prefix}${++seq}`;

const SEED_PINS: Pin[] = [
  {
    id: 'pin1', drawingId: 'd1', number: 1, x: 27.4, y: 38.2, status: 'OPEN', actor: 'CLIENT',
    comments: [
      { id: 'c1', author: 'Marco Colombo', actor: 'CLIENT', text: 'Possiamo spostare la porta del bagno di 30 cm verso il corridoio? Così entra il mobile lavabo.', at: ago(20) },
    ],
  },
  {
    id: 'pin2', drawingId: 'd1', number: 2, x: 63.1, y: 61.5, status: 'WAITING', actor: 'CLIENT',
    comments: [
      { id: 'c2', author: 'Marco Colombo', actor: 'CLIENT', text: 'La finestra della camera resta uguale o la allarghiamo?', at: ago(30) },
      { id: 'c3', author: 'Studio', actor: 'STUDIO', text: 'Resta uguale: il rapporto aeroilluminante è già verificato (+0,35 mq). Se volete più luce possiamo valutare una portafinestra.', at: ago(26) },
    ],
  },
  {
    id: 'pin3', drawingId: 'd1', number: 3, x: 46.0, y: 24.8, status: 'RESOLVED', actor: 'CLIENT',
    comments: [
      { id: 'c4', author: 'Marco Colombo', actor: 'CLIENT', text: 'La cucina è aperta sul soggiorno?', at: ago(72) },
      { id: 'c5', author: 'Studio', actor: 'STUDIO', text: 'Sì, con un’isola centrale. Vedi il render R-01.', at: ago(70) },
    ],
  },
  {
    id: 'pin4', drawingId: 'd4', number: 1, x: 35, y: 45, status: 'OPEN', actor: 'CLIENT',
    comments: [{ id: 'c6', author: 'Anna Bianchi', actor: 'CLIENT', text: 'Qui vorrei un armadio a muro.', at: ago(40) }],
  },
  {
    id: 'pin5', drawingId: 'd4', number: 2, x: 58, y: 30, status: 'OPEN', actor: 'CLIENT',
    comments: [{ id: 'c7', author: 'Anna Bianchi', actor: 'CLIENT', text: 'Il lucernario si può motorizzare?', at: ago(39) }],
  },
  {
    id: 'pin6', drawingId: 'd4', number: 3, x: 72, y: 66, status: 'OPEN', actor: 'CLIENT',
    comments: [{ id: 'c8', author: 'Anna Bianchi', actor: 'CLIENT', text: 'Altezza minima in questo punto?', at: ago(38) }],
  },
];

const SEED_APPROVALS: Record<string, Approval> = {
  d2: { drawingId: 'd2', version: 2, signer: 'Marco Colombo', at: ago(120), fileHash: 'a3f9c2…e81b', verificationCode: 'APR-7K2Q', openPinsAtApproval: 0 },
  d6: { drawingId: 'd6', version: 4, signer: 'Avv. Paola Riva', at: ago(75), fileHash: '5d10e7…c4a0', verificationCode: 'APR-3M9X', openPinsAtApproval: 0 },
};

/** Esito delle azioni: le regole si applicano qui, come farà il backend (BR-01, BR-10, BR-11). */
export type ReviewResult<T = void> = { ok: true; value: T } | { ok: false; code: 'VERSION_FROZEN' | 'NOT_FOUND' | 'EMPTY_TEXT' };

/** Pin, thread e approvazioni delle tavole (AFU M2). In memoria finché non ci sono le API. */
@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly pins = signal<Pin[]>(SEED_PINS);
  private readonly approvals = signal<Record<string, Approval>>(SEED_APPROVALS);

  pinsOf(drawingId: string) {
    return computed(() => this.pins().filter((p) => p.drawingId === drawingId));
  }

  approvalOf(drawingId: string) {
    return computed<Approval | null>(() => this.approvals()[drawingId] ?? null);
  }

  /** Conteggi usati da dashboard ed elenchi. */
  readonly counts = computed(() => {
    const map: Record<string, { open: number; total: number }> = {};
    for (const p of this.pins()) {
      const c = (map[p.drawingId] ??= { open: 0, total: 0 });
      c.total += 1;
      if (p.status !== 'RESOLVED') c.open += 1;
    }
    return map;
  });

  readonly approvedIds = computed(() => new Set(Object.keys(this.approvals())));

  isFrozen(drawingId: string): boolean {
    return drawingId in this.approvals();
  }

  addPin(drawingId: string, x: number, y: number, text: string, actor: Actor, author: string): ReviewResult<Pin> {
    if (this.isFrozen(drawingId)) return { ok: false, code: 'VERSION_FROZEN' };
    if (!text.trim()) return { ok: false, code: 'EMPTY_TEXT' };
    const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v * 10_000) / 10_000));
    const number = this.pins().filter((p) => p.drawingId === drawingId).reduce((m, p) => Math.max(m, p.number), 0) + 1;
    const pin: Pin = {
      id: nextId('pin'),
      drawingId,
      number,
      x: clamp(x),
      y: clamp(y),
      status: 'OPEN',
      actor,
      comments: [this.comment(text, actor, author)],
    };
    this.pins.update((all) => [...all, pin]);
    return { ok: true, value: pin };
  }

  reply(pinId: string, text: string, actor: Actor, author: string): ReviewResult {
    const pin = this.pins().find((p) => p.id === pinId);
    if (!pin) return { ok: false, code: 'NOT_FOUND' };
    if (this.isFrozen(pin.drawingId)) return { ok: false, code: 'VERSION_FROZEN' };
    if (!text.trim()) return { ok: false, code: 'EMPTY_TEXT' };
    const status = pin.status === 'RESOLVED' ? 'RESOLVED' : actor === 'STUDIO' ? 'WAITING' : 'OPEN';
    this.patch(pinId, { status, comments: [...pin.comments, this.comment(text, actor, author)] });
    return { ok: true, value: undefined };
  }

  resolve(pinId: string): ReviewResult {
    const pin = this.pins().find((p) => p.id === pinId);
    if (!pin) return { ok: false, code: 'NOT_FOUND' };
    if (this.isFrozen(pin.drawingId)) return { ok: false, code: 'VERSION_FROZEN' };
    this.patch(pinId, { status: 'RESOLVED' });
    return { ok: true, value: undefined };
  }

  /** BR-11: riaprire richiede un commento. */
  reopen(pinId: string, text: string, actor: Actor, author: string): ReviewResult {
    const pin = this.pins().find((p) => p.id === pinId);
    if (!pin) return { ok: false, code: 'NOT_FOUND' };
    if (this.isFrozen(pin.drawingId)) return { ok: false, code: 'VERSION_FROZEN' };
    if (!text.trim()) return { ok: false, code: 'EMPTY_TEXT' };
    this.patch(pinId, { status: 'OPEN', comments: [...pin.comments, this.comment(text, actor, author)] });
    return { ok: true, value: undefined };
  }

  /** FR-M2-15: approvazione formale; congela la versione (BR-01). */
  approve(drawingId: string, version: number, signer: string): ReviewResult<Approval> {
    if (this.isFrozen(drawingId)) return { ok: false, code: 'VERSION_FROZEN' };
    const openPins = this.pins().filter((p) => p.drawingId === drawingId && p.status !== 'RESOLVED').length;
    const approval: Approval = {
      drawingId,
      version,
      signer,
      at: new Date().toISOString(),
      fileHash: randomHex(6) + '…' + randomHex(2),
      verificationCode: 'APR-' + randomHex(2).toUpperCase(),
      openPinsAtApproval: openPins,
    };
    this.approvals.update((a) => ({ ...a, [drawingId]: approval }));
    return { ok: true, value: approval };
  }

  private comment(text: string, actor: Actor, author: string): PinComment {
    return { id: nextId('c'), author, actor, text: text.trim(), at: new Date().toISOString() };
  }

  private patch(pinId: string, patch: Partial<Pin>): void {
    this.pins.update((all) => all.map((p) => (p.id === pinId ? { ...p, ...patch } : p)));
  }
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
