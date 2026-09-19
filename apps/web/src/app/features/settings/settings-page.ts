import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { StudioSettingsApi } from '../../core/api/studio-settings';
import { TenantContext } from '../../core/tenant/tenant-context';
import { PageHeader } from '../../shared/ui/page-header';
import { SettingsBrand } from './settings-brand';
import { SettingsProfile } from './settings-profile';
import { SettingsStudio } from './settings-studio';
import { SettingsTeam } from './settings-team';

type Section = 'profilo' | 'studio' | 'marchio' | 'team';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'profilo', label: 'Il mio profilo' },
  { key: 'studio', label: 'Studio' },
  { key: 'marchio', label: 'Marchio e documenti' },
  { key: 'team', label: 'Persone' },
];

/**
 * Impostazioni (AFU FR-M0-02..11, FR-MT-04): profilo personale per tutti; studio, marchio e
 * persone modificabili dall'Owner, in sola lettura per gli altri. Sezione da `?sezione=`.
 */
@Component({
  selector: 'app-settings-page',
  imports: [PageHeader, SettingsBrand, SettingsProfile, SettingsStudio, SettingsTeam],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Impostazioni" [subtitle]="subtitle()" />
    <nav class="tabs" role="tablist" aria-label="Sezioni delle impostazioni">
      @for (s of sections; track s.key) {
        <button role="tab" [attr.aria-selected]="section() === s.key" [class.is-active]="section() === s.key" (click)="open(s.key)">{{ s.label }}</button>
      }
    </nav>
    @if (!isOwner() && section() !== 'profilo') {
      <div class="card note small">Sola lettura: queste impostazioni le modifica l'Owner dello studio.</div>
    }
    @switch (section()) {
      @case ('profilo') { <app-settings-profile /> }
      @case ('team') { <app-settings-team [canManage]="isOwner()" /> }
      @default {
        @if (settings.value(); as s) {
          @if (section() === 'studio') { <app-settings-studio [settings]="s" [readOnly]="!isOwner()" (saved)="refresh()" /> }
          @else { <app-settings-brand [settings]="s" [readOnly]="!isOwner()" (saved)="refresh()" /> }
        } @else if (settings.error()) {
          <div class="card error-box">{{ loadError() }} <button class="btn btn-outline btn-sm" (click)="settings.reload()">Riprova</button></div>
        } @else { <div class="card skeleton"></div> }
      }
    }
  `,
  styles: `
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 18px; overflow-x: auto; }
    .tabs button { background: none; border: 0; padding: 10px 12px; font: inherit; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .tabs button.is-active { color: var(--ink); border-color: var(--color-primary); }
    .note { padding: 10px 14px; margin-bottom: 14px; background: var(--info-soft); }
    .skeleton { height: 320px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class SettingsPage {
  readonly sezione = input<string>();

  private readonly api = inject(StudioSettingsApi);
  private readonly router = inject(Router);
  private readonly tenant = inject(TenantContext);
  protected readonly sections = SECTIONS;
  protected readonly isOwner = this.tenant.isOwner;

  protected readonly section = linkedSignal<Section>(() => {
    const s = this.sezione();
    return SECTIONS.some((x) => x.key === s) ? (s as Section) : 'profilo';
  });
  protected readonly settings = resource({ loader: () => this.api.get() });
  protected readonly loadError = computed(() => toApiError(this.settings.error()).userMessage);
  protected readonly subtitle = computed(() => {
    const name = this.tenant.branding().studioName;
    return name ? `Profilo personale e impostazioni di ${name}.` : 'Profilo personale e impostazioni dello studio.';
  });

  protected open(s: Section): void {
    this.section.set(s);
    void this.router.navigate([], { queryParams: { sezione: s === 'profilo' ? null : s }, replaceUrl: true });
  }

  /** Dopo un salvataggio: dati aggiornati e marchio applicato subito all'interfaccia (NFR-BRAND-01). */
  protected async refresh(): Promise<void> {
    this.settings.reload();
    const slug = this.tenant.branding().slug;
    if (slug) await this.tenant.select(slug).catch(() => undefined);
  }
}
