import { Injectable, computed, signal } from '@angular/core';
import {
  SYSTEM_PROFILES,
  evaluateUnit,
  type OpeningInput,
  type RegulationProfile,
  type RoomInput,
  type UnitResult,
} from '@aph/rai-engine';
import { ROOMS } from './mock-rooms';

let seq = 100;
const nextId = (prefix: string) => `${prefix}${++seq}`;

/** Vani e aperture per commessa, con valutazione R.A.I. reattiva (AFU FR-M3-10). */
@Injectable({ providedIn: 'root' })
export class RaiStore {
  private readonly rooms = signal<Record<string, RoomInput[]>>(ROOMS);
  private readonly profileId = signal<string>(SYSTEM_PROFILES[0]?.id ?? '');

  readonly profiles = SYSTEM_PROFILES;
  readonly profile = computed<RegulationProfile>(
    () =>
      this.profiles.find((p) => p.id === this.profileId()) ??
      (this.profiles[0] as RegulationProfile),
  );

  setProfile(id: string): void {
    this.profileId.set(id);
  }

  roomsOf(projectId: string) {
    return computed(() => this.rooms()[projectId] ?? []);
  }

  evaluation(projectId: string) {
    return computed<UnitResult>(() =>
      evaluateUnit(
        { id: projectId, unitType: 'DWELLING', rooms: this.rooms()[projectId] ?? [] },
        this.profile(),
      ),
    );
  }

  addRoom(projectId: string): string {
    const id = nextId('r');
    const room: RoomInput = {
      id,
      name: 'Nuovo vano',
      use: 'LIVING_ROOM',
      floorArea: '15.00',
      ceiling: { type: 'FLAT', height: '2.70' },
      openings: [],
    };
    this.rooms.update((all) => ({ ...all, [projectId]: [...(all[projectId] ?? []), room] }));
    return id;
  }

  updateRoom(projectId: string, roomId: string, patch: Partial<RoomInput>): void {
    this.mapRooms(projectId, (r) => (r.id === roomId ? { ...r, ...patch } : r));
  }

  removeRoom(projectId: string, roomId: string): void {
    this.rooms.update((all) => ({
      ...all,
      [projectId]: (all[projectId] ?? []).filter((r) => r.id !== roomId),
    }));
  }

  addOpening(projectId: string, roomId: string): void {
    const opening: OpeningInput = {
      id: nextId('o'),
      label: 'W',
      kind: 'WINDOW',
      quantity: 1,
      width: '1.20',
      height: '1.40',
      sillHeight: '0.90',
      operability: 'FULL',
    };
    this.mapRooms(projectId, (r) =>
      r.id === roomId ? { ...r, openings: [...r.openings, opening] } : r,
    );
  }

  updateOpening(
    projectId: string,
    roomId: string,
    openingId: string,
    patch: Partial<OpeningInput>,
  ): void {
    this.mapRooms(projectId, (r) =>
      r.id === roomId
        ? { ...r, openings: r.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)) }
        : r,
    );
  }

  removeOpening(projectId: string, roomId: string, openingId: string): void {
    this.mapRooms(projectId, (r) =>
      r.id === roomId ? { ...r, openings: r.openings.filter((o) => o.id !== openingId) } : r,
    );
  }

  private mapRooms(projectId: string, fn: (room: RoomInput) => RoomInput): void {
    this.rooms.update((all) => ({ ...all, [projectId]: (all[projectId] ?? []).map(fn) }));
  }
}
