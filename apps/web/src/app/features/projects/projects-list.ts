import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PROJECT_STATUS_LABEL, type ProjectStatus, ProjectsApi } from '../../core/api/projects-api';
import { fmtRelative } from '../../core/data/format';
import { TenantContext } from '../../core/tenant/tenant-context';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { val } from '../../shared/dom';
import { NewProjectDialog } from './new-project-dialog';

type Filter = 'ALL' | ProjectStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'In corso' },
  { key: 'ACTIVE', label: 'Attive' },
  { key: 'SUSPENDED', label: 'Sospese' },
  { key: 'CLOSED', label: 'Chiuse' },
  { key: 'ARCHIVED', label: 'Archiviate' },
];
const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/** Elenco e ricerca delle commesse (AFU FR-M1-02): filtro, ricerca e paginazione lato server. */
@Component({
  selector: 'app-projects-list',
  imports: [EmptyState, Icon, PageHeader, NewProjectDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Commesse" [subtitle]="subtitle()">
      @if (tenant.canManage()) {
        <button class="btn btn-primary" (click)="dialogOpen.set(true)"><ui-icon name="plus" [size]="16" /> Nuova commessa</button>
      }
    </ui-page-header>

    <div class="toolbar">
      <div class="row chips">
        @for (f of filters; track f.key) { <button class="chip" [class.is-active]="filter() === f.key" (click)="setFilter(f.key)">{{ f.label }}</button> }
      </div>
      <label class="search"><ui-icon name="search" [size]="15" />
        <input placeholder="Cerca per codice, titolo, committente, indirizzo…" [value]="query()" (input)="onQuery(val($event))" aria-label="Cerca commesse" />
      </label>
    </div>

    <app-new-project-dialog [open]="dialogOpen()" (closed)="closeDialog()" />

    <div class="card">
      @if (list.error()) {
        <div class="error-box"><span>{{ errorText() }}</span><button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else {
        <table class="table" [class.is-loading]="list.isLoading()">
          <thead><tr><th>Commessa</th><th>Committente</th><th>Stato</th><th class="num">Osservazioni aperte</th><th class="num">In approvazione</th><th>Ultimo sopralluogo</th><th>Aggiornata</th></tr></thead>
          <tbody>
            @for (p of items(); track p.id) {
              <tr class="is-link" (click)="open(p.id)" (keydown.enter)="open(p.id)" tabindex="0">
                <td><div style="font-weight:500">{{ p.title }} @if (p.isDemo) { <span class="badge badge-plain">Demo</span> }</div><div class="muted small mono">{{ p.code }} · {{ p.municipality }}</div></td>
                <td>{{ p.clientName ?? '—' }}</td>
                <td><span class="badge" [class.badge-success]="p.status === 'ACTIVE'" [class.badge-warning]="p.status === 'SUSPENDED'" [class.badge-plain]="p.status === 'ARCHIVED'">{{ statusLabel[p.status] }}</span></td>
                <td class="num">@if (p.pinsOpen) { <b>{{ p.pinsOpen }}</b> } @else { <span class="muted">0</span> }</td>
                <td class="num">@if (p.drawingsAwaitingApproval) { <b>{{ p.drawingsAwaitingApproval }}</b> } @else { <span class="muted">0</span> }</td>
                <td class="muted">{{ p.lastVisitAt ? rel(p.lastVisitAt) : '—' }}</td>
                <td class="muted">{{ rel(p.updatedAt) }}</td>
              </tr>
            } @empty {
              @if (!list.isLoading()) {
                <tr><td colspan="7">
                  @if (query() || filter() !== 'ALL') {
                    <ui-empty icon="search" title="Nessuna commessa trovata" text="Prova a cambiare i filtri o la ricerca." />
                  } @else {
                    <ui-empty icon="folder" title="Nessuna commessa" text="Crea la prima commessa: il committente riceverà il link al portale." />
                  }
                </td></tr>
              }
            }
          </tbody>
        </table>
        @if (pages() > 1) {
          <div class="pager">
            <button class="btn btn-outline btn-sm" [disabled]="page() <= 1" (click)="page.set(page() - 1)"><ui-icon name="chevron-left" [size]="14" /> Precedenti</button>
            <span class="muted small">Pagina {{ page() }} di {{ pages() }}</span>
            <button class="btn btn-outline btn-sm" [disabled]="page() >= pages()" (click)="page.set(page() + 1)">Successive <ui-icon name="chevron-right" [size]="14" /></button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .chips { gap: 6px; flex-wrap: wrap; }
    .search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--muted); min-width: min(100%, 320px); }
    .search input { border: 0; outline: 0; background: transparent; font: inherit; color: var(--ink); flex: 1; min-width: 0; }
    .card { overflow-x: auto; }
    .is-loading { opacity: 0.55; transition: opacity 0.15s; }
    .pager { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--line); }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class ProjectsList {
  private readonly api = inject(ProjectsApi);
  private readonly router = inject(Router);
  protected readonly tenant = inject(TenantContext);
  protected readonly val = val;
  protected readonly rel = fmtRelative;
  protected readonly filters = FILTERS;
  protected readonly statusLabel = PROJECT_STATUS_LABEL;

  /** `?nuova=1` apre la finestra (pulsante nella topbar); `?q=` arriva dalla ricerca globale. */
  readonly nuova = input<string>();
  readonly q = input<string>();

  protected readonly dialogOpen = linkedSignal(() => this.nuova() === '1');
  protected readonly filter = signal<Filter>('ALL');
  protected readonly query = linkedSignal(() => this.q() ?? '');
  private readonly debouncedQuery = linkedSignal(() => this.q() ?? '');
  protected readonly page = signal(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly list = resource({
    params: () => ({ status: this.filter(), q: this.debouncedQuery().trim(), page: this.page() }),
    loader: ({ params }) =>
      this.api.list({
        status: params.status === 'ALL' ? undefined : params.status,
        q: params.q || undefined,
        page: params.page,
        pageSize: PAGE_SIZE,
      }),
  });

  protected readonly items = computed(() => (this.list.hasValue() ? this.list.value().items : []));
  protected readonly total = computed(() => (this.list.hasValue() ? this.list.value().meta.total : 0));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly subtitle = computed(() => (this.list.hasValue() ? (this.total() === 1 ? '1 commessa' : `${this.total()} commesse`) : ''));
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    this.page.set(1);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.debouncedQuery.set(value);
      this.page.set(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
    if (this.nuova()) void this.router.navigate(['/commesse'], { replaceUrl: true });
  }

  protected open(id: string): void {
    void this.router.navigate(['/commesse', id]);
  }
}
