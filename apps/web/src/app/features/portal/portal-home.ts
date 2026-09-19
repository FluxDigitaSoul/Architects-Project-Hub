import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PortalApi, type PortalDocument } from '../../core/api/portal-api';
import { CATEGORY_LABEL, CHANGE_REQUEST_LABEL } from '../../core/api/review-api';
import type { NotificationMode } from '../../core/api/studio-settings';
import { NotificationModePicker } from '../../shared/ui/notification-mode';
import { fmtDate, fmtRelative } from '../../core/data/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { PortalSession } from './portal-session';

export const DOC_TYPE_LABEL: Record<string, string> = {
  SITE_REPORT: 'Verbale di sopralluogo', RAI_REPORT: 'Relazione asseverata R.A.I.', RAI_CHECK: 'Verifica R.A.I.',
  APPROVAL_SUMMARY: 'Riepilogo di approvazione', PIN_EXPORT: 'Elenco osservazioni', UPLOAD: 'Documento',
};

/** Home del portale: tavole da rivedere e approvate, documenti condivisi, richieste di modifica. */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, EmptyState, Icon, NotificationModePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (session.context(); as c) {
      <div class="hero">
        <div class="eyebrow">{{ c.project.code }}</div>
        <h1>Ciao {{ session.firstName() }}, ecco il tuo progetto</h1>
        <p class="muted meta"><ui-icon name="map-pin" [size]="14" /> {{ c.project.title }} · {{ c.project.address }}</p>
      </div>
    }

    <h2>Da rivedere</h2>
    @if (drawings.value()) {
      <div class="grid grid-3">
        @for (d of toReview(); track d.versionId) {
          <a class="card dcard" [routerLink]="['tavole', d.versionId]">
            <div class="row-between"><span class="eyebrow">@if (d.sheetCode) { {{ d.sheetCode }} · } v{{ d.version }}</span><span class="badge badge-info">Da rivedere</span></div>
            <h3>{{ d.title }}</h3>
            <div class="muted small">{{ categoryLabel[d.category] }} · pubblicata {{ rel(d.publishedAt) }}</div>
            @if (d.reviewDueDate) { <div class="due small"><ui-icon name="calendar" [size]="13" /> Da rivedere entro il {{ date(d.reviewDueDate) }}</div> }
            <div class="foot small">@if (d.pinsOpen) { {{ d.pinsOpen }} osservazioni aperte } @else { Nessuna osservazione aperta }</div>
          </a>
        } @empty {
          <div class="card span"><ui-empty icon="check" title="Niente da rivedere" text="Quando lo studio pubblicherà nuove tavole, riceverai un'email e le troverai qui." /></div>
        }
      </div>

      @if (approved().length) {
        <h2>Approvate</h2>
        <div class="card"><ul class="list">
          @for (d of approved(); track d.versionId) {
            <li><a [routerLink]="['tavole', d.versionId]">
              <span class="ok"><ui-icon name="check" [size]="15" /></span>
              <span class="grow"><b>{{ d.title }}</b><span class="muted small">@if (d.sheetCode) { {{ d.sheetCode }} · } versione {{ d.version }}</span></span>
              <ui-icon name="chevron-right" [size]="16" class="muted" />
            </a></li>
          }
        </ul></div>
      }
    } @else if (drawings.error()) {
      <div class="card error-box">{{ error(drawings.error()) }} <button class="btn btn-outline btn-sm" (click)="drawings.reload()">Riprova</button></div>
    } @else { <div class="card skeleton"></div> }

    @if (documents.value()?.length) {
      <h2>Documenti</h2>
      <div class="card"><ul class="list">
        @for (doc of documents.value(); track doc.id) {
          <li><button class="rowbtn" (click)="download(doc)">
            <span class="docic"><ui-icon name="file" [size]="15" /></span>
            <span class="grow"><b>{{ doc.title }}</b>
              <span class="muted small">{{ docType(doc.type) }}@if (doc.number) { · n. {{ doc.number }} } · {{ date(doc.createdAt) }}@if (doc.signed) { · firmato digitalmente }</span></span>
            <ui-icon name="download" [size]="16" class="muted" />
          </button></li>
        }
      </ul></div>
    }

    @if (requests.value()?.length) {
      <h2>Le tue richieste di modifica</h2>
      <div class="card"><ul class="list">
        @for (r of requests.value(); track r.id) {
          <li class="req">
            <div class="row-between"><b>{{ r.drawingTitle }} · v{{ r.versionNumber }}</b><span class="badge badge-plain">{{ crLabel[r.status] }}</span></div>
            <p>{{ r.description }}</p>
            @if (r.assessmentNote) { <p class="muted small">Risposta dello studio: {{ r.assessmentNote }}</p> }
          </li>
        }
      </ul></div>
    }

    @if (mode(); as m) {
      <h2>Avvisi via email</h2>
      <div class="card card-body prefs">
        <p class="muted small">Quando lo studio risponde ai tuoi commenti o una revisione è in scadenza. I codici di conferma e i link di accesso arrivano sempre.</p>
        <ui-notification-mode name="portal-notifications" [value]="m" [disabled]="savingMode()" (changed)="setMode($event)" />
      </div>
    }
  `,
  styles: `
    .hero { margin-bottom: 18px; }
    .meta { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
    h2 { margin: 24px 0 12px; }
    .dcard { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; transition: box-shadow 0.15s; }
    .dcard:hover { box-shadow: var(--shadow-md); }
    .dcard h3 { font-size: 15px; line-height: 1.3; }
    .due { display: flex; gap: 5px; align-items: center; color: var(--warning); }
    .foot { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line); color: var(--ink-2); }
    .span { grid-column: 1 / -1; }
    .list { list-style: none; margin: 0; padding: 6px 0; }
    .list a, .rowbtn { display: flex; align-items: center; gap: 12px; padding: 10px 18px; width: 100%; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .list a:hover, .rowbtn:hover { background: var(--surface-2); }
    .grow { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .ok, .docic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: none; }
    .ok { background: var(--success-soft); color: var(--success); }
    .docic { background: var(--surface-2); color: var(--ink-2); }
    .req { padding: 12px 18px; display: grid; gap: 4px; border-bottom: 1px solid var(--line); }
    .req:last-child { border-bottom: 0; }
    .req p { margin: 0; white-space: pre-wrap; }
    .prefs { display: grid; gap: 12px; max-width: 640px; }
    .prefs p { margin: 0; }
    .skeleton { height: 140px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class PortalHome {
  protected readonly session = inject(PortalSession);
  private readonly api = inject(PortalApi);
  private readonly toaster = inject(Toaster);
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly crLabel = CHANGE_REQUEST_LABEL;
  protected readonly date = fmtDate;

  protected readonly drawings = resource({ loader: () => this.api.drawings() });
  protected readonly documents = resource({ loader: () => this.api.documents() });
  protected readonly requests = resource({ loader: () => this.api.changeRequests() });
  protected readonly mode = linkedSignal<NotificationMode | null>(() => this.session.context()?.contact.notificationMode ?? null);
  protected readonly savingMode = signal(false);

  /** FR-MT-06: il committente sceglie come ricevere gli avvisi; si salva subito. */
  protected async setMode(mode: NotificationMode): Promise<void> {
    const previous = this.mode();
    this.mode.set(mode);
    this.savingMode.set(true);
    try {
      await this.api.setNotificationMode(mode);
      this.toaster.show('Preferenza salvata');
    } catch (e) {
      this.mode.set(previous);
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.savingMode.set(false);
    }
  }

  /** Una sola card per tavola: l'ultima versione visibile (le superate restano consultabili dalla tavola). */
  private readonly latest = computed(() => {
    const seen = new Set<string>();
    return (this.drawings.value() ?? []).filter((d) => {
      if (d.status === 'SUPERSEDED' || seen.has(d.drawingId)) return false;
      seen.add(d.drawingId);
      return true;
    });
  });
  protected readonly toReview = computed(() => this.latest().filter((d) => d.status === 'PUBLISHED'));
  protected readonly approved = computed(() => this.latest().filter((d) => d.status === 'APPROVED'));

  protected rel(iso: string | null): string {
    return iso ? fmtRelative(iso) : '';
  }

  protected docType(type: string): string {
    return DOC_TYPE_LABEL[type] ?? 'Documento';
  }

  protected error(e: unknown): string {
    return toApiError(e).userMessage;
  }

  protected async download(doc: PortalDocument): Promise<void> {
    try {
      window.open((await this.api.documentUrl(doc.id)).url, '_blank', 'noopener');
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }
}
