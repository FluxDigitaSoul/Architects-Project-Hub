import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Icon } from '../../shared/ui/icon';
import { val } from '../../shared/dom';

type Mode = 'login' | 'register' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/**
 * Accesso degli utenti dello studio con Supabase Auth (AFU FR-MT-01), registrazione
 * self-service (FR-M6-01) e recupero della password.
 */
@Component({
  selector: 'app-login',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <aside class="hero">
        <div class="hero-brand">
          <span class="mark">PH</span>
          <span>Project Hub</span>
        </div>
        <div class="hero-text">
          <h1>Dalla tavola al cantiere,<br />in un unico posto.</h1>
          <p>Revisioni con il committente, verifica R.A.I. e verbali di sopralluogo dal telefono. Con il marchio del tuo studio.</p>
          <ul>
            <li><ui-icon name="check" [size]="16" /> Approvazioni tracciate con prova digitale</li>
            <li><ui-icon name="check" [size]="16" /> Calcolo aeroilluminante in tempo reale</li>
            <li><ui-icon name="check" [size]="16" /> Verbale PDF pronto prima di lasciare il cantiere</li>
          </ul>
        </div>
        <div class="hero-foot muted small">Beta privata · Flux Digital Soul</div>
      </aside>
      <main class="panel">
        @if (notice(); as n) {
          <div class="form">
            <div class="notice"><ui-icon name="mail" [size]="20" /><div><strong>{{ n.title }}</strong><p class="muted">{{ n.text }}</p></div></div>
            <button class="btn btn-outline" type="button" (click)="switchTo('login')">Torna all'accesso</button>
          </div>
        } @else {
          <form class="form" (submit)="submit($event)" novalidate>
            @switch (mode()) {
              @case ('login') { <h2>Accedi al tuo studio</h2><p class="muted">Inserisci le credenziali per continuare.</p> }
              @case ('register') { <h2>Crea il tuo account</h2><p class="muted">Prova gratuita di 30 giorni, senza carta di credito.</p> }
              @case ('reset') { <h2>Recupera la password</h2><p class="muted">Ti inviamo un link per sceglierne una nuova.</p> }
            }

            @if (mode() === 'register') {
              <div class="grid grid-2">
                <div class="field"><label for="first">Nome</label>
                  <input id="first" class="input" autocomplete="given-name" [value]="firstName()" (input)="firstName.set(val($event))" required /></div>
                <div class="field"><label for="last">Cognome</label>
                  <input id="last" class="input" autocomplete="family-name" [value]="lastName()" (input)="lastName.set(val($event))" required /></div>
              </div>
            }
            <div class="field">
              <label for="email">Email</label>
              <input id="email" class="input" type="email" autocomplete="email" placeholder="nome@studio.it" [value]="email()" (input)="email.set(val($event))" required />
            </div>
            @if (mode() !== 'reset') {
              <div class="field">
                <label for="pwd">Password</label>
                <input id="pwd" class="input" type="password" [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
                  [value]="password()" (input)="password.set(val($event))" required />
                @if (mode() === 'register') { <span class="hint">Almeno {{ minPassword }} caratteri.</span> }
              </div>
            }
            @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }

            <button class="btn btn-primary btn-lg" type="submit" [disabled]="!canSubmit() || busy()">
              @switch (mode()) {
                @case ('login') { Accedi }
                @case ('register') { Crea account }
                @case ('reset') { Invia il link }
              }
              <ui-icon name="arrow-right" [size]="16" />
            </button>

            @switch (mode()) {
              @case ('login') {
                <p class="muted small center"><a href="#" (click)="$event.preventDefault(); switchTo('reset')">Password dimenticata?</a></p>
                <p class="muted small center">Non hai ancora uno studio? <a href="#" (click)="$event.preventDefault(); switchTo('register')">Crea il tuo spazio</a></p>
              }
              @default {
                <p class="muted small center">Hai già un account? <a href="#" (click)="$event.preventDefault(); switchTo('login')">Accedi</a></p>
              }
            }
          </form>
        }
      </main>
    </div>
  `,
  styles: `
    .login { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .hero { display: flex; flex-direction: column; padding: 40px 48px; color: #fff; background:
      radial-gradient(900px 500px at 10% -10%, color-mix(in srgb, var(--color-primary) 60%, white) 0%, transparent 60%),
      linear-gradient(160deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 65%, #000)); }
    .hero-brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
    .mark { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.18); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
    .hero-text { margin: auto 0; max-width: 460px; display: grid; gap: 18px; }
    .hero-text h1 { font-size: 34px; line-height: 1.15; letter-spacing: -0.02em; }
    .hero-text p { color: rgba(255,255,255,0.8); font-size: 15px; }
    .hero-text ul { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 10px; color: rgba(255,255,255,0.9); }
    .hero-text li { display: flex; gap: 10px; align-items: center; }
    .hero-foot { color: rgba(255,255,255,0.55); }
    .panel { display: grid; place-items: center; padding: 40px 24px; }
    .form { width: 100%; max-width: 380px; display: grid; gap: 16px; }
    .form h2 { font-size: 22px; }
    .center { text-align: center; }
    .center a { color: var(--color-primary); font-weight: 500; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft, #fef2f2); color: var(--danger, #b91c1c); font-size: 13.5px; }
    .notice { display: flex; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
    .notice p { margin: 4px 0 0; }
    @media (max-width: 860px) { .login { grid-template-columns: 1fr; } .hero { display: none; } }
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);
  protected readonly val = val;
  protected readonly minPassword = MIN_PASSWORD;

  protected readonly mode = signal<Mode>('login');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<{ title: string; text: string } | null>(null);

  protected readonly canSubmit = computed(() => {
    if (!EMAIL_RE.test(this.email().trim())) return false;
    switch (this.mode()) {
      case 'login': return this.password().length > 0;
      case 'register': return this.password().length >= MIN_PASSWORD && !!this.firstName().trim() && !!this.lastName().trim();
      case 'reset': return true;
    }
  });

  protected switchTo(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.notice.set(null);
    this.password.set('');
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const email = this.email().trim().toLowerCase();
    try {
      switch (this.mode()) {
        case 'login': return await this.doLogin(email);
        case 'register': return await this.doRegister(email);
        case 'reset': return await this.doReset(email);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async doLogin(email: string): Promise<void> {
    const result = await this.auth.login(email, this.password());
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.tenant.reset();
    await this.router.navigateByUrl('/');
  }

  private async doRegister(email: string): Promise<void> {
    const result = await this.auth.signUp(email, this.password(), this.firstName().trim(), this.lastName().trim());
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    if (result.needsConfirmation) {
      this.notice.set({
        title: 'Controlla la posta',
        text: `Abbiamo inviato un link di conferma a ${email}. Aprilo per attivare l'account e creare lo studio.`,
      });
      return;
    }
    this.tenant.reset();
    await this.router.navigateByUrl('/onboarding');
  }

  private async doReset(email: string): Promise<void> {
    await this.auth.resetPassword(email);
    // Risposta identica che l'email esista o no: non si rivela chi è registrato.
    this.notice.set({ title: 'Email inviata', text: `Se ${email} è registrata, riceverai un link per reimpostare la password.` });
  }
}
