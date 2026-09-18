import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isValidTenantSlug, suggestTenantSlug } from '@aph/contracts';
import { TenantContext } from '../../core/tenant/tenant-context';
import { BrandPreview } from '../../shared/ui/brand-preview';
import { Icon } from '../../shared/ui/icon';
import { val } from '../../shared/dom';

const STEPS = ['Studio', 'Profilo', 'Branding'] as const;

/** Wizard di attivazione self-service (AFU FR-M6-02, FR-M0-02..04). */
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
                <label>Denominazione dello studio</label>
                <input class="input" placeholder="Es. Studio Rossi Architetti" [value]="studioName()" (input)="studioName.set(val($event))" autofocus />
              </div>
              <div class="field">
                <label>Indirizzo del portale</label>
                <div class="input-group">
                  <input class="input" [class.is-invalid]="slug() && !slugValid()" [value]="slug()" (input)="slug.set(val($event))" />
                  <span class="addon">.projecthub.it</span>
                </div>
                <span class="hint">@if (slug() && !slugValid()) { Usa solo lettere minuscole, numeri e trattini (3–32 caratteri). } @else { È qui che i tuoi committenti apriranno le tavole. }</span>
              </div>
              <div class="field">
                <label>Partita IVA <span class="muted">(facoltativa ora)</span></label>
                <input class="input" inputmode="numeric" maxlength="11" [value]="vat()" (input)="vat.set(val($event))" />
              </div>
            </div>
          }
          @case (1) {
            <h1>Il tuo profilo professionale</h1>
            <p class="muted">Serve per firmare relazioni e verbali. Puoi completarlo anche dopo.</p>
            <div class="form">
              <div class="grid grid-2">
                <div class="field"><label>Titolo</label>
                  <select class="select" [value]="title()" (change)="title.set(val($event))">
                    <option>Arch.</option><option>Ing.</option><option>Geom.</option><option>Pian.</option><option>Dott.</option>
                  </select>
                </div>
                <div class="field"><label>N. iscrizione</label><input class="input" [value]="regNumber()" (input)="regNumber.set(val($event))" /></div>
              </div>
              <div class="field"><label>Ordine professionale</label><input class="input" placeholder="Ordine degli Architetti P.P.C. della Provincia di…" [value]="order()" (input)="order.set(val($event))" /></div>
            </div>
          }
          @case (2) {
            <h1>Il tuo marchio</h1>
            <p class="muted">Logo e colore si applicano subito ad app, portale, email e documenti.</p>
            <div class="form">
              <div class="field">
                <label>Logo</label>
                <label class="drop">
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden (change)="onLogo($event)" />
                  @if (logo()) { <img [src]="logo()" alt="" /> <span class="muted small">Clicca per sostituire</span> }
                  @else { <ui-icon name="upload" /> <span>Carica PNG o SVG con sfondo trasparente</span> }
                </label>
              </div>
              <div class="field">
                <label>Colore primario</label>
                <div class="row">
                  <input type="color" class="swatch" [value]="color()" (input)="color.set(val($event))" />
                  <input class="input mono" style="max-width:130px" [value]="color()" (input)="setHex(val($event))" />
                  <div class="row" style="gap:6px">
                    @for (c of palette; track c) { <button type="button" class="dot" [style.background]="c" (click)="color.set(c)" [attr.aria-label]="c"></button> }
                  </div>
                </div>
              </div>
            </div>
          }
        }

        <div class="wiz-actions">
          @if (step() > 0) { <button class="btn btn-outline" (click)="step.set(step() - 1)"><ui-icon name="chevron-left" [size]="16" /> Indietro</button> }
          <span style="flex:1"></span>
          @if (step() < 2) {
            <button class="btn btn-primary" [disabled]="!canNext()" (click)="step.set(step() + 1)">Continua <ui-icon name="chevron-right" [size]="16" /></button>
          } @else {
            <button class="btn btn-primary btn-lg" [disabled]="!canActivate()" (click)="activate()"><ui-icon name="sparkles" [size]="16" /> Attiva lo studio</button>
          }
        </div>
      </section>
      <aside class="wiz-side">
        <div class="eyebrow" style="margin-bottom:12px">Anteprima dal vivo</div>
        <ui-brand-preview [name]="studioName()" [color]="color()" [logo]="logo()" />
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
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; color: var(--muted); }
    .drop:hover { border-color: var(--color-primary); color: var(--ink); }
    .drop img { max-height: 48px; max-width: 200px; object-fit: contain; }
    .swatch { width: 40px; height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 2px; background: #fff; cursor: pointer; }
    .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--line-strong); cursor: pointer; }
    .wiz-actions { display: flex; align-items: center; gap: 10px; margin-top: 22px; }
    @media (max-width: 960px) { .wiz { grid-template-columns: 1fr; } .wiz-side { display: none; } .wiz-main { padding: 28px 20px; justify-self: start; } }
  `,
})
export class Onboarding {
  private readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);
  protected readonly val = val;
  protected readonly steps = STEPS;
  protected readonly palette = ['#0f172a', '#1d4ed8', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#0891b2', '#4d7c0f'];

  protected readonly step = signal(0);
  protected readonly studioName = signal('');
  protected readonly slug = linkedSignal(() => suggestTenantSlug(this.studioName()));
  protected readonly vat = signal('');
  protected readonly title = signal('Arch.');
  protected readonly order = signal('');
  protected readonly regNumber = signal('');
  protected readonly color = signal('#0f172a');
  protected readonly logo = signal<string | null>(null);

  protected readonly slugValid = computed(() => isValidTenantSlug(this.slug()));
  protected readonly canNext = computed(() => this.step() !== 0 || (this.studioName().trim().length > 1 && this.slugValid()));
  protected readonly canActivate = computed(() => this.studioName().trim().length > 1 && this.slugValid());

  protected setHex(v: string): void {
    if (/^#[0-9a-f]{6}$/i.test(v)) this.color.set(v.toLowerCase());
  }

  protected onLogo(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.logo.set(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  protected activate(): void {
    this.tenant.update({
      studioName: this.studioName().trim(),
      slug: this.slug(),
      primaryColor: this.color(),
      logoDataUrl: this.logo(),
    });
    void this.router.navigate(['/']);
  }
}
