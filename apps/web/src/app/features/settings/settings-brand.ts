import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { ATTESTATION_PLACEHOLDERS, DEFAULT_ATTESTATION, DEFAULT_CLOSING_FORMULA } from '@aph/contracts';
import { toApiError } from '../../core/api/api';
import { LOGO_ACCEPT, LOGO_MAX_BYTES, type LogoKind, type PortalTheme, type StudioBranding, type StudioSettings, StudioSettingsApi } from '../../core/api/studio-settings';
import { contrastFor } from '../../core/tenant/tenant-context';
import { BrandPreview } from '../../shared/ui/brand-preview';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

type BrandForm = Omit<StudioBranding, 'logos'>;
const HEX = /^#[0-9a-f]{6}$/i;
const ATTESTATION_MIN = 50;
const ATTESTATION_MAX = 4000;
const CLOSING_MAX = 300;

const LOGOS: { kind: LogoKind; label: string; hint: string }[] = [
  { kind: 'primary', label: 'Logo principale', hint: 'Interfaccia e portale dei committenti. Meglio orizzontale, sfondo trasparente.' },
  { kind: 'print', label: 'Logo per la stampa', hint: 'Intestazione di relazioni e verbali. Se manca si usa il principale.' },
  { kind: 'icon', label: 'Icona', hint: 'Versione quadrata per schede del browser e notifiche.' },
];
const THEMES: [PortalTheme, string][] = [['LIGHT', 'Chiaro'], ['DARK', 'Scuro'], ['AUTO', 'Come il dispositivo']];

/**
 * Marchio e testi dei documenti (AFU FR-M0-04/05, FR-M5-00/20, NFR-BRAND-01): colori, loghi,
 * tema del portale, dichiarazione asseverativa e formula di chiusura. Solo l'Owner modifica.
 */
