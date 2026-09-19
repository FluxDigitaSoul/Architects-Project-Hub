import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { StudioReviewApi } from '../../core/api/review-api';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

export interface PublishItem {
  versionId: string;
  label: string;
}

/**
 * Pubblicazione di una o più bozze (AFU FR-M2-04): la versione pubblicata precedente diventa
 * Superata e ogni committente riceve una sola email con l'elenco (AC-FR-M2-04-1).
 */
@Component({
  selector: 'app-publish-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" [title]="items().length === 1 ? 'Pubblica la tavola' : 'Pubblica ' + items().length + ' tavole'" [width]="540" (closed)="closed.emit()">
      <ul class="items">@for (i of items(); track i.versionId) { <li>{{ i.label }}</li> }</ul>
      <p class="muted small">I committenti vedranno queste versioni nel portale e potranno commentarle e approvarle. L'eventuale versione pubblicata precedente diventa "superata".</p>
      <div class="field"><label for="pub-due">Revisione richiesta entro <span class="muted">(facoltativo)</span></label>
        <input id="pub-due" class="input" type="date" [min]="today" [value]="due()" (input)="due.set(val($event))" /></div>
      <div class="field"><label for="pub-msg">Messaggio per i committenti <span class="muted">(facoltativo)</span></label>
        <textarea id="pub-msg" class="input" rows="3" maxlength="2000" placeholder="Es. Abbiamo aggiornato la distribuzione della cucina come concordato." [value]="message()" (input)="message.set(val($event))"></textarea></div>
      <label class="check"><input type="checkbox" [checked]="notify()" (change)="notify.set($any($event.target).checked)" /> <span>Avvisa i committenti via email</span></label>
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" [disabled]="busy()" (click)="publish()">{{ busy() ? 'Pubblicazione…' : 'Pubblica' }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .items { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-weight: 500; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    textarea.input { height: auto; padding-top: 8px; resize: vertical; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class PublishDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly items = input.required<PublishItem[]>();
  readonly closed = output<void>();
  readonly published = output<void>();

  private readonly api = inject(StudioReviewApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly due = signal('');
  protected readonly message = signal('');
  protected readonly notify = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.due.set('');
      this.message.set('');
      this.notify.set(true);
      this.error.set(null);
    });
  }

  protected async publish(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.publish(this.projectId(), {
        versionIds: this.items().map((i) => i.versionId),
        reviewDueDate: this.due() || null,
        message: this.message().trim() || null,
        notifyClients: this.notify(),
      });
      const what = r.published === 1 ? 'Tavola pubblicata' : `${r.published} tavole pubblicate`;
      this.toaster.show(this.notify() ? `${what} · ${r.notified} committenti avvisati` : what);
      this.published.emit();
      this.closed.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
