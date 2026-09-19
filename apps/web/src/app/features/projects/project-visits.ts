import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { FieldApi, VISIT_STATUS_LABEL, VISIT_TYPE_LABEL } from '../../core/api/field-api';
import { fmtDateTime } from '../../core/data/format';
import { FieldOps } from '../../core/field/field-ops';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';

/** Sopralluoghi della commessa (AFU FR-M4-02/03): elenco numerato e avvio di un nuovo sopralluogo. */
@Component({
  selector: 'app-project-visits',
  imports: [EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-between head">
      <p class="muted">Ogni sopralluogo produce un verbale numerato. Dal telefono puoi scattare foto e registrare note anche senza rete.</p>
      @if (canStart()) { <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="start()"><ui-icon name="plus" [size]="14" /> Nuovo sopralluogo</button> }
    </div>
    <div class="card">
      @if (list.error()) {
        <div class="error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else if (list.value(); as rows) {
        @if (rows.length) {
          <table class="table">
            <thead><tr><th>Verbale</th><th>Tipo</th><th>Data</th><th>Stato</th><th class="num">Foto</th><th class="num">Difformità</th></tr></thead>
            <tbody>
              @for (v of rows; track v.id) {
                <tr class="is-link" (click)="open(v.id)" (keydown.enter)="open(v.id)" tabindex="0">
                  <td><b>n. {{ v.number }}</b></td>
                  <td class="muted">{{ typeLabel[v.visitType] }}</td>
                  <td>{{ dt(v.startedAt) }}</td>
                  <td><span class="badge" [class.badge-plain]="v.status === 'DRAFT'" [class.badge-warning]="v.status === 'REVIEW'" [class.badge-success]="v.status === 'FINAL' || v.status === 'SENT'" [class.badge-danger]="v.status === 'CANCELLED'">{{ statusLabel[v.status] }}</span></td>
                  <td class="num">{{ v.photos }}</td>
                  <td class="num">@if (v.issues) { <b class="warn">{{ v.issues }}</b> } @else { <span class="muted">0</span> }</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <ui-empty icon="hardhat" title="Nessun sopralluogo" text="Avvia il primo sopralluogo quando sei in cantiere." />
        }
      } @else { <div class="skeleton"></div> }
    </div>
  `,
  styles: `
    .head { margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .card { overflow-x: auto; }
    .warn { color: var(--warning); }
    .skeleton { height: 140px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class ProjectVisits {
  readonly projectId = input.required<string>();
  readonly canStart = input(false);

  private readonly api = inject(FieldApi);
  private readonly ops = inject(FieldOps);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  protected readonly dt = fmtDateTime;
  protected readonly typeLabel = VISIT_TYPE_LABEL;
  protected readonly statusLabel = VISIT_STATUS_LABEL;
  protected readonly busy = signal(false);
  protected readonly list = resource({ params: () => this.projectId(), loader: ({ params }) => this.api.list(params) });
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);

  protected open(visitId: string): void {
    void this.router.navigate(['/commesse', this.projectId(), 'sopralluoghi', visitId]);
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    try {
      const v = await this.ops.startVisit(this.projectId());
      this.toaster.show(v.number ? `Sopralluogo n. ${v.number} avviato` : 'Sopralluogo avviato sul telefono: il numero arriva appena torna la rete');
      this.open(v.id);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(false);
    }
  }
}
