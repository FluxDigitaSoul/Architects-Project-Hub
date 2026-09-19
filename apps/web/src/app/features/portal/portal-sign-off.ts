import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { PortalApi } from '../../core/api/portal-api';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { val } from '../../shared/dom';

type Step = 'summary' | 'otp' | 'done';

/**
 * Approvazione formale di una tavola (AFU FR-M2-15, BR-10): dichiarazione generata dal server,
 * presa visione delle osservazioni aperte, codice OTP via email. L'approvazione congela la versione.
 */
@Component({
  selector: 'app-portal-sign-off',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Approva la tavola" [width]="560" (closed)="close()">
      @switch (step()) {
        @case ('summary') {
          @if (info.value(); as i) {
            <div class="eyebrow">{{ label() }}</div>
            @if (i.openPins > 0) {
              <div class="warn">Ci sono <b>{{ i.openPins }}</b> osservazioni ancora aperte. Approvando accetti la tavola così com'è.</div>
              <label class="check"><input type="checkbox" [checked]="pinsAck()" (change)="pinsAck.set(checked($event))" /> <span>Ho preso visione delle osservazioni aperte</span></label>
            }
            <blockquote>{{ i.declarationText }}</blockquote>
            <label class="check"><input type="checkbox" [checked]="accepted()" (change)="accepted.set(checked($event))" /> <span>Ho letto e accetto la dichiarazione</span></label>
            <p class="muted small">Per confermare ti invieremo un codice di 6 cifre via email.</p>
          } @else if (info.error()) {
            <p class="err">{{ infoError() }}</p>
          } @else { <p class="muted">Caricamento…</p> }
        }
        @case ('otp') {
          <p>Abbiamo inviato un codice di 6 cifre a <b>{{ sentTo() }}</b>. Inseriscilo per confermare l'approvazione. Il codice vale 10 minuti.</p>
          <form class="otp-form" (submit)="$event.preventDefault(); approve()">
            <input class="input otp mono" inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Codice di conferma"
              [value]="code()" (input)="code.set(digits($event))" autofocus />
          </form>
          <button class="linkish small" type="button" [disabled]="busy()" (click)="sendCode()">Non è arrivato? Invia un nuovo codice</button>
        }
        @case ('done') {
          <div class="done">
            <span class="okic"><ui-icon name="check" [size]="26" /></span>
            <h3>Tavola approvata</h3>
            <p>Codice di verifica <b class="mono">{{ verification() }}</b></p>
            <p class="muted small">Riceverai via email il riepilogo in PDF con i dati dell'approvazione. Lo studio è già stato avvisato.</p>
          </div>
        }
      }
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        @switch (step()) {
          @case ('summary') {
            <button class="btn btn-outline" (click)="close()">Annulla</button>
            <button class="btn btn-primary" [disabled]="!canContinue() || busy()" (click)="sendCode()">{{ busy() ? 'Invio…' : 'Invia il codice' }}</button>
          }
          @case ('otp') {
            <button class="btn btn-outline" (click)="step.set('summary')">Indietro</button>
            <button class="btn btn-primary" [disabled]="code().length !== 6 || busy()" (click)="approve()">{{ busy() ? 'Verifica…' : 'Conferma approvazione' }}</button>
          }
          @case ('done') { <button class="btn btn-primary" (click)="close()">Chiudi</button> }
        }
      </div>
    </ui-dialog>
  `,
  styles: `
    .warn { padding: 10px 12px; border-radius: 8px; background: var(--warning-soft); font-size: 13.5px; }
    blockquote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--color-primary); background: var(--surface-2); font-size: 13.5px; line-height: 1.5; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; }
    .check input { margin-top: 3px; }
    .otp-form { display: grid; }
    .otp { font-size: 26px; letter-spacing: 0.4em; text-align: center; height: 56px; max-width: 260px; justify-self: center; }
    .linkish { background: none; border: 0; padding: 0; color: var(--color-primary); cursor: pointer; justify-self: center; }
    .done { display: grid; gap: 8px; justify-items: center; text-align: center; padding: 8px 0; }
    .okic { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--success-soft); color: var(--success); }
    .alert, .err { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class PortalSignOff {
  readonly open = input(false);
  readonly versionId = input.required<string>();
  readonly label = input('');
  readonly closed = output<void>();
  readonly approved = output<void>();

  private readonly api = inject(PortalApi);
  protected readonly step = signal<Step>('summary');
  protected readonly accepted = signal(false);
  protected readonly pinsAck = signal(false);
  protected readonly challengeId = signal<string | null>(null);
  protected readonly sentTo = signal('');
  protected readonly code = signal('');
  protected readonly verification = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly info = resource({
    params: () => (this.open() ? this.versionId() : undefined),
    loader: ({ params }) => this.api.signOffInfo(params),
  });
  protected readonly infoError = computed(() => toApiError(this.info.error()).userMessage);
  protected readonly canContinue = computed(() => {
    const i = this.info.value();
    return !!i && i.canApprove && this.accepted() && (i.openPins === 0 || this.pinsAck());
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.step.set('summary');
      this.accepted.set(false);
      this.pinsAck.set(false);
      this.challengeId.set(null);
      this.code.set('');
      this.error.set(null);
    });
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected digits(e: Event): string {
    return val(e).replace(/\D/g, '').slice(0, 6);
  }

  protected async sendCode(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.requestOtp();
      this.challengeId.set(r.challengeId);
      this.sentTo.set(r.sentTo);
      this.code.set('');
      this.step.set('otp');
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }

  protected async approve(): Promise<void> {
    const challengeId = this.challengeId();
    if (!challengeId || this.code().length !== 6 || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.approve(this.versionId(), {
        challengeId, code: this.code(), declarationAccepted: true, openPinsAcknowledged: this.pinsAck(),
      });
      this.verification.set(r.verificationCode);
      this.step.set('done');
      this.approved.emit();
    } catch (e) {
      const err = toApiError(e);
      const left = err.details?.['attemptsLeft'];
      this.error.set(typeof left === 'number' && left > 0 ? `${err.message} Tentativi rimasti: ${left}.` : err.userMessage);
      this.code.set('');
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
