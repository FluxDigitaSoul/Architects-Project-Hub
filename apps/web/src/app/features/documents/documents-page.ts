import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  type DocumentStatus,
  type DocumentType,
  DocumentsApi,
  SIGNABLE_TYPES,
} from '../../core/api/documents-api';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { val } from '../../shared/dom';
import { DocumentTable } from './document-table';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Archivio documentale dello studio (AFU FR-M5-06): tutti i verbali, le relazioni e i riepiloghi
 * delle commesse, con i filtri per tipo e stato e il promemoria dei documenti da firmare.
 */
@Component({
  selector: 'app-documents-page',
  imports: [Icon, PageHeader, DocumentTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Documenti" subtitle="Verbali, relazioni e riepiloghi di tutte le commesse." />

    @if (toSign() > 0) {
      <button class="card reminder" (click)="status.set('FINAL')"><ui-icon name="pen" [size]="16" />
        <span><b>{{ toSign() }} {{ toSign() === 1 ? 'documento da firmare' : 'documenti da firmare' }}</b> digitalmente prima dell'invio</span></button>
    }

    <div class="toolbar">
      <select class="select select-sm" (change)="type.set($any(val($event)) || null)" aria-label="Tipo">
        <option value="" [selected]="!type()">Tutti i tipi</option>
        @for (t of types; track t) { <option [value]="t" [selected]="t === type()">{{ typeLabel[t] }}</option> }
      </select>
      <select class="select select-sm" (change)="status.set($any(val($event)) || null)" aria-label="Stato">
        <option value="" [selected]="!status()">Tutti gli stati</option>
        @for (s of statuses; track s) { <option [value]="s" [selected]="s === status()">{{ statusLabel[s] }}</option> }
      </select>
      <label class="search"><ui-icon name="search" [size]="15" />
        <input placeholder="Cerca per titolo, numero o commessa…" [value]="query()" (input)="onQuery(val($event))" aria-label="Cerca documenti" /></label>
    </div>

    <div class="card" [class.is-loading]="list.isLoading()">
      @if (list.error()) {
        <div class="error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else if (list.value(); as rows) {
        <app-document-table [rows]="rows" [showProject]="true" [canManage]="tenant.canManage()" (changed)="list.reload()"
          emptyTitle="Nessun documento" emptyText="Genera un verbale dal sopralluogo o una relazione dal modulo R.A.I. della commessa." />
      } @else { <div class="skeleton"></div> }
    </div>
  `,
  styles: `
    .reminder { display: flex; gap: 10px; align-items: center; width: 100%; padding: 12px 16px; margin-bottom: 12px; border: 1px solid var(--warning); background: var(--warning-soft); font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .toolbar .select { width: auto; }
    .search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--muted); flex: 1; min-width: 220px; }
    .search input { border: 0; outline: 0; background: transparent; font: inherit; color: var(--ink); flex: 1; min-width: 0; }
    .is-loading { opacity: 0.6; }
    .skeleton { height: 200px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class DocumentsPage {
  private readonly api = inject(DocumentsApi);
  protected readonly tenant = inject(TenantContext);
  protected readonly val = val;
  protected readonly typeLabel = DOCUMENT_TYPE_LABEL;
  protected readonly statusLabel = DOCUMENT_STATUS_LABEL;
  protected readonly types = Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[];
  protected readonly statuses = Object.keys(DOCUMENT_STATUS_LABEL) as DocumentStatus[];

  protected readonly type = signal<DocumentType | null>(null);
  protected readonly status = signal<DocumentStatus | null>(null);
  protected readonly query = signal('');
  private readonly debounced = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly list = resource({
    params: () => ({ type: this.type() ?? undefined, status: this.status() ?? undefined, q: this.debounced().trim() || undefined }),
    loader: ({ params }) => this.api.studio(params),
  });
  /** Promemoria indipendente dai filtri: quanti documenti attendono la firma digitale. */
  private readonly pending = resource({ loader: () => this.api.studio({ status: 'FINAL' }) });
  protected readonly toSign = computed(() => (this.pending.value() ?? []).filter((d) => !d.signed && SIGNABLE_TYPES.includes(d.type)).length);
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onQuery(v: string): void {
    this.query.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debounced.set(v), SEARCH_DEBOUNCE_MS);
  }
}
