import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectsStore } from '../../core/data/projects-store';
import { fmtRelative } from '../../core/data/format';
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { OutcomeBadge } from '../../shared/ui/outcome-badge';
import { PageHeader } from '../../shared/ui/page-header';
import { val } from '../../shared/dom';
import { NewProjectDialog } from './new-project-dialog';

type Filter = 'ALL' | ProjectStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Tutte' },
  { key: 'ACTIVE', label: 'Attive' },
  { key: 'SUSPENDED', label: 'Sospese' },
  { key: 'CLOSED', label: 'Chiuse' },
];

/** Elenco e ricerca delle commesse (AFU FR-M1-02). */
@Component({
  selector: 'app-projects-list',
  imports: [Icon, OutcomeBadge, PageHeader, NewProjectDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Commesse" [subtitle]="rows().length + ' commesse'">
      <button class="btn btn-primary" (click)="dialogOpen.set(true)"><ui-icon name="plus" [size]="16" /> Nuova commessa</button>
    </ui-page-header>

    <div class="toolbar">
      <div class="row" style="gap:6px">
        @for (f of filters; track f.key) { <button class="chip" [class.is-active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button> }
      </div>
      <label class="search"><ui-icon name="search" [size]="15" /><input placeholder="Cerca per codice, titolo, committente…" [value]="query()" (input)="query.set(val($event))" /></label>
    </div>

    <app-new-project-dialog [open]="dialogOpen()" (closed)="closeDialog()" />

    <div class="card">
      <table class="table">
        <thead><tr><th>Commessa</th><th>Committente</th><th>Stato</th><th>R.A.I.</th><th class="num">Pin aperti</th><th class="num">Sopralluoghi</th><th>Aggiornata</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.p.id) {
            <tr class="is-link" (click)="open(r.p.id)">
              <td><div style="font-weight:500">{{ r.p.title }}</div><div class="muted small mono">{{ r.p.code }} · {{ r.p.municipality }}</div></td>
              <td>{{ r.p.clientName }}</td>
              <td><span class="badge" [class.badge-success]="r.p.status === 'ACTIVE'" [class.badge-warning]="r.p.status === 'SUSPENDED'">{{ statusLabel[r.p.status] }}</span></td>
              <td><ui-outcome [outcome]="r.s.raiOutcome" /></td>
              <td class="num">@if (r.s.pinsOpen) { <b>{{ r.s.pinsOpen }}</b> } @else { <span class="muted">0</span> }</td>
              <td class="num">{{ r.s.visits }}</td>
              <td class="muted">{{ rel(r.p.updatedAt) }}</td>
            </tr>
          } @empty { <tr><td colspan="7" class="muted" style="text-align:center;padding:36px">Nessuna commessa corrisponde ai filtri.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--muted); min-width: 300px; }
    .search input { border: 0; outline: 0; background: transparent; font: inherit; color: var(--ink); flex: 1; }
    .card { overflow-x: auto; }
  `,
})
export class ProjectsList {
  private readonly store = inject(ProjectsStore);
  private readonly router = inject(Router);
  protected readonly val = val;
  protected readonly rel = fmtRelative;
  protected readonly filters = FILTERS;
  protected readonly statusLabel = PROJECT_STATUS_LABEL;
  protected readonly filter = signal<Filter>('ALL');
  protected readonly query = signal('');
  /** `?nuova=1` apre la finestra (pulsante nella topbar). */
  readonly nuova = input<string>();
  protected readonly dialogOpen = linkedSignal(() => this.nuova() === '1');

  protected closeDialog(): void {
    this.dialogOpen.set(false);
    if (this.nuova()) void this.router.navigate(['/commesse'], { replaceUrl: true });
  }

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filter();
    return this.store
      .projects()
      .filter((p) => f === 'ALL' || p.status === f)
      .filter((p) => !q || [p.code, p.title, p.clientName, p.municipality].some((s) => s.toLowerCase().includes(q)))
      .map((p) => ({ p, s: this.store.stats(p.id)() }));
  });

  protected open(id: string): void {
    void this.router.navigate(['/commesse', id]);
  }
}
