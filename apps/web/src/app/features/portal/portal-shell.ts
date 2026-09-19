import { ChangeDetectionStrategy, Component, type OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { PortalRequestLink } from './portal-request-link';
import { PortalSession, rememberedStudio } from './portal-session';

/** Guscio del portale del committente con il marchio dello studio (AFU Modulo 2, NFR-BRAND-02). */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, Dialog, Icon, PortalRequestLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <a class="brand" routerLink="/portale">
        @if (tenant.branding().logoDataUrl; as logo) { <img [src]="logo" alt="" /> }
        @else { <span class="mark">{{ tenant.initials() }}</span> }
        <span>{{ tenant.branding().studioName || 'Portale' }}</span>
      </a>
      @if (session.context(); as c) {
        <div class="who">
          <span class="avatar">{{ c.contact.name.charAt(0) }}</span>
          <span class="small name">{{ c.contact.name }}</span>
          <button class="btn btn-ghost btn-icon" (click)="signOut()" aria-label="Esci" title="Esci"><ui-icon name="logout" [size]="16" /></button>
        </div>
      }
    </header>
    <main class="content">
      @switch (session.state()) {
        @case ('ready') {
          @if (session.readOnly()) {
            <div class="notice small"><ui-icon name="info" [size]="15" /> La commessa è in sola lettura: puoi consultare tavole e documenti, ma non commentare o approvare.</div>
          }
          <router-outlet />
        }
        @case ('signed-out') { <app-portal-request-link [studio]="studioSlug()" /> }
        @case ('error') {
          <div class="state card"><ui-icon name="alert" [size]="22" /><p>{{ session.error()?.userMessage }}</p>
            <button class="btn btn-outline btn-sm" (click)="session.load()">Riprova</button></div>
        }
        @default { <div class="state muted"><span class="spinner"></span> Caricamento…</div> }
      }
    </main>
    <footer class="foot muted small">
      {{ tenant.branding().studioName }}
      @if (session.context()?.studio?.email; as e) { · <a [href]="'mailto:' + e">{{ e }}</a> }
      @if (session.context()?.studio?.phone; as p) { · {{ p }} }
      · Portale riservato
    </footer>

    <ui-dialog [open]="needsPrivacy()" title="Informativa sul trattamento dei dati" [width]="560" (closed)="privacyLater()">
      <p><b>{{ session.context()?.studio?.name }}</b> è titolare del trattamento dei dati che inserisci in questo portale (nome, email, commenti, approvazioni).</p>
      <p>I dati servono solo a gestire la revisione e l'approvazione degli elaborati del tuo progetto. Le approvazioni sono registrate con data, ora, indirizzo IP e impronta del file come prova del consenso.</p>
      <p class="muted small">Per esercitare i tuoi diritti (accesso, rettifica, cancellazione) scrivi allo studio. L'informativa completa è disponibile su richiesta.</p>
      <div dialog-actions>
        <button class="btn btn-primary" [disabled]="acking()" (click)="acknowledge()">Ho letto l'informativa</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .bar { height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; min-width: 0; }
    .brand img { height: 28px; max-width: 170px; object-fit: contain; }
    .mark { width: 30px; height: 30px; border-radius: 8px; background: var(--color-primary); color: var(--color-primary-contrast); display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
    .who { display: flex; align-items: center; gap: 8px; }
    .avatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--primary-soft); color: var(--color-primary); font-weight: 600; font-size: 12px; }
    .content { flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: 24px; }
    .notice { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--warning-soft); margin-bottom: 14px; }
    .state { max-width: 440px; margin: 10vh auto 0; padding: 28px; display: grid; gap: 10px; justify-items: center; text-align: center; }
    .state.muted { display: flex; justify-content: center; align-items: center; }
    .spinner { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--color-primary); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .foot { text-align: center; padding: 18px; }
    .foot a { color: inherit; text-decoration: underline; }
    @media (max-width: 640px) { .content { padding: 16px 12px; } .bar { padding: 0 12px; } .name { display: none; } }
  `,
})
export class PortalShell implements OnInit {
  /** `?studio=` arriva dai link nelle email di pubblicazione (serve per chiedere un nuovo link). */
  readonly studio = input<string>();
  protected readonly session = inject(PortalSession);
  protected readonly tenant = inject(TenantContext);
  protected readonly acking = signal(false);
  private readonly dismissed = signal(false);

  protected readonly studioSlug = computed(() => this.studio() ?? rememberedStudio());
  /** FR-M1-05 punto 3: informativa al primo accesso. */
  protected readonly needsPrivacy = computed(
    () => this.session.state() === 'ready' && !this.session.context()?.contact.privacyAcknowledged && !this.dismissed(),
  );

  ngOnInit(): void {
    void this.session.load();
  }

  protected async acknowledge(): Promise<void> {
    this.acking.set(true);
    try {
      await this.session.acknowledgePrivacy();
    } finally {
      this.acking.set(false);
    }
  }

  /** Chiusa senza conferma: si ripropone al prossimo accesso. */
  protected privacyLater(): void {
    this.dismissed.set(true);
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
  }
}
