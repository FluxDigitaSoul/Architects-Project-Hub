import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { Drawing } from '../../core/models';
import { Dialog } from '../../shared/ui/dialog';
import { val } from '../../shared/dom';

/** Codice OTP simulato: in produzione arriva via email e si verifica lato server (FR-M2-15, NFR-SEC-05). */
const DEMO_OTP = '482913';
const MAX_ATTEMPTS = 5;

/** Approvazione formale: riepilogo, dichiarazione, verifica OTP (AFU FR-M2-15, BR-10). */
@Component({
  selector: 'app-sign-off-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Approva la tavola" [width]="560" (closed)="closed.emit()">
      @if (step() === 'summary') {
        <div class="sum">
          <div class="eyebrow">{{ drawing().code }} · versione {{ drawing().version }}</div>
          <b>{{ drawing().title }}</b>
        </div>
        @if (openPins() > 0) {
          <div class="warn">Ci sono <b>{{ openPins() }}</b> osservazioni ancora aperte. Approvando accetti la versione così com'è.</div>
        }
        <p class="decl">
          Io sottoscritto/a <b>{{ signer() }}</b> dichiaro di aver preso visione dell'elaborato <b>{{ drawing().code }} {{ drawing().title }}</b>
          versione {{ drawing().version }} e di approvarlo. Sono consapevole che eventuali successive richieste di modifica potranno
          essere considerate variazioni rispetto all'incarico.
        </p>
        <label class="check"><input type="checkbox" [checked]="accepted()" (change)="accepted.set($any($event.target).checked)" /> Ho letto e accetto</label>
      } @else {
        <p>Abbiamo inviato un codice di 6 cifre a <b>{{ maskedEmail() }}</b>. Inseriscilo per confermare.</p>
        <input class="input otp mono" inputmode="numeric" maxlength="6" autocomplete="one-time-code" [value]="code()" (input)="code.set(val($event))" />
        @if (error()) { <div class="err">{{ error() }}</div> }
        <div class="muted small">Demo: il codice è <b class="mono">{{ demoCode }}</b>. In produzione arriva via email e scade dopo 10 minuti.</div>
      }
      <div dialog-actions>
        @if (step() === 'summary') {
          <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
          <button class="btn btn-primary" [disabled]="!accepted()" (click)="step.set('otp')">Continua</button>
        } @else {
          <button class="btn btn-outline" (click)="step.set('summary')">Indietro</button>
          <button class="btn btn-primary" [disabled]="code().length !== 6 || locked()" (click)="verify()">Conferma approvazione</button>
        }
      </div>
    </ui-dialog>
  `,
  styles: `
    .sum { display: grid; gap: 2px; }
    .warn { background: var(--warning-soft); color: var(--warning); padding: 10px 12px; border-radius: 8px; font-size: 13px; }
    .decl { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; font-size: 13px; line-height: 1.6; color: var(--ink-2); }
    .otp { font-size: 24px; letter-spacing: 0.4em; text-align: center; height: 52px; }
    .err { color: var(--danger); font-size: 13px; }
  `,
})
export class SignOffDialog {
  readonly open = input(false);
  readonly drawing = input.required<Drawing>();
  readonly openPins = input(0);
  readonly signer = input.required<string>();
  readonly email = input.required<string>();
  readonly closed = output<void>();
  readonly confirmed = output<void>();

  protected readonly val = val;
  protected readonly demoCode = DEMO_OTP;
  protected readonly step = signal<'summary' | 'otp'>('summary');
  protected readonly accepted = signal(false);
  protected readonly code = signal('');
  protected readonly error = signal('');
  private readonly attempts = signal(0);
  protected readonly locked = computed(() => this.attempts() >= MAX_ATTEMPTS);
  protected readonly maskedEmail = computed(() => this.email().replace(/^(.).*(@.*)$/, '$1***$2'));

  constructor() {
    effect(() => {
      if (this.open()) {
        this.step.set('summary');
        this.accepted.set(false);
        this.code.set('');
        this.error.set('');
      }
    });
  }

  protected verify(): void {
    if (this.code() === DEMO_OTP) {
      this.confirmed.emit();
      return;
    }
    this.attempts.update((n) => n + 1);
    this.error.set(this.locked() ? 'Troppi tentativi: riprova tra 15 minuti.' : `Codice non valido. Tentativi rimasti: ${MAX_ATTEMPTS - this.attempts()}.`);
  }
}
