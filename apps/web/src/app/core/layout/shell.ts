import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../auth/auth';
import { TenantContext } from '../tenant/tenant-context';
import { Icon, type IconName } from '../../shared/ui/icon';

interface NavItem {
  label: string;
  icon: IconName;
  path: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: 'home', path: '/', exact: true },
  { label: 'Commesse', icon: 'folder', path: '/commesse' },
  { label: 'Cantiere', icon: 'hardhat', path: '/cantiere' },
];

/** Struttura dell'app dello studio: sidebar + topbar (AFU NFR-UX-01). */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar">
        <a class="brand" routerLink="/" (click)="navOpen.set(false)">
          @if (tenant.branding().logoDataUrl; as logo) {
            <img [src]="logo" alt="" class="brand-logo" />
          } @else {
            <span class="brand-mark">{{ tenant.initials() }}</span>
          }
          <span class="brand-name">{{ tenant.branding().studioName || 'Project Hub' }}</span>
        </a>
        <nav class="nav">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }" (click)="navOpen.set(false)">
              <ui-icon [name]="item.icon" /> <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="sidebar-foot">
          <a routerLink="/impostazioni" routerLinkActive="is-active" (click)="navOpen.set(false)">
            <ui-icon name="settings" /> <span>Impostazioni</span>
          </a>
          <div class="plan-box">
            <div class="row-between"><span class="small" style="font-weight:600">Prova gratuita</span><span class="badge badge-primary badge-plain">Studio Pro</span></div>
            <div class="progress"><span style="width: 40%"></span></div>
            <div class="muted small">18 giorni rimanenti</div>
          </div>
        </div>
      </aside>
      <div class="backdrop" (click)="navOpen.set(false)"></div>

      <div class="main">
        <header class="topbar">
          <button class="btn btn-ghost btn-icon only-mobile" (click)="navOpen.set(true)" aria-label="Menu"><ui-icon name="menu" /></button>
          <label class="search">
            <ui-icon name="search" [size]="16" />
            <input type="search" placeholder="Cerca commesse, tavole, committenti…" />
            <span class="kbd">Ctrl K</span>
          </label>
          <div class="topbar-right">
            <button class="btn btn-primary btn-sm" (click)="router.navigate(['/commesse'], { queryParams: { nuova: 1 } })"><ui-icon name="plus" [size]="15" /> <span class="lbl">Nuova commessa</span></button>
            <div class="user">
              <span class="avatar">{{ auth.initials() }}</span>
              <div class="user-text">
                <div class="small" style="font-weight:600">{{ auth.session()?.name }}</div>
                <div class="muted" style="font-size:11.5px">{{ auth.session()?.email }}</div>
              </div>
              <button class="btn btn-ghost btn-icon" (click)="logout()" aria-label="Esci" title="Esci"><ui-icon name="logout" [size]="16" /></button>
            </div>
          </div>
        </header>
        <main class="content"><router-outlet /></main>
      </div>
    </div>
  `,
  styles: `
    .shell { min-height: 100vh; display: grid; grid-template-columns: var(--sidebar-w) 1fr; }
    .sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--line); padding: 14px 12px; gap: 6px; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 8px 10px 16px; font-weight: 600; font-size: 14px; min-width: 0; }
    .brand-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .brand-logo { height: 26px; max-width: 150px; object-fit: contain; }
    .brand-mark { width: 30px; height: 30px; border-radius: 8px; background: var(--color-primary); color: var(--color-primary-contrast); display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
    .nav, .sidebar-foot { display: flex; flex-direction: column; gap: 2px; }
    .nav a, .sidebar-foot a { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; color: var(--ink-2); font-weight: 500; font-size: 13.5px; transition: background 0.12s; }
    .nav a:hover, .sidebar-foot a:hover { background: var(--surface-2); }
    .nav a.is-active, .sidebar-foot a.is-active { background: var(--primary-soft); color: var(--color-primary); }
    .sidebar-foot { margin-top: auto; gap: 10px; }
    .plan-box { border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: grid; gap: 8px; background: var(--surface-2); }
    .main { min-width: 0; display: flex; flex-direction: column; }
    .topbar { height: var(--topbar-h); display: flex; align-items: center; gap: 14px; padding: 0 24px; background: color-mix(in srgb, var(--bg) 80%, white); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; backdrop-filter: blur(8px); }
    .search { flex: 1; min-width: 0; max-width: 460px; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--muted); }
    .search input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; color: var(--ink); min-width: 0; }
    .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
    .user { display: flex; align-items: center; gap: 10px; padding-left: 14px; border-left: 1px solid var(--line); }
    .user-text { line-height: 1.25; }
    .content { padding: 26px 28px 40px; max-width: 1380px; width: 100%; }
    .backdrop { display: none; }
    .only-mobile { display: none; }
    @media (max-width: 960px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: fixed; z-index: 20; width: var(--sidebar-w); transform: translateX(-100%); transition: transform 0.2s; }
      .nav-open .sidebar { transform: none; box-shadow: var(--shadow-md); }
      .nav-open .backdrop { display: block; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); z-index: 10; }
      .only-mobile { display: inline-flex; }
      .user-text, .search, .lbl { display: none; }
      .topbar-right { gap: 8px; }
      .user { padding-left: 8px; }
      .topbar { padding: 0 14px; }
      .content { padding: 18px 14px 32px; }
    }
  `,
})
export class Shell {
  protected readonly tenant = inject(TenantContext);
  protected readonly auth = inject(Auth);
  protected readonly router = inject(Router);
  protected readonly nav = NAV;
  protected readonly navOpen = signal(false);

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
