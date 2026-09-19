import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { DEFAULT_PROJECT_CODE_PATTERN, isValidItalianFiscalId, isValidItalianVat, isValidProjectCodePattern, nextProjectCode } from '@aph/contracts';
import { toApiError } from '../../core/api/api';
import { type LegalAddress, type StudioOperations, type StudioProfile, type StudioSettings, StudioSettingsApi } from '../../core/api/studio-settings';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

type ProfileForm = Omit<StudioProfile, 'slug' | 'legalAddress'> & { address: Required<LegalAddress> };

function toForm(p: StudioProfile): ProfileForm {
  const a = p.legalAddress;
  return {
    name: p.name, legalForm: p.legalForm, vatNumber: p.vatNumber, taxCode: p.taxCode, email: p.email, pec: p.pec,
    phone: p.phone, website: p.website, legalRepresentative: p.legalRepresentative,
    address: { street: a?.street ?? '', number: a?.number ?? '', zip: a?.zip ?? '', city: a?.city ?? '', province: a?.province ?? '' },
  };
}

const clean = (s: string | null | undefined) => s?.trim() || null;

/**
 * Anagrafica e impostazioni operative dello studio (AFU FR-M0-02, FR-M0-11, BR-03). I dati
 * finiscono nell'intestazione di relazioni, verbali e riepiloghi. Modificabili solo dall'Owner.
 */
