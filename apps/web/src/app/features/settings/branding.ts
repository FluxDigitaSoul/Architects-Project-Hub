import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TenantContext } from '../../core/tenant/tenant-context';
import { BrandPreview } from '../../shared/ui/brand-preview';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { val } from '../../shared/dom';

/** Impostazioni white-label: applicazione istantanea (AFU FR-M0-03/04, NFR-BRAND-01). */
@Component({
  selector: 'app-branding-settings',
  imports: [BrandPreview, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Impostazioni" subtitle="Identità dello studio e white-label. Le modifiche si applicano subito.">
      <button class="btn btn-outline" (click)="tenant.reset()">Ripristina</button>
    </ui-page-header>
    <div class="grid layout">
      <section class="card card-body stack" style="gap:18px">
        <div class="field"><label>Denominazione dello studio</label><input class="input" [value]="b().studioName" (input)="tenant.update({ studioName: val($event) })" /></div>
        <div class="field"><label>Indirizzo del portale</label><div class="input-group"><input class="input" [value]="b().slug" disabled /><span class="addon">.projecthub.it</span></div><span class="hint">Il cambio di indirizzo passa dal supporto (i link già inviati restano validi).</span></div>
        <div class="field">
          <label>Logo</label>
          <label class="drop">
            <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden (change)="onLogo($event)" />
            @if (b().logoDataUrl; as logo) { <img [src]="logo" alt="" /> <span class="muted small">Clicca per sostituire</span> } @else { <ui-icon name="upload" /> <span>Carica PNG o SVG con sfondo trasparente</span> }
          </label>
        </div>
        <div class="field">
          <label>Colore primario</label>
          <div class="row">
            <input type="color" class="swatch" [value]="b().primaryColor" (input)="tenant.update({ primaryColor: val($event) })" />
            <input class="input mono" style="max-width:130px" [value]="b().primaryColor" (change)="setHex(val($event))" />
          </div>
          <span class="hint">Il testo sui pulsanti viene scelto in automatico per rispettare il contrasto WCAG AA.</span>
        </div>
      </section>
      <aside class="card card-body"><div class="eyebrow" style="margin-bottom:12px">Anteprima</div><ui-brand-preview [name]="b().studioName" [color]="b().primaryColor" [logo]="b().logoDataUrl" /></aside>
    </div>
  `,
  styles: `
    .layout { grid-template-columns: 1fr 420px; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; color: var(--muted); }
    .drop:hover { border-color: var(--color-primary); color: var(--ink); }
    .drop img { max-height: 48px; max-width: 200px; object-fit: contain; }
    .swatch { width: 40px; height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 2px; background: #fff; cursor: pointer; }
  `,
})
export class BrandingSettings {
  protected readonly tenant = inject(TenantContext);
  protected readonly b = this.tenant.branding;
  protected readonly val = val;

  protected setHex(v: string): void {
    if (/^#[0-9a-f]{6}$/i.test(v)) this.tenant.update({ primaryColor: v.toLowerCase() });
  }

  protected onLogo(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.tenant.update({ logoDataUrl: typeof reader.result === 'string' ? reader.result : null });
    reader.readAsDataURL(file);
  }
}
