import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { Ceiling, MechanicalVentilation, OpeningKind, Operability, RoomUse } from '@aph/rai-engine';
import { toApiError } from '../../core/api/api';
import { type OpeningFields, RaiApi, type RaiOpening, type RaiRoom, type RoomFields } from '../../core/api/rai-api';
import { Confirmer } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { num, val } from '../../shared/dom';
import { RaiDerogations } from './rai-derogations';

export const ROOM_USE_LABEL: Record<RoomUse, string> = {
  LIVING_ROOM: 'Soggiorno', SINGLE_BEDROOM: 'Camera singola', DOUBLE_BEDROOM: 'Camera doppia', KITCHEN: 'Cucina abitabile',
  LIVING_WITH_KITCHENETTE: 'Soggiorno con angolo cottura', DINING: 'Pranzo', STUDY: 'Studio', STUDIO_ROOM: 'Monostanza',
  OTHER_HABITABLE: 'Altro abitabile', BATHROOM: 'Bagno', WC: 'WC', LAUNDRY: 'Lavanderia', STORAGE: 'Ripostiglio',
  WALK_IN_CLOSET: 'Cabina armadio', HALLWAY: 'Disimpegno', CORRIDOR: 'Corridoio', STAIRWELL: 'Vano scala',
  TECHNICAL: 'Locale tecnico', ATTIC_NON_HABITABLE: 'Sottotetto non abitabile', OTHER_ACCESSORY: 'Altro accessorio',
};
const OPENING_KIND_LABEL: Record<OpeningKind, string> = {
  WINDOW: 'Finestra', FRENCH_WINDOW: 'Portafinestra', ROOF_WINDOW: 'Finestra in falda', SKYLIGHT: 'Lucernario', FIXED_GLAZING: 'Vetrata fissa', TRANSOM: 'Sopraluce',
};
const OPERABILITY_LABEL: Record<Operability, string> = { FULL: 'Totale', PARTIAL: 'Parziale', FIXED: 'Fissa' };
const VENTILATION_LABEL: Record<MechanicalVentilation, string> = {
  NONE: 'Nessuna', EXTRACTION: 'Aspirazione', MVHR_CENTRAL: 'VMC centralizzata', MVHR_LOCAL: 'VMC puntuale',
};
const DEFAULT_OPENING: Omit<OpeningFields, 'label'> = { kind: 'WINDOW', width: '1.20', height: '1.40', sillHeight: '0.90', operability: 'FULL', quantity: 1 };

/** "" → null, altrimenti il numero con il punto decimale (il server valida max 3 decimali). */
const optionalNum = (e: Event): string | null => num(e) || null;

/**
 * Scheda del vano con aperture e deroghe (AFU FR-M3-03/06/12). Ogni campo si salva quando lo si
 * lascia; il calcolo lo rifà il server con lo stesso motore (FR-M3-08) e la pagina si aggiorna.
 */