@Component({
  selector: 'app-settings-studio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="card card-body stack" [disabled]="readOnly() || savingProfile()">
      <div class="head"><h3>Anagrafica dello studio</h3><span class="muted small">Compare nell'intestazione dei documenti.</span></div>
      <div class="grid g-name">
        <div class="field"><label for="ss-name">Denominazione</label><input id="ss-name" class="input" maxlength="150" [value]="form().name" (input)="patch({ name: val($event) })" /></div>
        <div class="field"><label for="ss-form">Forma</label><input id="ss-form" class="input" maxlength="60" placeholder="Studio associato, S.r.l.…" [value]="form().legalForm ?? ''" (input)="patch({ legalForm: val($event) })" /></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label for="ss-vat">Partita IVA</label><input id="ss-vat" class="input mono" maxlength="13" inputmode="numeric" [value]="form().vatNumber ?? ''" (input)="patch({ vatNumber: val($event) })" />
          @if (err('vatNumber'); as e) { <span class="ferr">{{ e }}</span> }</div>
        <div class="field"><label for="ss-cf">Codice fiscale</label><input id="ss-cf" class="input mono" maxlength="16" [value]="form().taxCode ?? ''" (input)="patch({ taxCode: val($event).toUpperCase() })" />
          @if (err('taxCode'); as e) { <span class="ferr">{{ e }}</span> }</div>
      </div>
      <div class="grid g-addr">
        <div class="field"><label for="ss-street">Sede legale — via</label><input id="ss-street" class="input" maxlength="150" [value]="form().address.street" (input)="addr({ street: val($event) })" /></div>
        <div class="field"><label for="ss-num">Civico</label><input id="ss-num" class="input" maxlength="20" [value]="form().address.number" (input)="addr({ number: val($event) })" /></div>
      </div>
      <div class="grid g-city">
        <div class="field"><label for="ss-zip">CAP</label><input id="ss-zip" class="input mono" maxlength="5" inputmode="numeric" [value]="form().address.zip" (input)="addr({ zip: val($event) })" />
          @if (err('legalAddress.zip'); as e) { <span class="ferr">{{ e }}</span> }</div>
        <div class="field"><label for="ss-city">Comune</label><input id="ss-city" class="input" maxlength="100" [value]="form().address.city" (input)="addr({ city: val($event) })" /></div>
        <div class="field"><label for="ss-prov">Provincia</label><input id="ss-prov" class="input mono" maxlength="2" placeholder="MI" [value]="form().address.province" (input)="addr({ province: val($event).toUpperCase() })" />
          @if (err('legalAddress.province'); as e) { <span class="ferr">{{ e }}</span> }</div>
      </div>
      @if (addressIncomplete()) { <span class="ferr">Per la sede indica almeno via e comune, oppure lascia vuoti tutti i campi.</span> }
      <div class="grid grid-2">
        <div class="field"><label for="ss-email">Email</label><input id="ss-email" class="input" type="email" [value]="form().email ?? ''" (input)="patch({ email: val($event) })" />
          @if (err('email'); as e) { <span class="ferr">{{ e }}</span> }</div>
        <div class="field"><label for="ss-pec">PEC</label><input id="ss-pec" class="input" type="email" [value]="form().pec ?? ''" (input)="patch({ pec: val($event) })" />
          @if (err('pec'); as e) { <span class="ferr">{{ e }}</span> }</div>
        <div class="field"><label for="ss-phone">Telefono</label><input id="ss-phone" class="input" type="tel" maxlength="30" [value]="form().phone ?? ''" (input)="patch({ phone: val($event) })" /></div>
        <div class="field"><label for="ss-web">Sito web</label><input id="ss-web" class="input" type="url" maxlength="200" placeholder="https://" [value]="form().website ?? ''" (input)="patch({ website: val($event) })" />
          @if (err('website'); as e) { <span class="ferr">{{ e }}</span> }</div>
      </div>
      <div class="field"><label for="ss-rep">Legale rappresentante</label><input id="ss-rep" class="input" maxlength="150" [value]="form().legalRepresentative ?? ''" (input)="patch({ legalRepresentative: val($event) })" /></div>
      @if (profileError(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      @if (!readOnly()) {
        <div class="actions"><button type="button" class="btn btn-primary" [disabled]="!profileDirty() || !profileValid()" (click)="saveProfile()">{{ savingProfile() ? 'Salvataggio…' : 'Salva anagrafica' }}</button></div>
      }
    </fieldset>

    <fieldset class="card card-body stack" [disabled]="readOnly() || savingOps()">
      <div class="head"><h3>Impostazioni operative</h3></div>
      <div class="grid grid-2">
        <div class="field"><label for="ss-pattern">Codice delle nuove commesse</label>
          <input id="ss-pattern" class="input mono" maxlength="30" [value]="ops().codePattern ?? ''" (input)="patchOps({ codePattern: val($event) })" />
          <span class="hint">Usa {{ '{' }}YYYY{{ '}' }} o {{ '{' }}YY{{ '}' }} per l'anno e {{ '{' }}NNN{{ '}' }} per il progressivo. Prossimo: <b class="mono">{{ preview() }}</b></span>
          @if (opsErr('codePattern'); as e) { <span class="ferr">{{ e }}</span> }</div>
        <div class="field"><label for="ss-grace">Giorni di accesso al portale dopo la chiusura</label>
          <input id="ss-grace" class="input" type="number" min="0" max="365" [value]="ops().graceDays ?? 30" (input)="patchOps({ graceDays: +val($event) })" />
          <span class="hint">Per questi giorni i committenti vedono ancora tavole e documenti di una commessa chiusa.</span></div>
      </div>
      <div class="field narrow"><label for="ss-audio">Conservazione delle note vocali (giorni)</label>
        <input id="ss-audio" class="input" type="number" min="7" max="3650" [value]="ops().audioRetentionDays ?? 90" (input)="patchOps({ audioRetentionDays: +val($event) })" />
        <span class="hint">Dopo la finalizzazione del verbale l'audio grezzo si elimina in automatico; restano il verbale e le voci scritte (privacy, PRIV-03).</span></div>
      <label class="check"><input type="checkbox" [checked]="ops().requireOtpNewDevice ?? false" (change)="patchOps({ requireOtpNewDevice: $any($event.target).checked })" />
        <span>Chiedi un codice via email quando un committente apre il portale da un nuovo dispositivo</span></label>
      @if (opsError(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      @if (!readOnly()) {
        <div class="actions"><button type="button" class="btn btn-primary" [disabled]="!opsDirty() || !opsValid()" (click)="saveOps()">{{ savingOps() ? 'Salvataggio…' : 'Salva impostazioni' }}</button></div>
      }
    </fieldset>
  `,
  styles: `
    :host { display: grid; gap: 16px; max-width: 860px; }
    fieldset { border: 0; margin: 0; min-width: 0; }
    .stack { gap: 14px; }
    .head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
    .head h3 { margin: 0; }
    .g-name { grid-template-columns: 2fr 1fr; }
    .g-addr { grid-template-columns: 3fr 1fr; }
    .g-city { grid-template-columns: 120px 1fr 110px; }
    .ferr { color: var(--danger); font-size: 12.5px; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
    .narrow { max-width: 420px; }
    .check input { margin-top: 3px; }
    .actions { display: flex; justify-content: flex-end; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    @media (max-width: 640px) { .g-name, .g-addr, .g-city { grid-template-columns: 1fr; } }
  `,
})
export class SettingsStudio {
  readonly settings = input.required<StudioSettings>();
  readonly readOnly = input(false);
  readonly saved = output<void>();

  private readonly api = inject(StudioSettingsApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;

  protected readonly profileDirty = signal(false);
  protected readonly opsDirty = signal(false);
  /** Salvare un riquadro ricarica le impostazioni: le modifiche non salvate dell'altro restano. */
  protected readonly form = linkedSignal<StudioProfile, ProfileForm>({
    source: () => this.settings().profile,
    computation: (src, prev) => (prev && untracked(this.profileDirty) ? prev.value : toForm(src)),
  });
  protected readonly ops = linkedSignal<StudioOperations | null, StudioOperations>({
    source: () => this.settings().settings,
    computation: (src, prev) => (prev && untracked(this.opsDirty)
      ? prev.value
      : { codePattern: DEFAULT_PROJECT_CODE_PATTERN, graceDays: 30, requireOtpNewDevice: false, audioRetentionDays: 90, ...src }),
  });
  protected readonly savingProfile = signal(false);
  protected readonly savingOps = signal(false);
  private readonly profileFields = signal<Record<string, string>>({});
  private readonly opsFields = signal<Record<string, string>>({});
  protected readonly profileError = signal<string | null>(null);
  protected readonly opsError = signal<string | null>(null);

  protected readonly addressIncomplete = computed(() => {
    const a = this.form().address;
    const any = Object.values(a).some((v) => v.trim());
    return any && (!a.street.trim() || !a.city.trim());
  });
  protected readonly patternValid = computed(() => isValidProjectCodePattern(this.ops().codePattern?.trim() ?? ''));
  /** Anteprima del primo codice dell'anno con il pattern scelto (il server continua la numerazione esistente). */
  protected readonly preview = computed(() => (this.patternValid() ? nextProjectCode(this.ops().codePattern!.trim(), [], new Date()) : '—'));
  protected readonly opsValid = computed(() => {
    const g = this.ops().graceDays;
    const a = this.ops().audioRetentionDays ?? 90;
    return this.patternValid() && g !== undefined && Number.isInteger(g) && g >= 0 && g <= 365 && Number.isInteger(a) && a >= 7 && a <= 3650;
  });
  private readonly localErrors = computed<Record<string, string>>(() => {
    const f = this.form();
    const out: Record<string, string> = {};
    if (f.vatNumber?.trim() && !isValidItalianVat(f.vatNumber.trim())) out['vatNumber'] = 'Partita IVA non valida.';
    if (f.taxCode?.trim() && !isValidItalianFiscalId(f.taxCode.trim().toUpperCase())) out['taxCode'] = 'Codice fiscale non valido.';
    if (f.address.zip.trim() && !/^\d{5}$/.test(f.address.zip.trim())) out['legalAddress.zip'] = 'Il CAP ha 5 cifre.';
    if (f.address.province.trim() && !/^[A-Z]{2}$/.test(f.address.province.trim())) out['legalAddress.province'] = 'Sigla di 2 lettere.';
    return out;
  });
  protected readonly profileValid = computed(() => !!this.form().name.trim() && !this.addressIncomplete() && !Object.keys(this.localErrors()).length);

  protected err(path: string): string | null {
    return this.localErrors()[path] ?? this.profileFields()[path] ?? null;
  }

  protected opsErr(path: string): string | null {
    if (!this.patternValid() && path === 'codePattern') return 'Usa {YYYY} o {YY} per l’anno e un solo {NNN} per il progressivo (max 30 caratteri).';
    return this.opsFields()[path] ?? null;
  }

  protected patch(p: Partial<ProfileForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
    this.profileDirty.set(true);
  }

  protected addr(p: Partial<LegalAddress>): void {
    this.form.update((f) => ({ ...f, address: { ...f.address, ...p } }));
    this.profileDirty.set(true);
  }

  protected patchOps(p: StudioOperations): void {
    this.ops.update((o) => ({ ...o, ...p }));
    this.opsDirty.set(true);
  }

  protected async saveProfile(): Promise<void> {
    const f = this.form();
    const a = f.address;
    const legalAddress: LegalAddress | null = a.street.trim() && a.city.trim()
      ? { street: a.street.trim(), city: a.city.trim(), number: clean(a.number) ?? undefined, zip: clean(a.zip) ?? undefined, province: clean(a.province) ?? undefined }
      : null;
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.profileFields.set({});
    try {
      await this.api.updateProfile({
        name: f.name.trim(), legalForm: clean(f.legalForm), vatNumber: clean(f.vatNumber), taxCode: clean(f.taxCode), legalAddress,
        email: clean(f.email), pec: clean(f.pec), phone: clean(f.phone), website: clean(f.website), legalRepresentative: clean(f.legalRepresentative),
      });
      this.profileDirty.set(false);
      this.toaster.show('Anagrafica salvata');
      this.saved.emit();
    } catch (e) {
      const err = toApiError(e);
      this.profileFields.set(err.fields);
      this.profileError.set(err.userMessage);
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async saveOps(): Promise<void> {
    const o = this.ops();
    this.savingOps.set(true);
    this.opsError.set(null);
    this.opsFields.set({});
    try {
      await this.api.updateOperations({
        codePattern: o.codePattern?.trim(), graceDays: o.graceDays, requireOtpNewDevice: o.requireOtpNewDevice, audioRetentionDays: o.audioRetentionDays,
      });
      this.opsDirty.set(false);
      this.toaster.show('Impostazioni salvate');
      this.saved.emit();
    } catch (e) {
      const err = toApiError(e);
      this.opsFields.set(err.fields);
      this.opsError.set(err.userMessage);
    } finally {
      this.savingOps.set(false);
    }
  }
}
