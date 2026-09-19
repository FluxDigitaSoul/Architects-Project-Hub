import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from './dialog';

export interface ConfirmOptions {
  title: string;
  text: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Casella facoltativa (es. "revoca subito i link"). */
  checkbox?: { label: string; checked?: boolean };
  /** Campo di testo obbligatorio (es. motivo dell'annullamento). */
  input?: { label: string; minLength: number; placeholder?: string };
}

export interface ConfirmResult {
  checked: boolean;
  value: string;
}

interface Pending extends ConfirmOptions {
  resolve: (r: ConfirmResult | null) => void;
}

/** Conferma delle azioni irreversibili o importanti, con una finestra modale accessibile. */
@Injectable({ providedIn: 'root' })
export class Confirmer {
  readonly pending = signal<Pending | null>(null);

  /** Restituisce null se l'utente annulla. */
  ask(options: ConfirmOptions): Promise<ConfirmResult | null> {
    this.pending()?.resolve(null);
    return new Promise((resolve) => this.pending.set({ ...options, resolve }));
  }

  settle(result: ConfirmResult | null): void {
    const p = this.pending();
    this.pending.set(null);
    p?.resolve(result);
  }
}

@Component({
  selector: 'ui-confirm-host',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirmer.pending(); as p) {
      <ui-dialog [open]="true" [title]="p.title" [width]="480" (closed)="confirmer.settle(null)">
        <p>{{ p.text }}</p>
        @if (p.input; as i) {
          <div class="field"><label for="confirm-input">{{ i.label }}</label>
            <textarea id="confirm-input" class="input" rows="3" [placeholder]="i.placeholder ?? ''" [value]="value()" (input)="value.set($any($event.target).value)"></textarea>
            <span class="hint">Almeno {{ i.minLength }} caratteri.</span>
          </div>
        }
        @if (p.checkbox; as c) {
          <label class="check"><input type="checkbox" [checked]="checked()" (change)="checked.set($any($event.target).checked)" /> <span>{{ c.label }}</span></label>
        }
        <div dialog-actions>
          <button class="btn btn-outline" type="button" (click)="confirmer.settle(null)">Annulla</button>
          <button class="btn" type="button" [class.btn-danger]="p.tone === 'danger'" [class.btn-primary]="p.tone !== 'danger'" [disabled]="!canConfirm()"
            (click)="confirmer.settle({ checked: checked(), value: value().trim() })">{{ p.confirmLabel }}</button>
        </div>
      </ui-dialog>
    }
  `,
  styles: `
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; }
    .check input { margin-top: 3px; }
    textarea.input { height: auto; padding-top: 8px; resize: vertical; }
  `,
})
export class ConfirmHost {
  protected readonly confirmer = inject(Confirmer);
  protected readonly checked = signal(false);
  protected readonly value = signal('');
  protected readonly canConfirm = computed(() => {
    const p = this.confirmer.pending();
    return !p?.input || this.value().trim().length >= p.input.minLength;
  });

  constructor() {
    // Ogni nuova richiesta riparte dai valori iniziali.
    effect(() => {
      const p = this.confirmer.pending();
      this.checked.set(p?.checkbox?.checked ?? false);
      this.value.set('');
    });
  }
}