@Component({
  selector: 'app-rai-room-form',
  imports: [Icon, RaiDerogations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = room();
    <div class="card-header">
      <input class="title" [value]="r.name" [disabled]="readOnly()" (change)="save({ name: val($event).trim() || r.name })" aria-label="Nome del vano" />
      <input class="code mono" placeholder="Cod." [value]="r.code ?? ''" [disabled]="readOnly()" (change)="save({ code: val($event).trim() || null })" aria-label="Codice del vano" />
      @if (!readOnly()) { <button class="btn btn-ghost btn-icon" title="Elimina vano" (click)="remove()"><ui-icon name="trash" [size]="16" /></button> }
    </div>
    <fieldset class="card-body stack" [disabled]="readOnly()">
      <div class="grid grid-3">
        <div class="field"><label [for]="id('use')">Destinazione</label>
          <select [id]="id('use')" class="select" (change)="save({ use: $any(val($event)) })">
            @for (u of uses; track u[0]) { <option [value]="u[0]" [selected]="u[0] === r.use">{{ u[1] }}</option> }
          </select></div>
        <div class="field"><label [for]="id('sp')">Superficie Sp</label>
          <div class="input-group"><input [id]="id('sp')" class="input mono" inputmode="decimal" [value]="r.floorArea" (change)="save({ floorArea: num($event) })" /><span class="addon">mq</span></div></div>
        <div class="field"><label [for]="id('nc')">Non computabile</label>
          <div class="input-group"><input [id]="id('nc')" class="input mono" inputmode="decimal" placeholder="0" [value]="r.nonComputableArea ?? ''" (change)="save({ nonComputableArea: opt($event) })" /><span class="addon">mq</span></div></div>
      </div>
      <div class="grid grid-3">
        <div class="field"><label [for]="id('ceil')">Soffitto</label>
          <select [id]="id('ceil')" class="select" (change)="setCeiling(val($event))">
            <option value="FLAT" [selected]="r.ceiling.type === 'FLAT'">Piano</option>
            <option value="SLOPED" [selected]="r.ceiling.type === 'SLOPED'">Inclinato</option>
            <option value="MANUAL" [selected]="r.ceiling.type === 'MANUAL'">Altezza media manuale</option>
          </select></div>
        @switch (r.ceiling.type) {
          @case ('FLAT') { <div class="field"><label [for]="id('h')">Altezza utile</label><div class="input-group"><input [id]="id('h')" class="input mono" inputmode="decimal" [value]="ceilingValue('height')" (change)="setCeiling('FLAT', { height: num($event) })" /><span class="addon">m</span></div></div> }
          @case ('SLOPED') {
            <div class="field"><label [for]="id('hmin')">Altezza minima</label><div class="input-group"><input [id]="id('hmin')" class="input mono" inputmode="decimal" [value]="ceilingValue('minHeight')" (change)="setCeiling('SLOPED', { minHeight: num($event) })" /><span class="addon">m</span></div></div>
            <div class="field"><label [for]="id('hmax')">Altezza massima</label><div class="input-group"><input [id]="id('hmax')" class="input mono" inputmode="decimal" [value]="ceilingValue('maxHeight')" (change)="setCeiling('SLOPED', { maxHeight: num($event) })" /><span class="addon">m</span></div></div>
          }
          @case ('MANUAL') { <div class="field"><label [for]="id('havg')">Altezza media</label><div class="input-group"><input [id]="id('havg')" class="input mono" inputmode="decimal" [value]="ceilingValue('averageHeight')" (change)="setCeiling('MANUAL', { averageHeight: num($event) })" /><span class="addon">m</span></div></div> }
        }
      </div>
      <div class="row opts">
        <label class="check"><input type="checkbox" [checked]="r.isWindowless" (change)="save({ isWindowless: checked($event) })" /> Vano cieco</label>
        <label class="inline"><span class="small muted">Ventilazione meccanica</span>
          <select class="select select-sm" (change)="save({ mechanicalVentilation: $any(val($event)) })">
            @for (v of ventilations; track v[0]) { <option [value]="v[0]" [selected]="v[0] === r.mechanicalVentilation">{{ v[1] }}</option> }
          </select></label>
      </div>

      <div class="divider"></div>
      <div class="row-between"><h3>Aperture</h3>
        @if (!readOnly()) { <button class="btn btn-outline btn-sm" type="button" [disabled]="busy()" (click)="addOpening()"><ui-icon name="plus" [size]="14" /> Apertura</button> }</div>
      @if (r.openings.length) {
        <div class="ot-wrap"><table class="table ot">
          <thead><tr><th>Sigla</th><th>Tipo</th><th>Q.tà</th><th>L (m)</th><th>H (m)</th><th>Davanz. (m)</th><th>Apribilità</th><th>Sa (mq)</th><th>Aggetto (m)</th><th>Esterno idoneo</th><th></th></tr></thead>
          <tbody>
            @for (o of r.openings; track o.id) {
              <tr>
                <td><input class="input input-sm" style="width:64px" [value]="o.label" (change)="saveOpening(o, { label: val($event).trim() || o.label })" aria-label="Sigla" /></td>
                <td><select class="select select-sm" style="min-width:140px" (change)="saveOpening(o, { kind: $any(val($event)) })" aria-label="Tipo">
                  @for (k of kinds; track k[0]) { <option [value]="k[0]" [selected]="k[0] === o.kind">{{ k[1] }}</option> }</select></td>
                <td><input class="input input-sm mono" style="width:54px" type="number" min="1" max="50" [value]="o.quantity" (change)="saveOpening(o, { quantity: +val($event) || 1 })" aria-label="Quantità" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.width" (change)="saveOpening(o, { width: num($event) })" aria-label="Larghezza" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.height" (change)="saveOpening(o, { height: num($event) })" aria-label="Altezza" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.sillHeight ?? ''" [disabled]="isRoof(o.kind)" (change)="saveOpening(o, { sillHeight: opt($event) })" aria-label="Davanzale" /></td>
                <td><select class="select select-sm" style="min-width:100px" (change)="saveOpening(o, { operability: $any(val($event)) })" aria-label="Apribilità">
                  @for (p of operabilities; track p[0]) { <option [value]="p[0]" [selected]="p[0] === o.operability">{{ p[1] }}</option> }</select></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.openableArea ?? ''" [disabled]="o.operability !== 'PARTIAL'" (change)="saveOpening(o, { openableArea: opt($event) })" aria-label="Superficie apribile" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" placeholder="—" [value]="o.overhangDepth ?? ''" (change)="saveOpening(o, { overhangDepth: opt($event) })" aria-label="Aggetto" /></td>
                <td class="center"><input type="checkbox" [checked]="o.facesSuitableSpace" (change)="saveOpening(o, { facesSuitableSpace: checked($event) })" aria-label="Affaccia su spazio idoneo" title="Deselezionare se dà su cavedio o chiostrina non idonei" /></td>
                <td>@if (!readOnly()) { <button class="btn btn-ghost btn-icon" type="button" (click)="removeOpening(o)" title="Rimuovi"><ui-icon name="x" [size]="14" /></button> }</td>
              </tr>
            }
          </tbody>
        </table></div>
      } @else { <p class="muted small">Nessuna apertura. Se il vano è cieco, spunta "Vano cieco" e indica la ventilazione meccanica.</p> }

      <div class="divider"></div>
      <app-rai-derogations [projectId]="projectId()" [target]="{ roomId: r.id }" [items]="r.derogations" [readOnly]="readOnly()" (changed)="changed.emit()" />

      <div class="field"><label [for]="id('notes')">Note</label>
        <textarea [id]="id('notes')" class="input area" rows="2" maxlength="2000" [value]="r.notes ?? ''" (change)="save({ notes: val($event).trim() || null })"></textarea></div>
    </fieldset>
  `,
  styles: `
    .card-header { gap: 8px; }
    .title { border: 0; background: transparent; font: inherit; font-weight: 600; font-size: 16px; padding: 4px 0; flex: 1; min-width: 0; outline: 0; border-bottom: 1px solid transparent; color: inherit; }
    .title:focus { border-bottom-color: var(--color-primary); }
    .code { width: 70px; border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font-size: 12.5px; background: transparent; color: inherit; }
    fieldset { border: 0; margin: 0; min-width: 0; gap: 16px; }
    .opts { gap: 18px; flex-wrap: wrap; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    .inline { display: flex; gap: 8px; align-items: center; }
    .inline .select { width: auto; }
    .ot-wrap { overflow-x: auto; margin: 0 -20px; padding: 0 20px; }
    .ot th, .ot td { padding: 6px; white-space: nowrap; }
    .ot th:first-child, .ot td:first-child { padding-left: 0; }
    .center { text-align: center; }
    .area { height: auto; padding-top: 8px; resize: vertical; }
  `,
})
export class RaiRoomForm {
  readonly projectId = input.required<string>();
  readonly room = input.required<RaiRoom>();
  readonly readOnly = input(false);
  /** Dopo ogni salvataggio: la pagina ricarica struttura ed esiti. */
  readonly changed = output<void>();
  readonly removed = output<void>();

  private readonly api = inject(RaiApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly num = num;
  protected readonly opt = optionalNum;
  protected readonly uses = Object.entries(ROOM_USE_LABEL) as [RoomUse, string][];
  protected readonly kinds = Object.entries(OPENING_KIND_LABEL) as [OpeningKind, string][];
  protected readonly operabilities = Object.entries(OPERABILITY_LABEL) as [Operability, string][];
  protected readonly ventilations = Object.entries(VENTILATION_LABEL) as [MechanicalVentilation, string][];
  protected readonly busy = signal(false);

  protected id(name: string): string {
    return `room-${this.room().id}-${name}`;
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected isRoof(kind: OpeningKind): boolean {
    return kind === 'ROOF_WINDOW' || kind === 'SKYLIGHT';
  }

  protected ceilingValue(key: string): string {
    return (this.room().ceiling as unknown as Record<string, string>)[key] ?? '';
  }

  protected setCeiling(type: string, values: Record<string, string> = {}): void {
    const current = this.room().ceiling as unknown as Record<string, string>;
    const base: Record<string, string> =
      type === 'FLAT' ? { height: current['height'] ?? current['averageHeight'] ?? '2.70' }
      : type === 'SLOPED' ? { minHeight: current['minHeight'] ?? '2.20', maxHeight: current['maxHeight'] ?? '3.20' }
      : { averageHeight: current['averageHeight'] ?? current['height'] ?? '2.70' };
    void this.save({ ceiling: { type, ...base, ...values } as unknown as Ceiling });
  }

  protected async save(patch: Partial<RoomFields>): Promise<void> {
    await this.run(() => this.api.updateRoom(this.projectId(), this.room().id, patch));
  }

  protected async saveOpening(o: RaiOpening, patch: Partial<OpeningFields>): Promise<void> {
    // Con apribilità parziale serve la superficie apribile: se manca si propone metà della luce.
    if (patch.operability === 'PARTIAL' && !o.openableArea) {
      patch = { ...patch, openableArea: ((Number(o.width) * Number(o.height)) / 2).toFixed(3) };
    }
    await this.run(() => this.api.updateOpening(this.projectId(), o.id, patch));
  }

  protected async addOpening(): Promise<void> {
    const label = `F${this.room().openings.length + 1}`;
    await this.run(() => this.api.createOpening(this.projectId(), this.room().id, { label, ...DEFAULT_OPENING }));
  }

  protected async removeOpening(o: RaiOpening): Promise<void> {
    await this.run(() => this.api.remove(this.projectId(), 'openings', o.id));
  }

  protected async remove(): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Eliminare "${this.room().name}"?`, text: 'Si eliminano anche aperture e deroghe del vano. Le revisioni già emesse restano invariate.',
      confirmLabel: 'Elimina', tone: 'danger',
    });
    if (!ok) return;
    await this.run(() => this.api.remove(this.projectId(), 'rooms', this.room().id));
    this.removed.emit();
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(false);
      // Anche dopo un errore: i campi tornano ai valori salvati.
      this.changed.emit();
    }
  }
}
