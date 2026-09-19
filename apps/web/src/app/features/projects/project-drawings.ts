import { ChangeDetectionStrategy, Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { CATEGORY_LABEL, type DrawingListItem, StudioReviewApi, VERSION_STATUS_LABEL } from '../../core/api/review-api';
import { fmtRelative } from '../../core/data/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { DrawingFormDialog } from '../review/drawing-form-dialog';
import { PublishDialog, type PublishItem } from '../review/publish-dialog';

/** Elaborati della commessa (AFU FR-M2-01..04): elenco, nuove tavole, pubblicazione di più bozze insieme. */
@Component({
  selector: 'app-project-drawings',
  imports: [EmptyState, Icon, DrawingFormDialog, PublishDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-between head">
      <p class="muted">Carica le tavole in bozza, controllale e pubblicale: i committenti ricevono una sola email con l'elenco.</p>
      @if (canManage()) {
        <div class="row" style="gap:8px">
          @if (selected().size) {
            <button class="btn btn-primary btn-sm" (click)="publishOpen.set(true)"><ui-icon name="send" [size]="14" /> Pubblica {{ selected().size }} {{ selected().size === 1 ? 'bozza' : 'bozze' }}</button>
          }
          <button class="btn btn-outline btn-sm" (click)="createOpen.set(true)"><ui-icon name="upload" [size]="14" /> Nuova tavola</button>
        </div>
      }
    </div>

    <div class="card">
      @if (list.error()) {
        <div class="error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else if (list.value(); as rows) {
        @if (rows.length) {
          <table class="table">
            <thead><tr>
              @if (canManage()) { <th class="sel"><span class="sr-only">Seleziona</span></th> }
              <th>Tavola</th><th>Tipo</th><th>Versione</th><th>Stato</th><th class="num">Osservazioni aperte</th><th>Aggiornata</th>
            </tr></thead>
            <tbody>
              @for (d of rows; track d.id) {
                <tr class="is-link" (click)="open(d)" (keydown.enter)="open(d)" tabindex="0">
                  @if (canManage()) {
                    <td class="sel" (click)="$event.stopPropagation()">
                      @if (d.latestVersion?.status === 'DRAFT') {
                        <input type="checkbox" [checked]="selected().has(d.latestVersion!.id)" (change)="toggle(d)" [attr.aria-label]="'Seleziona ' + d.title" />
                      }
                    </td>
                  }
                  <td>@if (d.sheetCode) { <b class="mono">{{ d.sheetCode }}</b> · } {{ d.title }}</td>
                  <td class="muted">{{ categoryLabel[d.category] }}</td>
                  <td class="mono">{{ d.latestVersion ? 'v' + d.latestVersion.number : '—' }}</td>
                  <td>
                    @if (d.latestVersion; as v) {
                      <span class="badge" [class.badge-plain]="v.status === 'DRAFT'" [class.badge-info]="v.status === 'PUBLISHED'" [class.badge-success]="v.status === 'APPROVED'" [class.badge-danger]="v.status === 'ERROR'">{{ statusLabel[v.status] }}</span>
                    } @else { <span class="muted">Senza file</span> }
                  </td>
                  <td class="num">@if (d.pinsOpen) { <b class="warn">{{ d.pinsOpen }}</b> } @else { <span class="muted">0</span> }</td>
                  <td class="muted">{{ rel(d.updatedAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <ui-empty icon="file" title="Nessuna tavola" text="Carica la prima tavola (PDF o immagine) per iniziare la revisione con il committente.">
            @if (canManage()) { <button class="btn btn-primary btn-sm" (click)="createOpen.set(true)">Carica una tavola</button> }
          </ui-empty>
        }
      } @else { <div class="skeleton"></div> }
    </div>

    <app-drawing-form-dialog [open]="createOpen()" [projectId]="projectId()" (closed)="createOpen.set(false)" (saved)="onCreated($event)" />
    <app-publish-dialog [open]="publishOpen()" [projectId]="projectId()" [items]="publishItems()" (closed)="publishOpen.set(false)" (published)="onPublished()" />
  `,
  styles: `
    .head { margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .card { overflow-x: auto; }
    .sel { width: 36px; }
    .warn { color: var(--warning); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .skeleton { height: 160px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class ProjectDrawings {
  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  readonly changed = output<void>();

  private readonly api = inject(StudioReviewApi);
  private readonly router = inject(Router);
  protected readonly rel = fmtRelative;
  protected readonly statusLabel = VERSION_STATUS_LABEL;
  protected readonly categoryLabel = CATEGORY_LABEL;

  protected readonly list = resource({ params: () => this.projectId(), loader: ({ params }) => this.api.drawings(params) });
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly createOpen = signal(false);
  protected readonly publishOpen = signal(false);
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);
  protected readonly publishItems = computed<PublishItem[]>(() =>
    (this.list.value() ?? [])
      .filter((d) => d.latestVersion && this.selected().has(d.latestVersion.id))
      .map((d) => ({ versionId: d.latestVersion!.id, label: `${d.sheetCode ? d.sheetCode + ' — ' : ''}${d.title} (versione ${d.latestVersion!.number})` })),
  );

  protected toggle(d: DrawingListItem): void {
    const id = d.latestVersion?.id;
    if (!id) return;
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected open(d: DrawingListItem): void {
    void this.router.navigate(['/commesse', this.projectId(), 'tavole', d.id]);
  }

  protected onCreated(drawingId: string): void {
    this.list.reload();
    this.changed.emit();
    void this.router.navigate(['/commesse', this.projectId(), 'tavole', drawingId]);
  }

  protected onPublished(): void {
    this.selected.set(new Set());
    this.list.reload();
    this.changed.emit();
  }
}
