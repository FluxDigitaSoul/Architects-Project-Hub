import { ChangeDetectionStrategy, Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { CHANGE_REQUEST_LABEL, type ChangeRequest, type ChangeRequestStatus, StudioReviewApi } from '../../core/api/review-api';
import { fmtDateTime } from '../../core/data/format';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const ASSESS_OPTIONS: ChangeRequestStatus[] = ['IN_REVIEW', 'ACCEPTED_IN_SCOPE', 'ACCEPTED_EXTRA_SCOPE', 'REJECTED', 'CLOSED'];
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/**
 * Richieste di modifica su tavole già approvate (AFU FR-M2-17): lo studio le valuta come
 * comprese nell'incarico, extra-incarico (con importo indicativo) o respinte.
 */
@Component({
  selector: 'app-project-change-requests',
  imports: [Dialog, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      @if (list.value(); as rows) {
        @if (rows.length) {
          <ul class="list">
            @for (r of rows; track r.id) {
              <li>
                <div class="row-between top">
                  <div><b>{{ r.drawingTitle }}</b> <span class="muted">· versione {{ r.versionNumber }}</span>
                    <div class="muted small">{{ r.requestedBy }} · {{ dt(r.createdAt) }}</div></div>
                  <span class="badge" [class.badge-warning]="r.status === 'SUBMITTED'" [class.badge-info]="r.status === 'IN_REVIEW'"
                    [class.badge-success]="r.status === 'ACCEPTED_IN_SCOPE' || r.status === 'ACCEPTED_EXTRA_SCOPE'" [class.badge-plain]="r.status === 'REJECTED' || r.status === 'CLOSED'">{{ label[r.status] }}</span>
                </div>
                <p class="desc">{{ r.description }}</p>
                @if (r.assessmentNote || r.indicativeAmountCents !== null) {
                  <p class="assess small"><b>Valutazione:</b> {{ r.assessmentNote }} @if (r.indicativeAmountCents !== null) { · importo indicativo {{ money(r.indicativeAmountCents) }} }</p>
                }
                @if (canManage() && r.status !== 'CLOSED') { <button class="btn btn-outline btn-sm" (click)="openAssess(r)">Valuta</button> }
              </li>
            }
          </ul>
        } @else {
          <ui-empty icon="message" title="Nessuna richiesta di modifica" text="Quando il committente chiede modifiche a una tavola già approvata, le trovi qui." />
        }
      } @else if (list.error()) {
        <div class="error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else { <div class="skeleton"></div> }
    </div>

    <ui-dialog [open]="assessing() !== null" title="Valuta la richiesta" [width]="540" (closed)="assessing.set(null)">
      @if (assessing(); as r) {
        <blockquote>{{ r.description }}</blockquote>
        <div class="field"><label for="cr-st">Esito</label>
          <select id="cr-st" class="select" (change)="status.set($any(val($event)))">
            @for (s of options; track s) { <option [value]="s" [selected]="s === status()">{{ label[s] }}</option> }
          </select></div>
        <div class="field"><label for="cr-note">Nota per il committente</label>
          <textarea id="cr-note" class="input" rows="3" maxlength="2000" [value]="note()" (input)="note.set(val($event))"></textarea></div>
        @if (status() === 'ACCEPTED_EXTRA_SCOPE') {
          <div class="field"><label for="cr-amt">Importo indicativo (€)</label>
            <input id="cr-amt" class="input mono" inputmode="decimal" placeholder="Es. 450,00" [value]="amount()" (input)="amount.set(val($event))" />
            @if (amount() && amountCents() === null) { <span class="hint is-error">Importo non valido.</span> }</div>
        }
        <label class="check"><input type="checkbox" [checked]="visible()" (change)="visible.set($any($event.target).checked)" /> <span>Mostra la valutazione al committente nel portale</span></label>
        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="assessing.set(null)">Annulla</button>
        <button class="btn btn-primary" [disabled]="busy() || (!!amount() && amountCents() === null)" (click)="save()">Salva</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { padding: 14px 18px; border-bottom: 1px solid var(--line); display: grid; gap: 8px; justify-items: start; }
    .list li:last-child { border-bottom: 0; }
    .top { width: 100%; align-items: flex-start; gap: 12px; }
    .desc { margin: 0; white-space: pre-wrap; }
    .assess { margin: 0; color: var(--ink-2); }
    blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--line-strong); background: var(--surface-2); white-space: pre-wrap; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    textarea.input { height: auto; padding-top: 8px; resize: vertical; }
    .hint.is-error { color: var(--danger); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    .skeleton { height: 120px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class ProjectChangeRequests {
  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  readonly changed = output<void>();

  private readonly api = inject(StudioReviewApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly dt = fmtDateTime;
  protected readonly label = CHANGE_REQUEST_LABEL;
  protected readonly options = ASSESS_OPTIONS;

  protected readonly list = resource({ params: () => this.projectId(), loader: ({ params }) => this.api.changeRequests(params) });
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);

  protected readonly assessing = signal<ChangeRequest | null>(null);
  protected readonly status = signal<ChangeRequestStatus>('IN_REVIEW');
  protected readonly note = signal('');
  protected readonly amount = signal('');
  protected readonly visible = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** "1.250,50" → 125050 centesimi; null se non valido. */
  protected readonly amountCents = computed(() => {
    const raw = this.amount().trim().replace(/\./g, '').replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  });

  protected money(cents: number): string {
    return euro.format(cents / 100);
  }

  protected openAssess(r: ChangeRequest): void {
    this.status.set(r.status === 'SUBMITTED' ? 'IN_REVIEW' : r.status);
    this.note.set(r.assessmentNote ?? '');
    this.amount.set(r.indicativeAmountCents !== null ? (r.indicativeAmountCents / 100).toFixed(2).replace('.', ',') : '');
    this.visible.set(true);
    this.error.set(null);
    this.assessing.set(r);
  }

  protected async save(): Promise<void> {
    const r = this.assessing();
    if (!r) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.assessChangeRequest(this.projectId(), r.id, {
        status: this.status(),
        note: this.note().trim() || null,
        indicativeAmountCents: this.status() === 'ACCEPTED_EXTRA_SCOPE' ? this.amountCents() : null,
        visibleToClient: this.visible(),
      });
      this.toaster.show('Valutazione salvata');
      this.assessing.set(null);
      this.list.reload();
      this.changed.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
