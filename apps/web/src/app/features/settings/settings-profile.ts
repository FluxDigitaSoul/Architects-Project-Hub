import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, resource, signal, untracked } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { type MyProfile, type NotificationMode, StudioSettingsApi } from '../../core/api/studio-settings';
import { Icon } from '../../shared/ui/icon';
import { NotificationModePicker } from '../../shared/ui/notification-mode';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

type ProfileForm = Pick<MyProfile, 'firstName' | 'lastName' | 'title' | 'phone' | 'professionalOrder' | 'registrationNumber' | 'registrationSection'>;
const TITLES = ['Arch.', 'Ing.', 'Geom.', 'Pian.', 'Dott.', 'P.I.'];

/**
 * Profilo personale (AFU FR-MT-04, BR-08): nome, titolo e iscrizione all'albo. Senza ordine e
 * numero di iscrizione non si firmano relazioni asseverate e verbali.
 */
@Component({
  selector: 'app-settings-profile',
  imports: [Icon, NotificationModePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (profile.value(); as p) {
      <section class="card card-body stack">
        <div class="sign" [class.ok]="p.canSign">
          <ui-icon [name]="p.canSign ? 'shield' : 'alert'" [size]="16" />
          @if (p.canSign) { <span>Puoi firmare relazioni asseverate e verbali come <b>{{ p.title }} {{ p.firstName }} {{ p.lastName }}</b>.</span> }
          @else if (p.role === 'COLLABORATOR') { <span>I Collaboratori non firmano documenti: lo fa un Architetto o l'Owner dello studio.</span> }
          @else { <span>Completa ordine professionale e numero di iscrizione per poter firmare relazioni e verbali.</span> }
        </div>
        <div class="grid g3">
          <div class="field"><label for="sp-title">Titolo</label>
            <select id="sp-title" class="select" (change)="patch({ title: val($event) || null })">
              <option value="" [selected]="!form().title">—</option>
              @for (t of titles; track t) { <option [value]="t" [selected]="t === form().title">{{ t }}</option> }
            </select></div>
          <div class="field"><label for="sp-first">Nome</label><input id="sp-first" class="input" maxlength="80" [value]="form().firstName" (input)="patch({ firstName: val($event) })" /></div>
          <div class="field"><label for="sp-last">Cognome</label><input id="sp-last" class="input" maxlength="80" [value]="form().lastName" (input)="patch({ lastName: val($event) })" /></div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label for="sp-email">Email di accesso</label><input id="sp-email" class="input" [value]="p.email" disabled /></div>
          <div class="field"><label for="sp-phone">Telefono</label><input id="sp-phone" class="input" type="tel" maxlength="30" [value]="form().phone ?? ''" (input)="patch({ phone: val($event) || null })" /></div>
        </div>
        <div class="eyebrow">Iscrizione all'albo</div>
        <div class="field"><label for="sp-order">Ordine o collegio</label>
          <input id="sp-order" class="input" maxlength="120" placeholder="Ordine degli Architetti P.P.C. della Provincia di…" [value]="form().professionalOrder ?? ''" (input)="patch({ professionalOrder: val($event) || null })" /></div>
        <div class="grid grid-2">
          <div class="field"><label for="sp-reg">Numero di iscrizione</label><input id="sp-reg" class="input mono" maxlength="30" [value]="form().registrationNumber ?? ''" (input)="patch({ registrationNumber: val($event) || null })" /></div>
          <div class="field"><label for="sp-sec">Sezione / settore</label><input id="sp-sec" class="input" maxlength="30" placeholder="Es. A — Architettura" [value]="form().registrationSection ?? ''" (input)="patch({ registrationSection: val($event) || null })" /></div>
        </div>
        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
        <div class="actions"><button class="btn btn-primary" [disabled]="!dirty() || !valid() || saving()" (click)="save()">{{ saving() ? 'Salvataggio…' : 'Salva profilo' }}</button></div>
      </section>
      <section class="card card-body stack">
        <div><h3>Avvisi via email</h3>
          <p class="muted small">Commenti e risposte dei committenti sulle commesse a cui sei assegnato. Vale per questo studio.</p></div>
        <ui-notification-mode name="my-notifications" [value]="p.notificationMode" [disabled]="savingMode()" (changed)="setMode($event)" />
      </section>
    } @else if (profile.error()) {
      <div class="card error-box">{{ loadError() }} <button class="btn btn-outline btn-sm" (click)="profile.reload()">Riprova</button></div>
    } @else { <div class="card skeleton"></div> }
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .stack { gap: 14px; max-width: 760px; }
    h3 { margin: 0 0 4px; }
    .g3 { grid-template-columns: 130px 1fr 1fr; }
    .sign { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--warning-soft); font-size: 13.5px; }
    .sign.ok { background: var(--success-soft); color: var(--success); }
    .actions { display: flex; justify-content: flex-end; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    .skeleton { height: 300px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    @media (max-width: 640px) { .g3 { grid-template-columns: 1fr; } }
  `,
})
export class SettingsProfile {
  private readonly api = inject(StudioSettingsApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly titles = TITLES;

  protected readonly profile = resource({ loader: () => this.api.myProfile() });
  protected readonly dirty = signal(false);
  /** Salvare la preferenza degli avvisi aggiorna il profilo: le modifiche non salvate del modulo restano. */
  protected readonly form = linkedSignal<MyProfile | undefined, ProfileForm>({
    source: () => this.profile.value(),
    computation: (p, prev) => (prev && untracked(this.dirty) ? prev.value : {
      firstName: p?.firstName ?? '', lastName: p?.lastName ?? '', title: p?.title ?? null, phone: p?.phone ?? null,
      professionalOrder: p?.professionalOrder ?? null, registrationNumber: p?.registrationNumber ?? null, registrationSection: p?.registrationSection ?? null,
    }),
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(() => !!this.form().firstName.trim() && !!this.form().lastName.trim());
  protected readonly loadError = computed(() => toApiError(this.profile.error()).userMessage);

  protected readonly savingMode = signal(false);

  /** La preferenza si salva subito, indipendentemente dal resto del profilo. */
  protected async setMode(notificationMode: NotificationMode): Promise<void> {
    this.savingMode.set(true);
    try {
      const updated = await this.api.updateMyProfile({ notificationMode });
      this.profile.set(updated);
      this.toaster.show('Preferenza salvata');
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.savingMode.set(false);
    }
  }

  protected patch(p: Partial<ProfileForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    const f = this.form();
    const clean = (s: string | null) => s?.trim() || null;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.updateMyProfile({
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), title: clean(f.title), phone: clean(f.phone),
        professionalOrder: clean(f.professionalOrder), registrationNumber: clean(f.registrationNumber), registrationSection: clean(f.registrationSection),
      });
      this.dirty.set(false);
      this.toaster.show('Profilo salvato');
      this.profile.reload();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.saving.set(false);
    }
  }
}
