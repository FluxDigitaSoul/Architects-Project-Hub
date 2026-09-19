import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PortalApi } from '../../core/api/portal-api';
import { fmtDate } from '../../core/data/format';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { ReviewWorkspace } from '../review/review-workspace';
import { PortalSession } from './portal-session';
import { PortalSignOff } from './portal-sign-off';

const MIN_REQUEST_LENGTH = 5;

/** Tavola nel portale (AFU FR-M2-06..17): osservazioni, approvazione con OTP, richieste di modifica. */
@Component({
  selector: 'app-portal-drawing',
  imports: [RouterLink, Dialog, EmptyState, Icon, ReviewWorkspace, PortalSignOff],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a routerLink="/portale" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> Tutte le tavole</a>
    @if (entry(); as d) {
      <div class="head">
        <div>
          <div class="eyebrow">@if (d.sheetCode) { {{ d.sheetCode }} · } versione {{ d.version }}</div>
          <h1>{{ d.title }}</h1>
          @if (d.notes) { <p class="muted notes">{{ d.notes }}</p> }
        </div>
        @if (otherVersions().length) {
          <div class="versions small">Altre versioni:
            @for (o of otherVersions(); track o.versionId) { <a [routerLink]="['/portale/tavole', o.versionId]">v{{ o.version }}</a> }
          </div>
        }
      </div>
      @if (d.status === 'SUPERSEDED') {
        <div class="notice small"><ui-icon name="info" [size]="15" /> Questa versione è stata sostituita da una più recente: la trovi nell'elenco delle tavole.</div>
      }

      <app-review-workspace #ws [backend]="api.backend" [versionId]="d.versionId" [canComment]="!session.readOnly()"
        [canDownload]="d.downloadAllowed" (changed)="drawings.reload()">
        <div review-actions class="actions">
          @if (d.status === 'PUBLISHED' && !session.readOnly()) {
            @if (session.context()?.contact?.isSigner) {
              <button class="btn btn-primary full" (click)="signOffOpen.set(true)"><ui-icon name="check" [size]="16" /> Approva questa versione</button>
              @if (d.reviewDueDate) { <p class="muted small center">Revisione richiesta entro il {{ date(d.reviewDueDate) }}</p> }
            } @else {
              <p class="muted small">Puoi commentare la tavola. L'approvazione spetta al firmatario indicato dallo studio.</p>
            }
          }
          @if (d.status === 'APPROVED' && !session.readOnly()) {
            <p class="muted small">Tavola approvata. Per altre modifiche invia una richiesta allo studio: la valuterà e ti risponderà qui.</p>
            <button class="btn btn-outline full" (click)="changeOpen.set(true)"><ui-icon name="message" [size]="16" /> Richiedi una modifica</button>
          }
        </div>
      </app-review-workspace>

      <app-portal-sign-off [open]="signOffOpen()" [versionId]="d.versionId" [label]="(d.sheetCode ? d.sheetCode + ' · ' : '') + d.title + ' · versione ' + d.version"
        (closed)="signOffOpen.set(false)" (approved)="onApproved()" />

      <ui-dialog [open]="changeOpen()" title="Richiedi una modifica" [width]="520" (closed)="changeOpen.set(false)">
        <p class="muted small">Descrivi cosa vorresti cambiare. Lo studio valuterà se rientra nell'incarico e ti risponderà.</p>
        <textarea class="input area" rows="5" maxlength="5000" [value]="request()" (input)="request.set(val($event))" aria-label="Descrizione della modifica"></textarea>
        @if (requestError(); as e) { <div class="alert" role="alert">{{ e }}</div> }
        <div dialog-actions>
          <button class="btn btn-outline" (click)="changeOpen.set(false)">Annulla</button>
          <button class="btn btn-primary" [disabled]="request().trim().length < minRequest || busy()" (click)="sendRequest(d.versionId)">Invia richiesta</button>
        </div>
      </ui-dialog>
    } @else if (drawings.error()) {
      <div class="card"><ui-empty icon="alert" title="Tavola non disponibile" [text]="errorText()" /></div>
    } @else if (drawings.value()) {
      <div class="card"><ui-empty icon="file" title="Tavola non trovata" text="Potrebbe essere stata ritirata dallo studio." /></div>
    } @else { <div class="card skeleton"></div> }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 14px; }
    .head h1 { margin-top: 4px; }
    .notes { margin: 6px 0 0; max-width: 720px; white-space: pre-wrap; }
    .versions { display: flex; gap: 8px; align-items: center; color: var(--muted); }
    .versions a { color: var(--color-primary); font-weight: 500; }
    .notice { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--surface-2); margin-bottom: 12px; }
    .actions { padding: 12px 16px; display: grid; gap: 8px; }
    .actions:empty { display: none; }
    .full { width: 100%; justify-content: center; }
    .center { text-align: center; margin: 0; }
    .area { height: auto; padding-top: 8px; resize: vertical; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    .skeleton { height: 60vh; }
  `,
})
export class PortalDrawing {
  readonly versionId = input.required<string>();
  protected readonly api = inject(PortalApi);
  protected readonly session = inject(PortalSession);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly date = fmtDate;
  protected readonly minRequest = MIN_REQUEST_LENGTH;
  private readonly workspace = viewChild<ReviewWorkspace>('ws');

  protected readonly drawings = resource({ loader: () => this.api.drawings() });
  protected readonly entry = computed(() => this.drawings.value()?.find((d) => d.versionId === this.versionId()) ?? null);
  protected readonly otherVersions = computed(() => {
    const e = this.entry();
    return e ? (this.drawings.value() ?? []).filter((d) => d.drawingId === e.drawingId && d.versionId !== e.versionId) : [];
  });
  protected readonly errorText = computed(() => toApiError(this.drawings.error()).userMessage);

  protected readonly signOffOpen = signal(false);
  protected readonly changeOpen = signal(false);
  protected readonly request = signal('');
  protected readonly requestError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected onApproved(): void {
    this.drawings.reload();
    this.workspace()?.reload();
  }

  protected async sendRequest(versionId: string): Promise<void> {
    this.busy.set(true);
    this.requestError.set(null);
    try {
      await this.api.requestChange(versionId, this.request().trim());
      this.changeOpen.set(false);
      this.request.set('');
      this.toaster.show('Richiesta inviata allo studio');
    } catch (e) {
      this.requestError.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