@Component({
  selector: 'app-settings-brand',
  imports: [BrandPreview, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <div class="col">
        <fieldset class="card card-body stack" [disabled]="readOnly() || saving()">
          <h3>Colori e portale</h3>
          <div class="grid grid-2">
            <div class="field"><label for="sb-primary">Colore principale</label>
              <div class="row">
                <input type="color" class="swatch" [value]="validPrimary()" (input)="patch({ primaryColor: val($event) })" aria-label="Scegli il colore principale" />
                <input id="sb-primary" class="input mono hex" maxlength="7" [value]="form().primaryColor" (input)="hex('primaryColor', val($event))" />
              </div></div>
            <div class="field"><label for="sb-secondary">Colore secondario <span class="muted">(facoltativo)</span></label>
              <div class="row">
                <input type="color" class="swatch" [value]="form().secondaryColor ?? '#94a3b8'" (input)="patch({ secondaryColor: val($event) })" aria-label="Scegli il colore secondario" />
                <input id="sb-secondary" class="input mono hex" maxlength="7" placeholder="—" [value]="form().secondaryColor ?? ''" (input)="hex('secondaryColor', val($event))" />
                @if (form().secondaryColor && !readOnly()) { <button type="button" class="btn btn-ghost btn-sm" (click)="patch({ secondaryColor: null })">Togli</button> }
              </div></div>
          </div>
          <span class="hint">Il testo sui pulsanti diventa bianco o nero in automatico per restare leggibile (WCAG AA): con questo colore sarà <b>{{ contrast() === '#ffffff' ? 'bianco' : 'nero' }}</b>.</span>
          @if (colorError()) { <span class="ferr">Scrivi il colore nel formato #RRGGBB.</span> }
          <div class="field"><span class="lbl">Tema del portale dei committenti</span>
            <div class="seg" role="radiogroup" aria-label="Tema del portale">
              @for (t of themes; track t[0]) {
                <label class="seg-opt" [class.on]="form().portalTheme === t[0]"><input type="radio" name="sb-theme" [value]="t[0]" [checked]="form().portalTheme === t[0]" (change)="patch({ portalTheme: t[0] })" /> {{ t[1] }}</label>
              }
            </div></div>
        </fieldset>

        <fieldset class="card card-body stack" [disabled]="readOnly() || saving()">
          <h3>Testi dei documenti</h3>
          <div class="field"><label for="sb-att">Dichiarazione della relazione asseverativa R.A.I.</label>
            <textarea id="sb-att" class="textarea" rows="7" [attr.maxlength]="attMax" [placeholder]="defaultAttestation" [value]="form().attestationTemplate ?? ''" (input)="patch({ attestationTemplate: val($event) })"></textarea>
            <span class="hint">Vuoto = testo standard. Segnaposto sostituiti al momento della firma:
              @for (p of placeholders; track p) { <code>{{ p }}</code> }
              · {{ (form().attestationTemplate ?? '').length }}/{{ attMax }}</span>
            @if (attestationIssue(); as e) { <span class="ferr">{{ e }}</span> }
            @if (!readOnly()) {
              <div class="row"><button type="button" class="btn btn-ghost btn-sm" (click)="patch({ attestationTemplate: defaultAttestation })"><ui-icon name="copy" [size]="13" /> Parti dal testo standard</button>
                @if (form().attestationTemplate) { <button type="button" class="btn btn-ghost btn-sm" (click)="patch({ attestationTemplate: null })">Usa il testo standard</button> }</div>
            }
            <span class="hint warn"><ui-icon name="alert" [size]="13" /> La dichiarazione ha valore legale: fai verificare il testo prima di usarlo.</span>
          </div>
          <div class="field"><label for="sb-close">Formula di chiusura del verbale di sopralluogo</label>
            <input id="sb-close" class="input" [attr.maxlength]="closingMax" [placeholder]="defaultClosing" [value]="form().closingFormula ?? ''" (input)="patch({ closingFormula: val($event) })" />
            <span class="hint">Vuoto = «{{ defaultClosing }}». Vale per i verbali generati da adesso: quelli già emessi non cambiano.</span></div>
        </fieldset>
        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
        @if (!readOnly()) {
          <div class="actions">
            @if (dirty()) { <button type="button" class="btn btn-ghost" [disabled]="saving()" (click)="discard()">Annulla modifiche</button> }
            <button type="button" class="btn btn-primary" [disabled]="!dirty() || !valid() || saving()" (click)="save()">{{ saving() ? 'Salvataggio…' : 'Salva marchio e testi' }}</button>
          </div>
        }
      </div>

      <div class="col">
        <aside class="card card-body">
          <div class="eyebrow">Anteprima</div>
          <ui-brand-preview [name]="settings().profile.name" [color]="validPrimary()" [logo]="settings().branding.logos.primary ?? null" />
        </aside>
        <section class="card card-body stack">
          <h3>Loghi</h3>
          @for (l of logos; track l.kind) {
            <div class="logo">
              <div class="thumb" [class.icon]="l.kind === 'icon'">
                @if (settings().branding.logos[l.kind]; as url) { <img [src]="url" [alt]="l.label" /> } @else { <ui-icon name="palette" [size]="18" /> }
              </div>
              <div class="info"><b>{{ l.label }}</b><span class="hint">{{ l.hint }}</span></div>
              @if (!readOnly()) {
                <label class="btn btn-outline btn-sm" [class.disabled]="uploading() !== null">
                  {{ uploading() === l.kind ? 'Caricamento…' : settings().branding.logos[l.kind] ? 'Sostituisci' : 'Carica' }}
                  <input type="file" hidden [accept]="logoAccept" [disabled]="uploading() !== null" (change)="upload(l.kind, $event)" />
                </label>
              }
            </div>
          }
          <span class="hint">PNG, JPEG o WebP, massimo 2 MB. I loghi si applicano subito.</span>
        </section>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; align-items: start; }
    .col { display: grid; gap: 16px; min-width: 0; }
    @media (max-width: 1060px) { .layout { grid-template-columns: 1fr; } }
    fieldset { border: 0; margin: 0; min-width: 0; }
    .stack { gap: 14px; }
    h3 { margin: 0; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .hex { max-width: 120px; }
    .swatch { width: 40px; height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 2px; background: #fff; cursor: pointer; }
    .lbl { font-size: 13px; font-weight: 600; }
    .seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; width: fit-content; max-width: 100%; flex-wrap: wrap; }
    .seg-opt { position: relative; padding: 7px 14px; font-size: 13.5px; cursor: pointer; border-right: 1px solid var(--line); }
    .seg-opt:last-child { border-right: 0; }
    .seg-opt input { position: absolute; opacity: 0; pointer-events: none; }
    .seg-opt.on { background: var(--color-primary); color: var(--color-primary-contrast); }
    .seg-opt:focus-within { outline: 2px solid var(--color-primary); outline-offset: -2px; }
    code { font-size: 12px; background: var(--surface-2); padding: 1px 4px; border-radius: 4px; margin-right: 3px; }
    .warn { display: inline-flex; gap: 6px; align-items: center; color: var(--warning); }
    .ferr { color: var(--danger); font-size: 12.5px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    .eyebrow { margin-bottom: 12px; }
    .logo { display: grid; grid-template-columns: 96px 1fr auto; gap: 12px; align-items: center; }
    .thumb { height: 48px; border: 1px dashed var(--line-strong); border-radius: 8px; display: grid; place-items: center; color: var(--muted); background: var(--surface-2); overflow: hidden; }
    .thumb.icon { width: 48px; }
    .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .info { display: grid; gap: 2px; min-width: 0; }
    .btn.disabled { opacity: 0.6; pointer-events: none; }
    @media (max-width: 520px) { .logo { grid-template-columns: 64px 1fr; } .logo .btn { grid-column: 1 / -1; justify-self: start; } }
  `,
})
export class SettingsBrand {
  readonly settings = input.required<StudioSettings>();
  readonly readOnly = input(false);
  readonly saved = output<void>();

  private readonly api = inject(StudioSettingsApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly logos = LOGOS;
  protected readonly themes = THEMES;
  protected readonly placeholders = ATTESTATION_PLACEHOLDERS;
  protected readonly defaultAttestation = DEFAULT_ATTESTATION;
  protected readonly defaultClosing = DEFAULT_CLOSING_FORMULA;
  protected readonly logoAccept = LOGO_ACCEPT;
  protected readonly attMax = ATTESTATION_MAX;
  protected readonly closingMax = CLOSING_MAX;

  private readonly original = computed<BrandForm>(() => {
    const b = this.settings().branding;
    return { primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, portalTheme: b.portalTheme, attestationTemplate: b.attestationTemplate, closingFormula: b.closingFormula };
  });
  protected readonly dirty = signal(false);
  /** Un ricaricamento (es. dopo il caricamento di un logo) non cancella le modifiche non salvate. */
  protected readonly form = linkedSignal<BrandForm, BrandForm>({
    source: this.original,
    computation: (src, prev) => (prev && untracked(this.dirty) ? prev.value : src),
  });
  protected readonly saving = signal(false);
  protected readonly uploading = signal<LogoKind | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly colorError = computed(() => !HEX.test(this.form().primaryColor) || (!!this.form().secondaryColor && !HEX.test(this.form().secondaryColor!)));
  protected readonly validPrimary = computed(() => (HEX.test(this.form().primaryColor) ? this.form().primaryColor : this.original().primaryColor));
  protected readonly contrast = computed(() => contrastFor(this.validPrimary()));
  protected readonly attestationIssue = computed(() => {
    const t = this.form().attestationTemplate?.trim();
    if (!t) return null;
    if (t.length < ATTESTATION_MIN) return `Almeno ${ATTESTATION_MIN} caratteri, oppure lascia vuoto per il testo standard.`;
    const missing = ATTESTATION_PLACEHOLDERS.filter((p) => !t.includes(p));
    return missing.length ? `Mancano i segnaposto ${missing.join(' ')}: nella relazione non comparirebbero questi dati del firmatario.` : null;
  });
  protected readonly valid = computed(() => {
    const t = this.form().attestationTemplate?.trim();
    return !this.colorError() && (!t || t.length >= ATTESTATION_MIN) && (this.form().closingFormula?.length ?? 0) <= CLOSING_MAX;
  });

  protected patch(p: Partial<BrandForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
    this.dirty.set(true);
  }

  protected hex(field: 'primaryColor' | 'secondaryColor', v: string): void {
    const value = v.trim().toLowerCase();
    this.patch(field === 'secondaryColor' && !value ? { secondaryColor: null } : { [field]: value });
  }

  protected discard(): void {
    this.dirty.set(false);
    this.form.set(this.original());
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    const f = this.form();
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.updateBranding({
        primaryColor: f.primaryColor, secondaryColor: f.secondaryColor || null, portalTheme: f.portalTheme,
        attestationTemplate: f.attestationTemplate?.trim() || null, closingFormula: f.closingFormula?.trim() || null,
      });
      this.dirty.set(false);
      this.toaster.show('Marchio e testi salvati');
      this.saved.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.saving.set(false);
    }
  }

  protected async upload(kind: LogoKind, e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      this.toaster.show('Il logo deve essere PNG, JPEG o WebP.', 'danger');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.toaster.show('Il logo supera i 2 MB: riducilo e riprova.', 'danger');
      return;
    }
    this.uploading.set(kind);
    try {
      await this.api.uploadLogo(kind, file);
      this.toaster.show('Logo aggiornato');
      this.saved.emit();
    } catch (err) {
      this.toaster.show(toApiError(err).userMessage, 'danger');
    } finally {
      this.uploading.set(null);
    }
  }
}
