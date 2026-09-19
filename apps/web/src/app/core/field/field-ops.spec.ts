import { TestBed } from '@angular/core/testing';
import { ApiError } from '../api/api';
import { FieldApi, type VisitDetail } from '../api/field-api';
import { FieldOps } from './field-ops';

const P = 'project-1';
const V = 'visit-1';
const network = () => new ApiError(0, 'NETWORK', 'Connessione non disponibile.', null, undefined);
const flush = () => new Promise((r) => setTimeout(r, 0));

function visit(): VisitDetail {
  return {
    id: V, number: 3, visitType: 'ORDINARY', status: 'DRAFT', startedAt: '2026-09-19T08:00:00Z', endedAt: null, weather: null,
    phase: null, generalNotes: null, sharedWithClient: false, finalizedAt: null, cancelReason: null, attendees: [], photos: [], audio: [],
    openActionsToVerify: [],
    items: [{ id: 'srv-1', section: 'PROGRESS', text: 'Massetti', severity: null, addressee: null, dueDate: null, needsVerification: false,
      origin: 'HUMAN', photoRefs: [], sortOrder: 0, version: 1 }],
  };
}

/** Coda offline del cantiere (AFU FR-M4-14, BR-24). */
describe('FieldOps', () => {
  let online = false;
  const calls: string[] = [];
  const api = {
    create: async () => { calls.push('create'); if (!online) throw network(); return { id: V, number: 4 }; },
    update: async () => { calls.push('update'); if (!online) throw network(); },
    setAttendees: async () => { calls.push('attendees'); if (!online) throw network(); },
    addItem: async (_p: string, _v: string, input: { text: string }) => { calls.push(`add:${input.text}`); if (!online) throw network(); return { id: 'srv-2' }; },
    updateItem: async () => { calls.push('updateItem'); if (!online) throw network(); },
    removeItem: async () => { calls.push('removeItem'); if (!online) throw network(); throw new ApiError(404, 'NOT_FOUND', 'Voce non trovata.', null, undefined); },
  };
  let ops: FieldOps;

  beforeEach(() => {
    online = false;
    calls.length = 0;
    TestBed.configureTestingModule({ providers: [{ provide: FieldApi, useValue: api }] });
    ops = TestBed.inject(FieldOps);
  });

  it('senza rete tiene le modifiche e le mostra subito sopra i dati del server', async () => {
    await ops.enqueue({ kind: 'add-item', projectId: P, visitId: V, input: { section: 'ISSUES', text: 'Davanzale a 95 cm' } });
    await ops.enqueue({ kind: 'update-item', projectId: P, visitId: V, itemId: 'srv-1', patch: { text: 'Massetti completati' } });
    await ops.enqueue({ kind: 'update-visit', projectId: P, visitId: V, patch: { phase: 'Impianti' } });

    const view = ops.apply(visit());
    expect(view.phase).toBe('Impianti');
    expect(view.items.map((i) => [i.text, i.pending ?? false])).toEqual([['Massetti completati', true], ['Davanzale a 95 cm', true]]);
    expect(ops.pendingCount()).toBe(3);
  });

  it('fonde le modifiche a una voce non ancora inviata e la scarta se viene eliminata', async () => {
    await ops.enqueue({ kind: 'add-item', projectId: P, visitId: V, input: { section: 'GENERAL', text: 'Bozza' } });
    const local = ops.apply(visit()).items.find((i) => i.text === 'Bozza')!;
    await ops.enqueue({ kind: 'update-item', projectId: P, visitId: V, itemId: local.id, patch: { text: 'Cantiere ordinato' } });
    expect(ops.all()).toHaveLength(1);
    expect(ops.apply(visit()).items.some((i) => i.text === 'Cantiere ordinato')).toBe(true);

    await ops.enqueue({ kind: 'remove-item', projectId: P, visitId: V, itemId: local.id });
    expect(ops.all()).toHaveLength(0);
  });

  it('al ritorno della rete invia tutto nell\'ordine e svuota la coda', async () => {
    await ops.enqueue({ kind: 'add-item', projectId: P, visitId: V, input: { section: 'PROGRESS', text: 'Uno' } });
    await ops.enqueue({ kind: 'add-item', projectId: P, visitId: V, input: { section: 'PROGRESS', text: 'Due' } });
    online = true;
    calls.length = 0;
    window.dispatchEvent(new Event('online'));
    await flush();
    await flush();
    expect(calls).toEqual(['add:Uno', 'add:Due']);
    expect(ops.all()).toHaveLength(0);
    expect(ops.synced()).toBe(2);
  });

  it('una voce già eliminata sul server conta come fatta', async () => {
    online = true;
    await ops.enqueue({ kind: 'remove-item', projectId: P, visitId: V, itemId: 'srv-1' });
    await flush();
    expect(ops.all()).toHaveLength(0);
  });

  it('crea il sopralluogo sul telefono senza rete e ne trattiene le operazioni finché non esiste sul server', async () => {
    const started = await ops.startVisit(P);
    expect(started.number).toBeNull();
    expect(ops.isVisitPending(started.id)).toBe(true);
    await ops.enqueue({ kind: 'update-visit', projectId: P, visitId: started.id, patch: { phase: 'Scavi' } });
    expect(calls.filter((c) => c === 'update')).toHaveLength(0);
  });
});
