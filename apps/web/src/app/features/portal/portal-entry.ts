import { ChangeDetectionStrategy, Component, type OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PortalRequestLink } from './portal-request-link';
import { PortalSession, rememberedStudio } from './portal-session';

/**
 * Ingresso dal Magic Link (AFU FR-M1-05): il token si scambia con una sessione (cookie HttpOnly)
 * e si passa subito a /portale, così il token non resta nella barra degli indirizzi né nella cronologia.
 */
@Component({
  selector: 'app-portal-entry',
  imports: [PortalRequestLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (failed()) {
      <div class="wrap"><app-portal-request-link [studio]="studio" reason="expired" /></div>
    } @else {
      <div class="wrap center muted"><span class="spinner"></span> Apertura del portale…</div>
    }
  `,
  styles: `
    .wrap { min-height: 100vh; padding: 16px; }
    .center { display: flex; gap: 10px; align-items: center; justify-content: center; }
    .spinner { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--color-primary); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class PortalEntry implements OnInit {
  readonly token = input.required<string>();
  private readonly session = inject(PortalSession);
  private readonly router = inject(Router);
  protected readonly failed = signal(false);
  protected readonly studio = rememberedStudio();

  async ngOnInit(): Promise<void> {
    if (await this.session.open(this.token())) {
      await this.router.navigateByUrl('/portale', { replaceUrl: true });
    } else {
      this.failed.set(true);
    }
  }
}
