import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectsStore } from '../../core/data/projects-store';
import { fmtDate, fmtRelative } from '../../core/data/format';
import { DRAWING_STATUS_LABEL, PROJECT_STATUS_LABEL, VISIT_STATUS_LABEL } from '../../core/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { OutcomeBadge, OUTCOME_LABEL } from '../../shared/ui/outcome-badge';
import { MagicLinkDialog } from './magic-link-dialog';

type Tab = 'overview' | 'drawings' | 'visits';

/** Fascicolo di commessa (AFU FR-M1-04): dashboard, elaborati, sopralluoghi. */
@Component({
  selector: 'app-project-detail',
  imports: [RouterLink, Icon, OutcomeBadge, EmptyState, MagicLinkDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (project(); as p) {
      <a routerLink="/commesse" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> Commesse</a>
      <div class="head">
        <div>
          <div class="row" style="gap:8px"><span class="eyebrow">{{ p.code }}</span><span class="badge" [class.badge-success]="p.status === 'ACTIVE'">{{ statusLabel[p.status] }}</span></div>
          <h1 style="margin-top:4px">{{ p.title }}</h1>
          <div class="muted row" style="gap:14px;margin-top:4px;flex-wrap:wrap">
            <span class="row" style="gap:5px"><ui-icon name="map-pin" [size]="14" /> {{ p.address }}</span>
            <span class="row" style="gap:5px"><ui-icon name="users" [size]="14" /> {{ p.clientName }}</span>
            <span class="row" style="gap:5px"><ui-icon name="building" [size]="14" /> {{ p.interventionType }}</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-outline" (click)="linksOpen.set(true)"><ui-icon name="users" [size]="15" /> Accesso committenti</button>
          <button class="btn btn-primary"><ui-icon name="upload" [size]="15" /> Carica tavola</button>
        </div>
      </div>

      <nav class="tabs">
        <button [class.is-active]="tab() === 'overview'" (click)="tab.set('overview')">Panoramica</button>
        <button [class.is-active]="tab() === 'drawings'" (click)="tab.set('drawings')">Elaborati <span class="cnt">{{ drawings().length }}</span></button>
        <button [class.is-active]="tab() === 'visits'" (click)="tab.set('visits')">Sopralluoghi <span class="cnt">{{ visits().length }}</span></button>
      </nav>

      @switch (tab()) {
        @case ('overview') {
          <div class="grid grid-4">
            <div class="card w"><div class="eyebrow">Approvazioni</div><div class="big mono">{{ s().drawingsPending }}</div><div class="muted small">tavole in attesa del committente</div></div>
            <div class="card w"><div class="eyebrow">Osservazioni</div><div class="big mono" [class.warn]="s().pinsOpen > 0">{{ s().pinsOpen }}</div><div class="muted small">pin aperti da gestire</div></div>
            <a class="card w link" [routerLink]="['/commesse', p.id, 'rai']">
              <div class="row-between"><span class="eyebrow">Conformità R.A.I.</span><ui-icon name="arrow-right" [size]="15" class="muted" /></div>
              <div style="margin:8px 0"><ui-outcome [outcome]="s().raiOutcome" /></div>
              <div class="muted small">{{ raiHint() }}</div>
            </a>
            <div class="card w"><div class="eyebrow">Cantiere</div><div class="big mono">{{ s().visits }}</div><div class="muted small">sopralluoghi · {{ s().reportsDraft }} verbali da finalizzare</div></div>
          </div>
        }
        @case ('drawings') {
          <div class="card">
            @if (drawings().length) {
              <table class="table">
                <thead><tr><th>Tavola</th><th>Categoria</th><th>Versione</th><th>Stato</th><th class="num">Pin</th><th>Aggiornata</th></tr></thead>
                <tbody>
                  @for (d of drawings(); track d.id) {
                    <tr class="is-link" [routerLink]="['tavole', d.id]">
                      <td><b class="mono">{{ d.code }}</b> · {{ d.title }}</td><td>{{ d.category }}</td><td class="mono">v{{ d.version }}</td>
                      <td><span class="badge" [class.badge-success]="d.status === 'APPROVED'" [class.badge-info]="d.status === 'PUBLISHED'" [class.badge-plain]="d.status === 'DRAFT'">{{ drawingLabel[d.status] }}</span></td>
                      <td class="num">@if (d.pinsOpen) { <b style="color:var(--warning)">{{ d.pinsOpen }}</b> aperti / } {{ d.pinsTotal }}</td>
                      <td class="muted">{{ rel(d.updatedAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <ui-empty icon="file" title="Nessun elaborato" text="Carica la prima tavola per iniziare la revisione con il committente." /> }
          </div>
        }
        @case ('visits') {
          <div class="card">
            @if (visits().length) {
              <table class="table">
                <thead><tr><th>Verbale</th><th>Data</th><th>Stato</th><th class="num">Foto</th><th class="num">Difformità aperte</th></tr></thead>
                <tbody>
                  @for (v of visits(); track v.id) {
                    <tr class="is-link">
                      <td><b>Sopralluogo n. {{ v.number }}</b></td><td>{{ date(v.date) }}</td>
                      <td><span class="badge" [class.badge-success]="v.status === 'SENT'" [class.badge-warning]="v.status === 'REVIEW'" [class.badge-plain]="v.status === 'DRAFT'">{{ visitLabel[v.status] }}</span></td>
                      <td class="num">{{ v.photos }}</td><td class="num">@if (v.issuesOpen) { <b style="color:var(--danger)">{{ v.issuesOpen }}</b> } @else { <span class="muted">0</span> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <ui-empty icon="hardhat" title="Nessun sopralluogo" text="I sopralluoghi si creano dal telefono, anche offline." /> }
          </div>
        }
      }
      <app-magic-link-dialog [open]="linksOpen()" [projectId]="p.id" (closed)="linksOpen.set(false)" />
    } @else {
      <div class="card"><ui-empty icon="folder" title="Commessa non trovata" /></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 18px; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
    .tabs button { background: none; border: 0; padding: 10px 12px; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; }
    .tabs button.is-active { color: var(--ink); border-color: var(--color-primary); }
    .cnt { font-size: 11px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; }
    .w { padding: 16px 18px; display: flex; flex-direction: column; gap: 2px; }
    .w.link:hover { box-shadow: var(--shadow-md); }
    .big { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0; }
    .big.warn { color: var(--warning); }
  `,
})
export class ProjectDetail {
  readonly id = input.required<string>();
  private readonly store = inject(ProjectsStore);
  protected readonly tab = signal<Tab>('overview');
  protected readonly linksOpen = signal(false);
  protected readonly statusLabel = PROJECT_STATUS_LABEL;
  protected readonly drawingLabel = DRAWING_STATUS_LABEL;
  protected readonly visitLabel = VISIT_STATUS_LABEL;
  protected readonly rel = fmtRelative;
  protected readonly date = fmtDate;

  protected readonly project = computed(() => this.store.projects().find((p) => p.id === this.id()) ?? null);
  protected readonly drawings = computed(() => this.store.drawingsOf(this.id())());
  protected readonly visits = computed(() => this.store.visitsOf(this.id())());
  protected readonly s = computed(() => this.store.stats(this.id())());
  protected readonly raiHint = computed(() => {
    const o = this.s().raiOutcome;
    return o === 'NONE' ? 'Inserisci vani e aperture' : OUTCOME_LABEL[o] + ' · apri il calcolo';
  });
}
