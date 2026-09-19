import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { FieldApi } from '../../core/api/field-api';
import { fmtRelative } from '../../core/data/format';
import { FieldOps } from '../../core/field/field-ops';
import { MediaQueue } from '../../core/field/media-queue';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { Toaster } from '../../shared/ui/toast';

/**
 * Cantiere (AFU FR-M4-02): le commesse attive a cui sei assegnato, con verbali in bozza e
 * difformità aperte, per avviare subito un sopralluogo dal telefono.
 */
@Component({
  selector: 'app-field-list',
  imports: [RouterLink, EmptyState, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Cantiere" subtitle="I tuoi cantieri attivi: avvia un sopralluogo, scatta foto, detta le note." />
    @if (queue.pendingCount() + ops.pendingCount(); as n) {
      <div class="card sync small"><ui-icon name="refresh" [size]="15" /> {{ n === 1 ? '1 elemento' : n + ' elementi' }} (foto, note, modifiche ai verbali) in attesa di invio: partiranno da soli appena c'è rete.</div>
    }
    @if (sites.error()) {
      <div class="card error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="sites.reload()">Riprova</button></div>
    } @else if (sites.value(); as list) {
      <div class="grid grid-3">
        @for (s of list; track s.projectId) {
          <div class="card site">
            <a [routerLink]="['/commesse', s.projectId]" [queryParams]="{ scheda: 'sopralluoghi' }" class="info">
              <span class="eyebrow">{{ s.code }}</span>
              <b>{{ s.title }}</b>
              <span class="muted small">{{ s.municipality }} · {{ s.lastVisitAt ? 'ultimo sopralluogo ' + rel(s.lastVisitAt) : 'nessun sopralluogo' }}</span>
              <span class="row chips">
                @if (s.drafts) { <span class="badge badge-warning">{{ s.drafts }} in bozza</span> }
                @if (s.openActions) { <span class="badge badge-danger">{{ s.openActions }} difformità aperte</span> }
              </span>
            </a>
            <button class="btn btn-primary" [disabled]="busy() === s.projectId" (click)="start(s.projectId)"><ui-icon name="hardhat" [size]="16" /> Nuovo sopralluogo</button>
          </div>
        } @empty {
          <div class="card span"><ui-empty icon="hardhat" title="Nessun cantiere assegnato" text="Qui compaiono le commesse attive in cui fai parte del team. Chiedi di essere assegnato dalla scheda Team della commessa." /></div>
        }
      </div>
    } @else { <div class="grid grid-3">@for (i of [1, 2, 3]; track i) { <div class="card skeleton"></div> }</div> }
  `,
  styles: `
    .sync { display: flex; gap: 8px; align-items: center; padding: 10px 14px; margin-bottom: 12px; background: var(--info-soft); }
    .site { padding: 16px; display: grid; gap: 12px; }
    .info { display: grid; gap: 4px; color: inherit; }
    .chips { gap: 6px; flex-wrap: wrap; }
    .site .btn { justify-content: center; height: 44px; }
    .span { grid-column: 1 / -1; }
    .skeleton { height: 150px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class FieldList {
  private readonly api = inject(FieldApi);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  protected readonly queue = inject(MediaQueue);
  protected readonly ops = inject(FieldOps);
  protected readonly rel = fmtRelative;
  protected readonly busy = signal<string | null>(null);
  /** FR-M4-14: senza rete si vede l'ultimo elenco salvato sul telefono. */
  protected readonly sites = resource({ loader: () => this.ops.load('sites', () => this.api.sites()).then((r) => r.data) });
  protected readonly errorText = computed(() => toApiError(this.sites.error()).userMessage);

  protected async start(projectId: string): Promise<void> {
    this.busy.set(projectId);
    try {
      const v = await this.ops.startVisit(projectId);
      this.toaster.show(v.number ? `Sopralluogo n. ${v.number} avviato` : 'Sopralluogo avviato sul telefono: il numero arriva appena torna la rete');
      await this.router.navigate(['/commesse', projectId, 'sopralluoghi', v.id]);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(null);
    }
  }
}
