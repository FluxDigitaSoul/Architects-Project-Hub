import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { PortalApi } from '../../core/api/portal-api';
import { Icon } from '../../shared/ui/icon';
import { val } from '../../shared/dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Richiesta di un nuovo link di accesso (AFU FR-M1-05 punto 7): il committente inserisce l'email
 * con cui lo studio lo ha registrato. La risposta è sempre la stessa (nessuna enumerazione).
 */
@Component({
  selector: 'app-portal-request-link',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box card">
      <span class="ic"><ui-icon [name]="sent() ? 'mail' : 'lock'" [size]="22" /></span>
      @if (sent()) {
        <h2>Controlla la posta</h2>
        <p class="muted">{{ sent() }}</p>
        <p class="muted small">Non trovi l'email? Guarda nella cartella spam o contatta lo studio.</p>
      } @else {
        <h2>{{ title() }}</h2>
        <p class="muted">{{ intro() }}</p>
        @if (studio()) {
          <form (submit)="submit($event)" novalidate>
            <label class="field"><span>La tua email</span>
              <input class="input" type="email" autocomplete="email" [value]="email()" (input)="email.set(val($event))" required /></label>
            @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
            <button class="btn btn-primary" type="submit" [disabled]="!valid() || busy()">{{ busy() ? 'Invio…' : 'Inviami un nuovo link' }}</button>
          </form>
        } @else {
          <p class="muted small">Apri il link che hai ricevuto via email dallo studio oppure chiedi allo studio di inviartene uno nuovo.</p>
        }
      }
    </div>
  `,
  styles: `
    .box { max-width: 440px; margin: 8vh auto 0; padding: 28px; display: grid; gap: 10px; justify-items: center; text-align: center; }
    .ic { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--primary-soft); color: var(--color-primary); }
    form { display: grid; gap: 12px; width: 100%; text-align: left; margin-top: 6px; }
    .field { display: grid; gap: 6px; font-size: 13.5px; font-weight: 500; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class PortalRequestLink {
  /** Slug dello studio (da ?studio= o dall'ultimo portale aperto su questo dispositivo). */
  readonly studio = input<string | null>(null);
  /** Motivo: link scaduto/revocato oppure sessione assente. */
  readonly reason = input<'expired' | 'none'>('none');

  private readonly api = inject(PortalApi);
  protected readonly val = val;
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(() => EMAIL_RE.test(this.email().trim()));
  protected readonly title = computed(() => (this.reason() === 'expired' ? 'Il link non è più valido' : 'Accedi al portale'));
  protected readonly intro = computed(() =>
    this.reason() === 'expired'
      ? 'Il link è scaduto o è stato sostituito da uno più recente. Ricevine uno nuovo via email.'
      : 'Per entrare serve il link personale che lo studio ti ha inviato. Se non lo trovi, ricevine uno nuovo.',
  );

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    const slug = this.studio();
    if (!slug || !this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.sent.set((await this.api.requestLink(slug, this.email().trim().toLowerCase())).message);
    } catch (err) {
      this.error.set(toApiError(err).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
