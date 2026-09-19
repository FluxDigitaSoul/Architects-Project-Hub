import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { ProjectsApi } from '../../core/api/projects-api';
import { CATEGORY_LABEL, type DrawingVersion, StudioReviewApi, VERSION_STATUS_LABEL } from '../../core/api/review-api';
import { fmtDate, fmtDateTime } from '../../core/data/format';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Confirmer } from '../../shared/ui/confirm';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { DrawingFormDialog } from './drawing-form-dialog';
import { FreezeLogDialog } from './freeze-log-dialog';
import { PublishDialog, type PublishItem } from './publish-dialog';
import { ReviewWorkspace } from './review-workspace';
import { UploadVersionDialog } from './upload-version-dialog';

/** Revisione di una tavola lato studio (AFU P-01, FR-M2-02..16): versioni, pubblicazione, osservazioni. */
@Component({
  selector: 'app-drawing-review',
  imports: [RouterLink, EmptyState, Icon, ReviewWorkspace, DrawingFormDialog, FreezeLogDialog, PublishDialog, UploadVersionDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a [routerLink]="['/commesse', id()]" [queryParams]="{ scheda: 'tavole' }" class="back muted small">
      <ui-icon name="chevron-left" [size]="14" /> {{ project.value()?.code }} · {{ project.value()?.title }}</a>

    @if (drawing(); as d) {
      <div class="head">
        <div>
          <div class="row" style="gap:8px">
            @if (d.sheetCode) { <span class="eyebrow">{{ d.sheetCode }}</span> }
            <span class="badge badge-plain">{{ categoryLabel[d.category] }}</span>
            @if (d.scale) { <span class="muted small mono">{{ d.scale }}</span> }
          </div>
          <h1>{{ d.title }}</h1>
        </div>
        <div class="row actions">
          @if (versions.value()?.length) {
            <label class="ver">Versione
              <select class="select select-sm" (change)="selectVersion($any($event.target).value)" aria-label="Versione">
                @for (v of versions.value(); track v.id) {
                  <option [value]="v.id" [selected]="v.id === current()?.id">v{{ v.number }} · {{ statusLabel[v.status] }}</option>
                }
              </select>
            </label>
          }
          @if (canManage()) {
            <button class="btn btn-ghost btn-sm" (click)="editOpen.set(true)"><ui-icon name="pen" [size]="14" /> Dati</button>
            <button class="btn btn-outline btn-sm" (click)="uploadOpen.set(true)"><ui-icon name="upload" [size]="14" /> Nuova versione</button>
          }
        </div>
      </div>

      @if (current(); as v) {
        <div class="bar">
          <span class="badge" [class.badge-plain]="v.status === 'DRAFT'" [class.badge-info]="v.status === 'PUBLISHED'" [class.badge-success]="v.status === 'APPROVED'" [class.badge-danger]="v.status === 'ERROR'">{{ statusLabel[v.status] }}</span>
          <span class="muted small">Caricata il {{ dt(v.uploadedAt) }}@if (v.publishedAt) { · pubblicata il {{ dt(v.publishedAt) }} }@if (v.reviewDueDate) { · revisione entro il {{ date(v.reviewDueDate) }} }</span>
          @if (v.revisionNote) { <span class="note small">“{{ v.revisionNote }}”</span> }
          <span class="spacer"></span>
          @if (canManage()) {
            @switch (v.status) {
              @case ('DRAFT') {
                <button class="btn btn-ghost btn-sm" (click)="discard(v)">Scarta</button>
                <button class="btn btn-primary btn-sm" (click)="openPublish(v)"><ui-icon name="send" [size]="14" /> Pubblica al committente</button>
              }
              @case ('PUBLISHED') { <button class="btn btn-ghost btn-sm" (click)="withdraw(v)">Ritira la pubblicazione</button> }
              @case ('ERROR') { <button class="btn btn-ghost btn-sm" (click)="discard(v)">Scarta</button> }
            }
          }
          @if (v.status === 'APPROVED' || v.status === 'SUPERSEDED') {
            <button class="btn btn-outline btn-sm" (click)="logOpen.set(true)"><ui-icon name="shield" [size]="14" /> Registro di approvazione</button>
          }
        </div>

        @if (v.status === 'ERROR') {
          <div class="card"><ui-empty icon="alert" title="File non valido" [text]="v.errorMessage ?? 'Il file non si può visualizzare.'">
            @if (canManage()) { <button class="btn btn-primary btn-sm" (click)="uploadOpen.set(true)">Carica un altro file</button> }
          </ui-empty></div>
        } @else if (v.status === 'PROCESSING') {
          <div class="card"><ui-empty icon="clock" title="Caricamento non completato" text="Il file di questa versione non è arrivato: scartala e caricala di nuovo." /></div>
        } @else {
          <app-review-workspace [backend]="backend()" [versionId]="v.id" [canComment]="writable()" [canDownload]="true" (changed)="drawings.reload()" />
        }

        <app-publish-dialog [open]="publishOpen()" [projectId]="id()" [items]="publishItems()" (closed)="publishOpen.set(false)" (published)="refresh()" />
        <app-freeze-log-dialog [open]="logOpen()" [projectId]="id()" [versionId]="v.id" (closed)="logOpen.set(false)" />
      } @else if (versions.value()) {
        <div class="card"><ui-empty icon="file" title="Nessuna versione" text="Carica il file della tavola per iniziare." /></div>
      }

      <app-upload-version-dialog [open]="uploadOpen()" [projectId]="id()" [drawingId]="d.id"
        [previousVersionId]="transferFrom()?.id ?? null" [previousOpenPins]="d.pinsOpen" (closed)="uploadOpen.set(false)" (uploaded)="onUploaded($event)" />
      <app-drawing-form-dialog [open]="editOpen()" [projectId]="id()" [editing]="d" (closed)="editOpen.set(false)" (saved)="drawings.reload()" />
    } @else if (drawings.error()) {
      <div class="card"><ui-empty icon="file" title="Impossibile aprire la tavola" [text]="errorText()" /></div>
    } @else if (drawings.value()) {
      <div class="card"><ui-empty icon="file" title="Tavola non trovata" text="Non esiste o è stata rimossa." /></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
    .head h1 { margin-top: 4px; }
    .actions { gap: 8px; flex-wrap: wrap; align-items: center; }
    .ver { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); }
    .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .note { font-style: italic; color: var(--ink-2); }
    .spacer { flex: 1; }
  `,
})
export class DrawingReview {
  readonly id = input.required<string>();
  readonly drawingId = input.required<string>();
  /** Versione aperta, da `?versione=` (link condivisibili e tasto Indietro). */
  readonly versione = input<string>();

  private readonly review = inject(StudioReviewApi);
  private readonly projects = inject(ProjectsApi);
  private readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly statusLabel = VERSION_STATUS_LABEL;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly dt = fmtDateTime;
  protected readonly date = fmtDate;

  protected readonly project = resource({ params: () => this.id(), loader: ({ params }) => this.projects.detail(params) });
  protected readonly drawings = resource({ params: () => this.id(), loader: ({ params }) => this.review.drawings(params) });
  protected readonly versions = resource({
    params: () => ({ p: this.id(), d: this.drawingId() }),
    loader: ({ params }) => this.review.versions(params.p, params.d),
  });

  protected readonly drawing = computed(() => this.drawings.value()?.find((d) => d.id === this.drawingId()) ?? null);
  protected readonly backend = computed(() => this.review.backend(this.id()));
  protected readonly selectedId = linkedSignal(() => this.versione() ?? null);
  protected readonly current = computed<DrawingVersion | null>(() => {
    const list = this.versions.value() ?? [];
    return list.find((v) => v.id === this.selectedId()) ?? list.find((v) => v.status !== 'ERROR') ?? list[0] ?? null;
  });
  /** Versione da cui riportare le osservazioni aperte su una nuova versione. */
  protected readonly transferFrom = computed(() => (this.versions.value() ?? []).find((v) => v.status === 'PUBLISHED' || v.status === 'DRAFT') ?? null);
  protected readonly canManage = computed(() => this.tenant.canManage() && this.project.value()?.status === 'ACTIVE');
  protected readonly writable = computed(() => this.project.value()?.status === 'ACTIVE');
  protected readonly errorText = computed(() => toApiError(this.drawings.error()).userMessage);

  protected readonly uploadOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly publishOpen = signal(false);
  protected readonly logOpen = signal(false);
  protected readonly publishItems = signal<PublishItem[]>([]);

  protected selectVersion(id: string): void {
    this.selectedId.set(id);
    void this.router.navigate([], { queryParams: { versione: id }, replaceUrl: true });
  }

  protected openPublish(v: DrawingVersion): void {
    const d = this.drawing();
    this.publishItems.set([{ versionId: v.id, label: `${d?.sheetCode ? d.sheetCode + ' — ' : ''}${d?.title ?? ''} (versione ${v.number})` }]);
    this.publishOpen.set(true);
  }

  protected onUploaded(versionId: string): void {
    this.refresh();
    this.selectVersion(versionId);
  }

  protected refresh(): void {
    this.versions.reload();
    this.drawings.reload();
  }

  protected async withdraw(v: DrawingVersion): Promise<void> {
    const ok = await this.confirmer.ask({
      title: 'Ritirare la pubblicazione?',
      text: 'La versione torna in bozza e sparisce dal portale. Si può fare solo se il committente non l’ha ancora commentata.',
      confirmLabel: 'Ritira',
    });
    if (ok) await this.run(() => this.review.withdrawVersion(this.id(), this.drawingId(), v.id), 'Pubblicazione ritirata');
  }

  protected async discard(v: DrawingVersion): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Scartare la versione ${v.number}?`,
      text: 'La bozza viene eliminata e non sarà visibile a nessuno.',
      confirmLabel: 'Scarta', tone: 'danger',
    });
    if (!ok) return;
    await this.run(() => this.review.discard(this.id(), this.drawingId(), v.id), 'Versione scartata');
    this.selectedId.set(null);
  }

  private async run(action: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await action();
      this.toaster.show(success);
      this.refresh();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }
}
