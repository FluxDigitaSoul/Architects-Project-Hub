import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Outcome, formatDecimalIt } from '@aph/rai-engine';
import { toApiError } from '../../core/api/api';
import { ProjectsApi } from '../../core/api/projects-api';
import { RaiApi, type RaiRoom, type RaiUnit } from '../../core/api/rai-api';
import { TenantContext } from '../../core/tenant/tenant-context';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { RaiResults } from './rai-results';
import { ROOM_USE_LABEL, RaiRoomForm } from './rai-room-form';
import { RaiSnapshots } from './rai-snapshots';
import { RaiUnitPanel } from './rai-unit-panel';

type Selection = { kind: 'unit' | 'room'; id: string } | null;

/**
 * Verifica R.A.I. della commessa (AFU Modulo 3): fabbricati, unità e vani salvati sul server,
 * esiti calcolati dal server con lo stesso motore del client, revisioni immutabili per la relazione.
 */
@Component({
  selector: 'app-rai-editor',
  imports: [RouterLink, EmptyState, Icon, RaiResults, RaiRoomForm, RaiSnapshots, RaiUnitPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a [routerLink]="['/commesse', id()]" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> {{ project.value()?.code }} · {{ project.value()?.title }}</a>
    <div class="head">
      <div>
        <h1>Verifica R.A.I.</h1>
        <p class="muted small">Rapporti aeroilluminanti e requisiti igienico-sanitari, calcolati sui valori esatti.</p>
      </div>
      @if (data.value(); as d) {
        <div class="row cfg">
          <label class="field"><span class="small muted">Profilo normativo</span>
            <select class="select select-sm" [disabled]="readOnly()" (change)="setProfile(val($event))">
              @for (p of profiles.value() ?? []; track p.versionId) {
                <option [value]="p.versionId" [selected]="p.versionId === d.profile.versionId">{{ p.name }} (v{{ p.version }}){{ p.isTemplate ? ' · modello' : '' }}</option>
              }
            </select></label>
          <label class="field alt"><span class="small muted">Altitudine (m s.l.m.)</span>
            <input class="input input-sm mono" type="number" min="-50" max="5000" [disabled]="readOnly()" [value]="d.altitudeM ?? ''" (change)="setAltitude(val($event))" /></label>
        </div>
      }
    </div>

    @if (data.value(); as d) {
      <div class="summary">
        <span class="badge badge-success">{{ d.summary.counts.COMPLIANT }} conformi</span>
        <span class="badge badge-danger">{{ d.summary.counts.NON_COMPLIANT }} non conformi</span>
        <span class="badge badge-warning">{{ d.summary.counts.SUBJECT_TO_ATTESTATION }} da asseverare</span>
        <span class="badge">{{ d.summary.counts.INCOMPLETE + d.summary.counts.INVALID_INPUT }} incompleti</span>
        @if (deficit()) { <span class="small">Deficit totale <b class="mono">{{ deficit() }} mq</b></span> }
        @if (reloading()) { <span class="muted small">Ricalcolo…</span> }
      </div>

      <div class="layout">
        <aside class="card tree">
          <div class="card-header"><h3>Struttura</h3>
            @if (!readOnly()) { <button class="btn btn-ghost btn-sm" (click)="addBuilding()"><ui-icon name="plus" [size]="14" /> Fabbricato</button> }</div>
          @for (b of d.structure; track b.id) {
            <div class="bld">
              <div class="bld-name"><ui-icon name="building" [size]="14" />
                <input class="inline" [value]="b.name" [disabled]="readOnly()" (change)="renameBuilding(b.id, val($event))" aria-label="Nome del fabbricato" />
                @if (!readOnly()) { <button class="btn btn-ghost btn-icon" title="Aggiungi unità" (click)="addUnit(b.id, b.units.length)"><ui-icon name="plus" [size]="13" /></button> }
              </div>
              @for (u of b.units; track u.id) {
                <button class="node unit" [class.is-active]="isSel('unit', u.id)" (click)="select('unit', u.id)">{{ u.name }}
                  <span [class]="'dot ' + unitOutcome(u.id)"></span></button>
                @for (r of u.rooms; track r.id) {
                  <button class="node room" [class.is-active]="isSel('room', r.id)" (click)="select('room', r.id)">
                    <span class="rname">{{ r.name }}</span><span class="muted small">{{ useLabel[r.use] }}</span>
                    <span [class]="'dot ' + roomOutcome(r.id)"></span></button>
                }
                @if (!readOnly()) { <button class="node add" (click)="addRoom(u)"><ui-icon name="plus" [size]="13" /> Vano</button> }
              } @empty { <p class="muted small pad">Nessuna unità.</p> }
            </div>
          } @empty {
            <div class="pad"><ui-empty icon="building" title="Nessun fabbricato" text="Aggiungi il fabbricato, poi le unità immobiliari e i vani." /></div>
          }
        </aside>

        <section class="main">
          @if (selectedRoom(); as r) {
            <div class="card"><app-rai-room-form [projectId]="id()" [room]="r" [readOnly]="readOnly()" (changed)="reload()" (removed)="selection.set(null)" /></div>
          } @else if (selectedUnit(); as u) {
            <div class="card"><app-rai-unit-panel [projectId]="id()" [unit]="u" [result]="unitResult(u.id)" [profiles]="profiles.value() ?? []"
              [readOnly]="readOnly()" (changed)="reload()" (removed)="selection.set(null)" /></div>
          } @else {
            <div class="card"><ui-empty icon="ruler" title="Seleziona un vano" text="Scegli un vano nella struttura per inserire superficie, altezza e aperture: l'esito si aggiorna subito." /></div>
          }
        </section>

        <aside class="side">
          @if (selectedRoom(); as r) {
            @if (roomCalc(r.id); as calc) { <app-rai-results [room]="calc.input" [result]="calc.result" /> }
          }
          <app-rai-snapshots [projectId]="id()" [canEmit]="!readOnly()" />
          <p class="muted small">Profilo applicato: {{ d.profile.name }} v{{ d.profile.version }}</p>
        </aside>
      </div>
    } @else if (data.error()) {
      <div class="card error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="data.reload()">Riprova</button></div>
    } @else { <div class="card skeleton"></div> }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
    .cfg { gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .cfg .field { display: grid; gap: 4px; }
    .alt input { width: 110px; }
    .summary { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .layout { display: grid; grid-template-columns: 260px minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .tree { position: sticky; top: calc(var(--topbar-h) + 12px); max-height: calc(100vh - var(--topbar-h) - 40px); overflow: auto; }
    .bld { padding: 6px 8px 10px; border-bottom: 1px solid var(--line); }
    .bld-name { display: flex; gap: 6px; align-items: center; font-weight: 600; padding: 4px; }
    .inline { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; color: inherit; outline: 0; }
    .node { display: flex; gap: 6px; align-items: center; width: 100%; text-align: left; border: 0; background: none; font: inherit; color: inherit; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .node:hover { background: var(--surface-2); }
    .node.is-active { background: var(--primary-soft); color: var(--color-primary); }
    .node.unit { font-weight: 500; }
    .node.room { padding-left: 22px; }
    .node.add { padding-left: 22px; color: var(--color-primary); font-size: 13px; }
    .rname { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .node .small { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { width: 9px; height: 9px; border-radius: 50%; margin-left: auto; flex: none; background: var(--line-strong); }
    .dot.COMPLIANT { background: var(--success); } .dot.NON_COMPLIANT, .dot.INVALID_INPUT { background: var(--danger); }
    .dot.SUBJECT_TO_ATTESTATION { background: var(--warning); } .dot.NOT_REQUIRED { background: #cbd5e1; }
    .pad { padding: 10px; }
    .side { display: grid; gap: 14px; }
    .skeleton { height: 50vh; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    @media (max-width: 1280px) { .layout { grid-template-columns: 240px minmax(0, 1fr); } .side { grid-column: 1 / -1; } }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .tree { position: static; max-height: none; } }
  `,
})
export class RaiEditor {
  readonly id = input.required<string>();
  private readonly api = inject(RaiApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly tenant = inject(TenantContext);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly useLabel = ROOM_USE_LABEL;

  protected readonly project = resource({ params: () => this.id(), loader: ({ params }) => this.projectsApi.detail(params) });
  protected readonly data = resource({ params: () => this.id(), loader: ({ params }) => this.api.load(params) });
  protected readonly profiles = resource({ loader: () => this.api.profiles() });
  protected readonly selection = signal<Selection>(null);

  protected readonly readOnly = computed(() => !this.tenant.canManage() || this.project.value()?.status !== 'ACTIVE');
  protected readonly reloading = computed(() => this.data.isLoading() && this.data.hasValue());
  protected readonly errorText = computed(() => toApiError(this.data.error()).userMessage);
  protected readonly deficit = computed(() => {
    const v = this.data.value()?.summary.deficitSqm ?? '0';
    return Number(v) > 0 ? formatDecimalIt(v, 2) : null;
  });

  private readonly units = computed<RaiUnit[]>(() => (this.data.value()?.structure ?? []).flatMap((b) => b.units));
  private readonly rooms = computed<RaiRoom[]>(() => this.units().flatMap((u) => u.rooms));
  private readonly calcUnits = computed(() => (this.data.value()?.buildings ?? []).flatMap((b) => b.units));

  protected readonly selectedRoom = computed(() => {
    const s = this.selection();
    return s?.kind === 'room' ? (this.rooms().find((r) => r.id === s.id) ?? null) : null;
  });
  protected readonly selectedUnit = computed(() => {
    const s = this.selection();
    return s?.kind === 'unit' ? (this.units().find((u) => u.id === s.id) ?? null) : null;
  });

  protected isSel(kind: 'unit' | 'room', id: string): boolean {
    const s = this.selection();
    return s?.kind === kind && s.id === id;
  }

  protected select(kind: 'unit' | 'room', id: string): void {
    this.selection.set({ kind, id });
  }

  protected unitResult(unitId: string) {
    return this.calcUnits().find((u) => u.id === unitId)?.result ?? null;
  }

  protected unitOutcome(unitId: string): Outcome | '' {
    return this.unitResult(unitId)?.outcome ?? '';
  }

  protected roomOutcome(roomId: string): Outcome | '' {
    for (const u of this.calcUnits()) {
      const r = u.result.rooms.find((x) => x.roomId === roomId);
      if (r) return r.outcome;
    }
    return '';
  }

  /** Input del motore ed esito del vano, per il pannello dei risultati. */
  protected roomCalc(roomId: string) {
    for (const u of this.calcUnits()) {
      const result = u.result.rooms.find((x) => x.roomId === roomId);
      const input = u.input.rooms.find((x) => x.id === roomId);
      if (result && input) return { result, input };
    }
    return null;
  }

  reload(): void {
    this.data.reload();
  }

  protected async addBuilding(): Promise<void> {
    const n = (this.data.value()?.structure.length ?? 0) + 1;
    await this.run(async () => {
      const b = await this.api.createBuilding(this.id(), { name: n === 1 ? 'Edificio' : `Edificio ${n}` });
      const u = await this.api.createUnit(this.id(), b.id, { name: 'Unità 1' });
      this.selection.set({ kind: 'unit', id: u.id });
    });
  }

  protected async addUnit(buildingId: string, count: number): Promise<void> {
    await this.run(async () => {
      const u = await this.api.createUnit(this.id(), buildingId, { name: `Unità ${count + 1}` });
      this.selection.set({ kind: 'unit', id: u.id });
    });
  }

  protected async addRoom(unit: RaiUnit): Promise<void> {
    await this.run(async () => {
      const r = await this.api.createRoom(this.id(), unit.id, {
        name: `Vano ${unit.rooms.length + 1}`, use: 'LIVING_ROOM', floorArea: '14', ceiling: { type: 'FLAT', height: '2.70' },
      });
      this.selection.set({ kind: 'room', id: r.id });
    });
  }

  protected async renameBuilding(buildingId: string, name: string): Promise<void> {
    if (!name.trim()) return;
    await this.run(() => this.api.updateBuilding(this.id(), buildingId, { name: name.trim() }));
  }

  protected async setProfile(versionId: string): Promise<void> {
    await this.updateProject({ regulationProfileVersionId: versionId });
  }

  protected async setAltitude(value: string): Promise<void> {
    const n = value.trim() === '' ? null : Math.round(Number(value));
    if (n !== null && !Number.isFinite(n)) return;
    await this.updateProject({ altitudeM: n });
  }

  private async updateProject(patch: { regulationProfileVersionId?: string | null; altitudeM?: number | null }): Promise<void> {
    const p = this.project.value();
    if (!p) return;
    await this.run(async () => {
      await this.projectsApi.update(p.id, { ...patch, version: p.version });
      this.project.reload();
      this.toaster.show('Impostazioni del calcolo aggiornate');
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.data.reload();
  }
}
