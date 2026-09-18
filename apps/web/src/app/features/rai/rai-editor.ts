import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectsStore } from '../../core/data/projects-store';
import { RaiStore } from '../../core/data/rai-store';
import { fmtNum } from '../../core/data/format';
import { Icon } from '../../shared/ui/icon';
import { OutcomeBadge } from '../../shared/ui/outcome-badge';
import { RaiResults } from './rai-results';
import { RaiRoomForm } from './rai-room-form';
import { val } from '../../shared/dom';

/** Modulo R.A.I. (AFU FR-M3-03..15): calcolo in tempo reale con il motore condiviso. */
@Component({
  selector: 'app-rai-editor',
  imports: [RouterLink, Icon, OutcomeBadge, RaiResults, RaiRoomForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a [routerLink]="['/commesse', id()]" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> {{ project()?.code }} · {{ project()?.title }}</a>
    <div class="head">
      <div><h1>Verifica R.A.I.</h1><p class="muted">Rapporti aeroilluminanti e requisiti igienico-sanitari, calcolati mentre scrivi.</p></div>
      <div class="row">
        <label class="field" style="min-width:300px"><span class="small muted">Profilo normativo</span>
          <select class="select" [value]="rai.profile().id" (change)="rai.setProfile(val($event))">
            @for (p of rai.profiles; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </label>
        <button class="btn btn-primary" [disabled]="!canAttest()"><ui-icon name="file" [size]="15" /> Relazione tecnica</button>
      </div>
    </div>

    <div class="summary card">
      <div class="sum-item"><span class="eyebrow">Esito unità</span><ui-outcome [outcome]="unit().outcome" /></div>
      <div class="sum-item"><span class="eyebrow">Sp computabile</span><b class="mono">{{ n(unit().totals.computableArea) }} mq</b></div>
      <div class="sum-item"><span class="eyebrow">Sup. illuminante</span><b class="mono">{{ n(unit().totals.illuminatingArea) }} mq</b></div>
      <div class="sum-item"><span class="eyebrow">Sup. aerante</span><b class="mono">{{ n(unit().totals.ventilatingArea) }} mq</b></div>
      <div class="sum-item"><span class="eyebrow">Vani</span><span class="row" style="gap:6px"><span class="badge badge-success badge-plain">{{ unit().counts.COMPLIANT }}</span><span class="badge badge-danger badge-plain">{{ unit().counts.NON_COMPLIANT }}</span><span class="badge badge-warning badge-plain">{{ unit().counts.SUBJECT_TO_ATTESTATION }}</span></span></div>
    </div>

    <div class="layout">
      <aside class="card rooms">
        <div class="card-header"><h3>Vani</h3><button class="btn btn-ghost btn-sm" (click)="addRoom()"><ui-icon name="plus" [size]="14" /> Vano</button></div>
        <ul>
          @for (r of unit().rooms; track r.roomId; let i = $index) {
            <li [class.is-active]="r.roomId === selectedId()" (click)="selectedId.set(r.roomId)">
              <span class="dot" [class]="'dot ' + r.outcome"></span>
              <span class="rt"><b>{{ rooms()[i]?.name }}</b><span class="muted small">{{ n(r.computableArea) }} mq @if (r.ventilating) { · {{ signed(r.ventilating.delta) }} mq }</span></span>
            </li>
          }
        </ul>
      </aside>

      @if (selectedRoom(); as room) {
        <section class="card form-col">
          <app-rai-room-form [projectId]="id()" [room]="room" (removed)="onRemoved()" />
        </section>
        <aside class="results-col">
          @if (selectedResult(); as res) { <app-rai-results [result]="res" [room]="room" /> }
        </aside>
      } @else {
        <section class="card" style="grid-column: span 2; display:grid; place-items:center; padding: 60px" class="muted">Aggiungi il primo vano per iniziare.</section>
      }
    </div>
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); padding: 14px 20px; margin-bottom: 16px; }
    .sum-item { display: flex; flex-direction: column; gap: 6px; border-right: 1px solid var(--line); padding-right: 16px; margin-right: 16px; }
    .sum-item:last-child { border: 0; }
    .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .rooms ul { list-style: none; margin: 0; padding: 6px; }
    .rooms li { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 8px; cursor: pointer; }
    .rooms li:hover { background: var(--surface-2); }
    .rooms li.is-active { background: var(--primary-soft); }
    .rt { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
    .rt b { font-weight: 500; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); flex: none; }
    .dot.COMPLIANT { background: var(--success); } .dot.NON_COMPLIANT { background: var(--danger); } .dot.SUBJECT_TO_ATTESTATION { background: var(--warning); } .dot.INCOMPLETE { background: var(--muted); }
    .results-col { position: sticky; top: calc(var(--topbar-h) + 20px); }
    @media (max-width: 1200px) { .layout { grid-template-columns: 220px 1fr; } .results-col { grid-column: span 2; position: static; } .summary { grid-template-columns: repeat(3, 1fr); gap: 12px; } .sum-item { border: 0; } }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .results-col { grid-column: auto; } }
  `,
})
export class RaiEditor {
  readonly id = input.required<string>();
  protected readonly rai = inject(RaiStore);
  private readonly store = inject(ProjectsStore);
  protected readonly val = val;
  protected readonly n = fmtNum;

  protected readonly project = computed(() => this.store.projects().find((p) => p.id === this.id()) ?? null);
  protected readonly rooms = computed(() => this.rai.roomsOf(this.id())());
  protected readonly unit = computed(() => this.rai.evaluation(this.id())());
  protected readonly selectedId = linkedSignal<string | null>(() => this.rooms()[0]?.id ?? null);
  protected readonly selectedRoom = computed(() => this.rooms().find((r) => r.id === this.selectedId()) ?? null);
  protected readonly selectedResult = computed(() => this.unit().rooms.find((r) => r.roomId === this.selectedId()) ?? null);
  protected readonly canAttest = computed(() => ['COMPLIANT', 'SUBJECT_TO_ATTESTATION'].includes(this.unit().outcome));

  protected signed(v: string): string {
    return (v.startsWith('-') ? '' : '+') + fmtNum(v);
  }

  protected addRoom(): void {
    this.selectedId.set(this.rai.addRoom(this.id()));
  }

  protected onRemoved(): void {
    this.selectedId.set(this.rooms()[0]?.id ?? null);
  }
}
