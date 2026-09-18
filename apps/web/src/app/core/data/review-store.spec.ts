import { TestBed } from '@angular/core/testing';
import { ReviewStore } from './review-store';

describe('ReviewStore (AFU M2)', () => {
  let store: ReviewStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(ReviewStore);
  });

  it('numbers new pins progressively per drawing and clamps coordinates to 0–100 (BR-20)', () => {
    const res = store.addPin('d1', 120, -5, 'Nota', 'CLIENT', 'Marco');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.number).toBe(4);
    expect(res.value.x).toBe(100);
    expect(res.value.y).toBe(0);
  });

  it('rejects empty comments', () => {
    expect(store.addPin('d1', 10, 10, '   ', 'CLIENT', 'Marco')).toEqual({ ok: false, code: 'EMPTY_TEXT' });
  });

  it('a studio reply puts the pin in WAITING, a client reply reopens it', () => {
    store.reply('pin1', 'Ci pensiamo', 'STUDIO', 'Studio');
    expect(store.pinsOf('d1')().find((p) => p.id === 'pin1')?.status).toBe('WAITING');
    store.reply('pin1', 'Grazie', 'CLIENT', 'Marco');
    expect(store.pinsOf('d1')().find((p) => p.id === 'pin1')?.status).toBe('OPEN');
  });

  it('reopening requires a comment (BR-11)', () => {
    expect(store.reopen('pin3', '', 'CLIENT', 'Marco')).toEqual({ ok: false, code: 'EMPTY_TEXT' });
    expect(store.reopen('pin3', 'Non è chiaro', 'CLIENT', 'Marco').ok).toBe(true);
    expect(store.pinsOf('d1')().find((p) => p.id === 'pin3')?.status).toBe('OPEN');
  });

  it('approval freezes the version: no new pins, replies or resolutions (BR-01)', () => {
    const approval = store.approve('d1', 3, 'Marco Colombo');
    expect(approval.ok).toBe(true);
    if (approval.ok) expect(approval.value.openPinsAtApproval).toBe(2);

    expect(store.addPin('d1', 10, 10, 'Altro', 'CLIENT', 'Marco')).toEqual({ ok: false, code: 'VERSION_FROZEN' });
    expect(store.reply('pin1', 'Ancora', 'STUDIO', 'Studio')).toEqual({ ok: false, code: 'VERSION_FROZEN' });
    expect(store.resolve('pin1')).toEqual({ ok: false, code: 'VERSION_FROZEN' });
    expect(store.approve('d1', 3, 'Marco Colombo')).toEqual({ ok: false, code: 'VERSION_FROZEN' });
  });

  it('counts open and total pins per drawing', () => {
    expect(store.counts()['d1']).toEqual({ open: 2, total: 3 });
    expect(store.counts()['d4']).toEqual({ open: 3, total: 3 });
  });
});
