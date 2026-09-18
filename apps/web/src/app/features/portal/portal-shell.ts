import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Icon } from '../../shared/ui/icon';
import { PortalContext } from './portal-context';

/** Guscio del portale del committente, con il marchio dello studio (AFU M2, NFR-BRAND-02). */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, Icon],
  providers: [PortalContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <a class="brand" [routerLink]="['/p', token()]">
        @if (tenant.branding().logoDataUrl; as logo) { <img [src]="logo" alt="" /> }
        @else { <span class="mark">{{ tenant.initials() }}</span> }
        <span>{{ tenant.branding().studioName || 'Studio' }}</span>
      </a>
      @if (portal.contact(); as c) {
        <span class="who"><span class="avatar">{{ c.name.charAt(0) }}</span><span class="small">{{ c.name }}</span></span>
      }
    </header>
    <main class="content">
      @if (portal.contact()) {
        <router-outlet />
      } @else {
        <div class="invalid card">
          <ui-icon name="alert" [size]="22" />
          <h2>Il link non è più valido</h2>
          <p class="muted">Contatta lo studio per ricevere un nuovo accesso.</p>
        </div>
      }
    </main>
    <footer class="foot muted small">{{ tenant.branding().studioName || 'Studio' }} · Portale di revisione riservato</footer>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .bar { height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; }
    .brand img { height: 26px; max-width: 160px; object-fit: contain; }
    .mark { width: 30px; height: 30px; border-radius: 8px; background: var(--color-primary); color: var(--color-primary-contrast); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
    .who { display: flex; align-items: center; gap: 8px; }
    .content { flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: 24px; }
    .invalid { max-width: 440px; margin: 10vh auto 0; padding: 32px; text-align: center; display: grid; gap: 8px; justify-items: center; color: var(--ink); }
    .foot { text-align: center; padding: 18px; }
    @media (max-width: 640px) { .content { padding: 16px 12px; } .bar { padding: 0 14px; } }
  `,
})
export class PortalShell {
  readonly token = input.required<string>();
  protected readonly tenant = inject(TenantContext);
  protected readonly portal = inject(PortalContext);

  constructor() {
    effect(() => this.portal.token.set(this.token()));
  }
}
