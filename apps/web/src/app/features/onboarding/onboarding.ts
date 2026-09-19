import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isValidItalianVat, isValidTenantSlug, suggestTenantSlug } from '@aph/contracts';
import { ApiError, toApiError } from '../../core/api/api';
import { LOGO_ACCEPT, LOGO_MAX_BYTES, StudioSettingsApi } from '../../core/api/studio-settings';
import { Auth } from '../../core/auth/auth';
import { TenantContext } from '../../core/tenant/tenant-context';
import { BrandPreview } from '../../shared/ui/brand-preview';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const STEPS = ['Studio', 'Profilo', 'Branding'] as const;
const PALETTE = ['#0f172a', '#1d4ed8', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#0891b2', '#4d7c0f'];
const TITLES = ['Arch.', 'Ing.', 'Geom.', 'Pian.', 'Dott.'];

/**
 * Wizard di attivazione self-service (AFU FR-M6-02, FR-M0-02..04).
 * Solo lo step 1 è obbligatorio: lo studio nasce con POST /onboarding/tenants, il resto
 * (P.IVA, iscrizione all'albo, colore, logo) si salva subito dopo e si può completare in Impostazioni.
 */
@Component({
  selector: 'app-onboarding',
  imports: [BrandPreview, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wiz">
      <section class="wiz-main">
        <ol class="steps">
          @for (s of steps; track s; let i = $index) {
            <li [class.is-done]="i < step()" [class.is-current]="i === step()">
              <span class="n">@if (i < step()) { <ui-icon name="check" [size]="13" /> } @else { {{ i + 1 }} }</span>{{ s }}
            </li>
          }
        </ol>

        @switch (step()) {
          @case (0) {
            <h1>Il tuo studio</h1>
            <p class="muted">Bastano nome e indirizzo web. Il resto lo completi con calma.</p>
            <div class="form">
              <div class="field">
                <label for="studio">Denominazione dello studio</label>
                <input id="studio" class="input" placeholder="Es. Studio Rossi Architetti" [value]="studioName()" (input)="studioName.set(val($event))" autofocus />
              </div>
              <div class="field">
                <label for="slug">Indirizzo del portale</label>
                <div class="input-group">
                  <input id="slug" class="input" [class.is-invalid]="(slug() && !slugValid()) || slugTaken()" [value]="slug()" (input)="onSlug(val($event))" />
                  <span class="addon">.projecthub.it</span>
                </div>
                <span class="hint" [class.is-error]="slugTaken() || (slug() && !slugValid())">
                  @if (slugTaken()) { Questo indirizzo è già in uso: scegline un altro. }
                  @else if (slug() && !slugValid()) { Usa solo lettere minuscole, numeri e trattini (3–32 caratteri). }
                  @else { È qui che i tuoi committenti apriranno le tavole. }
                </span>
              </div>
              <div class="grid grid-2">
                <div class="field"><label for="first">Il tuo nome</label>
                  <input id="first" class="input" autocomplete="given-name" [value]="firstName()" (input)="firstName.set(val($event))" /></div>
                <div class="field"><label for="last">Cognome</label>
                  <input id="last" class="input" autocomplete="family-name" [value]="lastName()" (input)="lastName.set(val($event))" /></div>
              </div>
              <div class="field">
                <label for="vat">Partita IVA <span class="muted">(facoltativa ora)</span></label>
                <input id="vat" class="input" inputmode="numeric" maxlength="11" [class.is-invalid]="vat() && !vatValid()" [value]="vat()" (input)="vat.set(val($event).trim())" />
                @if (vat() && !vatValid()) { <span class="hint is-error">Partita IVA non valida.</span> }
              </div>
              <label class="check">
                <input type="checkbox" [checked]="terms()" (change)="terms.set(checked($event))" />
                <span>Accetto i <a href="/legal/termini" target="_blank" rel="noopener">Termini di servizio</a> e l'<a href="/legal/dpa" target="_blank" rel="noopener">Accordo sul trattamento dei dati</a> (DPA).</span>
              </label>
            </div>
          }
          @case (1) {
            <h1>Il tuo profilo professionale</h1>
            <p class="muted">Serve per firmare relazioni e verbali. Puoi completarlo anche dopo.</p>
            <div class="form">
              <div class="grid grid-2">
                <div class="field"><label for="title">Titolo</label>
                  <select id="title" class="select" [value]="title()" (change)="title.set(val($event))">
                    @for (t of titles; track t) { <option [value]="t" [selected]="t === title()">{{ t }}</option> }
                  </select>
                </div>
                <div class="field"><label for="reg">N. iscrizione</label><input id="reg" class="input" [value]="regNumber()" (input)="regNumber.set(val($event))" /></div>
              </div>
              <div class="field"><label for="order">Ordine professionale</label><input id="order" class="input" placeholder="Ordine degli Architetti P.P.C. della Provincia di…" [value]="order()" (input)="order.set(val($event))" /></div>
            </div>
          }
          @case (2) {
            <h1>Il tuo marchio</h1>
            <p class="muted">Logo e colore si applicano subito ad app, portale, email e documenti.</p>
            <div class="form">
              <div class="field">
                <label>Logo</label>
                <label class="drop">
                  <input type="file" [accept]="logoAccept" hidden (change)="onLogo($event)" />
                  @if (logoPreview()) { <img [src]="logoPreview()" alt="" /> <span class="muted small">Clicca per sostituire</span> }
                  @else { <ui-icon name="upload" /> <span>PNG, JPEG o WebP fino a 2 MB, meglio con sfondo trasparente</span> }
                </label>
                @if (logoError(); as e) { <span class="hint is-error">{{ e }}</span> }
              </div>
              <div class="field">
                <label>Colore primario</label>
                <div class="row">
                  <input type="color" class="swatch" [value]="color()" (input)="color.set(val($event))" aria-label="Colore primario" />
                  <input class="input mono" style="max-width:130px" [value]="color()" (input)="setHex(val($event))" aria-label="Codice colore" />
                  <div class="row" style="gap:6px">
                    @for (c of palette; track c) { <button type="button" class="dot" [style.background]="c" (click)="color.set(c)" [attr.aria-label]="c"></button> }
                  </div>
                </div>
              </div>
            </div>
          }
        }

        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }

        <div class="wiz-actions">
          @if (step() > 0) { <button class="btn btn-outline" [disabled]="busy()" (click)="step.set(step() - 1)"><ui-icon name="chevron-left" [size]="16" /> Indietro</button> }
          <span style="flex:1"></span>
          @if (step() < 2) {
            <button class="btn btn-primary" [disabled]="!canNext()" (click)="next()">Continua <ui-icon name="chevron-right" [size]="16" /></button>
          } @else {
            <button class="btn btn-primary btn-lg" [disabled]="!canActivate() || busy()" (click)="activate()">
              <ui-icon name="sparkles" [size]="16" /> @if (busy()) { Attivazione in corso… } @else { Attiva lo studio }
            </button>
          }
        </div>
        <button class="linkish muted small" type="button" (click)="logout()">Esci e accedi con un altro account</button>
      </section>
      <aside class="wiz-side">
        <div class="eyebrow" style="margin-bottom:12px">Anteprima dal vivo</div>
        <ui-brand-preview [name]="studioName()" [color]="color()" [logo]="logoPreview()" />
      </aside>
    </div>
  `,
  styles: `
    .wiz { min-height: 100vh; display: grid; grid-template-columns: 1fr 440px; }
    .wiz-main { padding: 48px 56px; max-width: 640px; width: 100%; justify-self: end; display: flex; flex-direction: column; gap: 14px; }
    .wiz-side { background: var(--surface); border-left: 1px solid var(--line); padding: 48px 36px; }
    .steps { list-style: none; padding: 0; margin: 0 0 24px; display: flex; gap: 18px; }
    .steps li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); font-weight: 500; }
    .steps .n { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; border: 1px solid var(--line-strong); }
    .steps .is-current { color: var(--ink); }
    .steps .is-current .n { background: var(--color-primary); color: var(--color-primary-contrast); border-color: transparent; }
    .steps .is-done .n { background: var(--success-soft); color: var(--success); border-color: transparent; }
    h1 { font-size: 26px; }
    .form { display: grid; gap: 16px; margin-top: 10px; }
    .check { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; line-height: 1.45; }
    .check input { margin-top: 3px; }
    .check a { color: var(--color-primary); }
    .hint.is-error { color: var(--danger, #b91c1c); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft, #fef2f2); color: var(--danger, #b91c1c); font-size: 13.5px; }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; color: var(--muted); text-align: center; }
    .drop:hover { border-color: var(--color-primary); color: var(--ink); }
    .drop img { max-height: 48px; max-width: 200px; object-fit: contain; }
    .swatch { width: 40px; height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 2px; background: #fff; cursor: pointer; }
    .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--line-strong); cursor: pointer; }
    .wiz-actions { display: flex; align-items: center; gap: 10px; margin-top: 22px; }
    .linkish { background: none; border: 0; padding: 0; cursor: pointer; align-self: flex-start; text-decoration: underline; }
    @media (max-width: 960px) { .wiz { grid-template-columns: 1fr; } .wiz-side { display: none; } .wiz-main { padding: 28px 20px; justify-self: start; } }
  `,
})
export class Onboarding {
  private readonly auth = inject(Auth);
  private readonly tenant = inject(TenantContext);
  private readonly settingsApi = inject(StudioSettingsApi);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);
  protected readonly val = val;
  protected readonly steps = STEPS;
  protected readonly palette = PALETTE;
  protected readonly titles = TITLES;
  protected readonly logoAccept = LOGO_ACCEPT;

  private readonly nameParts = (this.auth.session()?.name ?? '').trim().split(/\s+/);

  protected readonly step = signal(0);
  protected readonly studioName = signal('');
  protected readonly slug = linkedSignal(() => suggestTenantSlug(this.studioName()));
  protected readonly slugTaken = signal(false);
  protected readonly firstName = signal(this.nameParts[0] ?? '');
  protected readonly lastName = signal(this.nameParts.slice(1).join(' '));
  protected readonly vat = signal('');
  protected readonly terms = signal(false);
  protected readonly title = signal('Arch.');
  protected readonly order = signal('');
  protected readonly regNumber = signal('');
  protected readonly color = signal('#0f172a');
  protected readonly logoFile = signal<File | null>(null);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly logoError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly slugValid = computed(() => isValidTenantSlug(this.slug()));
  protected readonly vatValid = computed(() => !this.vat() || isValidItalianVat(this.vat()));
  protected readonly stepOneValid = computed(
    () =>
      this.studioName().trim().length > 1 &&
      this.slugValid() &&
      !this.slugTaken() &&
      !!this.firstName().trim() &&
      !!this.lastName().trim() &&
      this.vatValid() &&
      this.terms(),
  );
  protected readonly canNext = computed(() => this.step() !== 0 || this.stepOneValid());
  protected readonly canActivate = computed(() => this.stepOneValid());

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected onSlug(value: string): void {
    this.slug.set(value.trim().toLowerCase());
    this.slugTaken.set(false);
  }

  protected next(): void {
    this.error.set(null);
    this.step.update((s) => s + 1);
  }

  protected setHex(v: string): void {
    if (/^#[0-9a-f]{6}$/i.test(v)) this.color.set(v.toLowerCase());
  }

  protected onLogo(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!LOGO_ACCEPT.split(',').includes(file.type) || file.size > LOGO_MAX_BYTES) {
      this.logoError.set('Il logo deve essere PNG, JPEG o WebP e non superare 2 MB.');
      return;
    }
    this.logoError.set(null);
    this.logoFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  protected async activate(): Promise<void> {
    if (!this.canActivate() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const slug = this.slug();
    try {
      await this.tenant.provision({
        studioName: this.studioName().trim(),
        slug,
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        acceptedTerms: true,
      });
    } catch (e) {
      this.busy.set(false);
      this.handleProvisionError(toApiError(e));
      return;
    }
    const incomplete = await this.saveOptionalSettings();
    await this.tenant.select(slug).catch(() => undefined);
    this.busy.set(false);
    if (incomplete.length) {
      this.toaster.show(`Studio attivato. Da completare in Impostazioni: ${incomplete.join(', ')}.`, 'info', 6000);
    } else {
      this.toaster.show('Studio attivato. Benvenuto!');
    }
    await this.router.navigateByUrl('/');
  }

  protected async logout(): Promise<void> {
    this.tenant.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private handleProvisionError(e: ApiError): void {
    if (e.code === 'SLUG_UNAVAILABLE') {
      this.slugTaken.set(true);
      this.step.set(0);
      return;
    }
    this.error.set(e.userMessage);
  }

  /** Dati facoltativi: se uno non va a buon fine lo studio resta attivo e l'utente lo completa dopo. */
  private async saveOptionalSettings(): Promise<string[]> {
    const tasks: { label: string; run: () => Promise<unknown> }[] = [
      { label: 'colore', run: () => this.settingsApi.updateBranding({ primaryColor: this.color() }) },
    ];
    if (this.vat()) tasks.push({ label: 'partita IVA', run: () => this.settingsApi.updateProfile({ vatNumber: this.vat() }) });
    const order = this.order().trim();
    const reg = this.regNumber().trim();
    tasks.push({
      label: 'profilo professionale',
      run: () =>
        this.settingsApi.updateMyProfile({
          firstName: this.firstName().trim(),
          lastName: this.lastName().trim(),
          title: this.title(),
          ...(order ? { professionalOrder: order } : {}),
          ...(reg ? { registrationNumber: reg } : {}),
        }),
    });
    const logo = this.logoFile();
    if (logo) tasks.push({ label: 'logo', run: () => this.settingsApi.uploadLogo('primary', logo) });
    const results = await Promise.allSettled(tasks.map((t) => t.run()));
    return tasks.filter((_, i) => results[i]?.status === 'rejected').map((t) => t.label);
  }
}
