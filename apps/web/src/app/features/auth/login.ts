import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Icon } from '../../shared/ui/icon';
import { val } from '../../shared/dom';

/** Accesso degli utenti dello studio (AFU FR-MT-01). Mock: qualsiasi email valida entra. */
@Component({
  selector: 'app-login',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <aside class="hero">
        <div class="hero-brand">
          @if (tenant.branding().logoDataUrl; as logo) { <img [src]="logo" alt="" /> }
          @else { <span class="mark">{{ tenant.initials() }}</span> }
          <span>{{ tenant.branding().studioName || 'Project Hub' }}</span>
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
        <form class="form" (submit)="submit($event)">
          <h2>Accedi al tuo studio</h2>
          <p class="muted">Inserisci le credenziali per continuare.</p>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" class="input" type="email" autocomplete="email" placeholder="nome@studio.it" [value]="email()" (input)="email.set(val($event))" required />
          </div>
          <div class="field">
            <label for="pwd">Password</label>
            <input id="pwd" class="input" type="password" autocomplete="current-password" [value]="password()" (input)="password.set(val($event))" required />
          </div>
          <button class="btn btn-primary btn-lg" type="submit" [disabled]="!canSubmit()">Accedi <ui-icon name="arrow-right" [size]="16" /></button>
          <p class="muted small center">Non hai ancora uno studio? <a href="#" (click)="$event.preventDefault(); register()">Crea il tuo spazio</a></p>
        </form>
      </main>
    </div>
  `,
  styles: `
    .login { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .hero { display: flex; flex-direction: column; padding: 40px 48px; color: #fff; background:
      radial-gradient(900px 500px at 10% -10%, color-mix(in srgb, var(--color-primary) 60%, white) 0%, transparent 60%),
      linear-gradient(160deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 65%, #000)); }
    .hero-brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
    .hero-brand img { height: 28px; filter: brightness(0) invert(1); }
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
    @media (max-width: 860px) { .login { grid-template-columns: 1fr; } .hero { display: none; } }
  `,
})
export class Login {
  protected readonly tenant = inject(TenantContext);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly val = val;
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly canSubmit = computed(() => /.+@.+\..+/.test(this.email()) && this.password().length > 0);

  protected submit(e: Event): void {
    e.preventDefault();
    if (!this.canSubmit()) return;
    this.auth.login(this.email().trim().toLowerCase());
    void this.router.navigate(['/']);
  }

  protected register(): void {
    this.auth.login('nuovo.studio@example.com');
    this.tenant.reset();
    void this.router.navigate(['/onboarding']);
  }
}
