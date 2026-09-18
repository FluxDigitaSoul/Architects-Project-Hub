import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { Ceiling, OpeningInput, OpeningKind, RoomInput, RoomUse } from '@aph/rai-engine';
import { RaiStore } from '../../core/data/rai-store';
import { Icon } from '../../shared/ui/icon';
import { num, val } from '../../shared/dom';

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

/** Scheda del vano e tabella delle aperture (AFU FR-M3-03, FR-M3-06). Ogni modifica ricalcola subito. */
@Component({
  selector: 'app-rai-room-form',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card-header">
      <input class="title" [value]="room().name" (input)="patch({ name: val($event) })" aria-label="Nome del vano" />
      <button class="btn btn-ghost btn-icon" title="Elimina vano" (click)="remove()"><ui-icon name="trash" [size]="16" /></button>
    </div>
    <div class="card-body stack" style="gap:16px">
      <div class="grid grid-3">
        <div class="field"><label>Destinazione</label>
          <select class="select" (change)="patch({ use: $any(val($event)) })">
            @for (u of uses; track u[0]) { <option [value]="u[0]" [selected]="u[0] === room().use">{{ u[1] }}</option> }
          </select>
        </div>
        <div class="field"><label>Superficie Sp</label><div class="input-group"><input class="input mono" inputmode="decimal" [value]="room().floorArea" (change)="patch({ floorArea: num($event) })" /><span class="addon">mq</span></div></div>
        <div class="field"><label>Non computabile</label><div class="input-group"><input class="input mono" inputmode="decimal" placeholder="0" [value]="room().nonComputableArea ?? ''" (change)="patch({ nonComputableArea: num($event) || undefined })" /><span class="addon">mq</span></div></div>
      </div>
      <div class="grid grid-3">
        <div class="field"><label>Soffitto</label>
          <select class="select" [value]="room().ceiling.type" (change)="setCeiling(val($event))">
            <option value="FLAT">Piano</option><option value="SLOPED">Inclinato</option><option value="MANUAL">Altezza media manuale</option>
          </select>
        </div>
        @switch (room().ceiling.type) {
          @case ('FLAT') { <div class="field"><label>Altezza utile</label><div class="input-group"><input class="input mono" inputmode="decimal" [value]="$any(room().ceiling).height" (change)="setCeiling('FLAT', { height: num($event) })" /><span class="addon">m</span></div></div> }
          @case ('SLOPED') {
            <div class="field"><label>Altezza min</label><div class="input-group"><input class="input mono" inputmode="decimal" [value]="$any(room().ceiling).minHeight" (change)="setCeiling('SLOPED', { minHeight: num($event) })" /><span class="addon">m</span></div></div>
            <div class="field"><label>Altezza max</label><div class="input-group"><input class="input mono" inputmode="decimal" [value]="$any(room().ceiling).maxHeight" (change)="setCeiling('SLOPED', { maxHeight: num($event) })" /><span class="addon">m</span></div></div>
          }
          @case ('MANUAL') { <div class="field"><label>Altezza media</label><div class="input-group"><input class="input mono" inputmode="decimal" [value]="$any(room().ceiling).averageHeight" (change)="setCeiling('MANUAL', { averageHeight: num($event) })" /><span class="addon">m</span></div></div> }
        }
      </div>
      <div class="row" style="gap:18px;flex-wrap:wrap">
        <label class="check"><input type="checkbox" [checked]="room().isWindowless ?? false" (change)="patch({ isWindowless: $any($event.target).checked })" /> Vano cieco</label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="small muted">Ventilazione meccanica</span>
          <select class="select select-sm" style="width:auto" [value]="room().mechanicalVentilation ?? 'NONE'" (change)="patch({ mechanicalVentilation: $any(val($event)) })">
            <option value="NONE">Nessuna</option><option value="EXTRACTION">Aspirazione</option><option value="MVHR_CENTRAL">VMC centralizzata</option><option value="MVHR_LOCAL">VMC puntuale</option>
          </select>
        </label>
      </div>

      <div class="divider"></div>
      <div class="row-between"><h3>Aperture</h3><button class="btn btn-outline btn-sm" (click)="rai.addOpening(projectId(), room().id)"><ui-icon name="plus" [size]="14" /> Apertura</button></div>
      @if (room().openings.length) {
        <div class="ot-wrap"><table class="table ot">
          <thead><tr><th>Sigla</th><th>Tipo</th><th>Q.tà</th><th>L (m)</th><th>H (m)</th><th>Davanz. (m)</th><th>Apribilità</th><th>Sa (mq)</th><th>Aggetto (m)</th><th></th></tr></thead>
          <tbody>
            @for (o of room().openings; track o.id) {
              <tr>
                <td><input class="input input-sm" style="width:64px" [value]="o.label" (change)="po(o.id, { label: val($event) })" /></td>
                <td><select class="select select-sm" style="min-width:150px" (change)="po(o.id, { kind: $any(val($event)) })">@for (k of kinds; track k[0]) { <option [value]="k[0]" [selected]="k[0] === o.kind">{{ k[1] }}</option> }</select></td>
                <td><input class="input input-sm mono" style="width:54px" type="number" min="1" [value]="o.quantity" (change)="po(o.id, { quantity: +val($event) })" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.width" (change)="po(o.id, { width: num($event) })" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.height" (change)="po(o.id, { height: num($event) })" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.sillHeight ?? ''" [disabled]="isRoof(o.kind)" (change)="po(o.id, { sillHeight: num($event) || undefined })" /></td>
                <td><select class="select select-sm" style="min-width:110px" (change)="po(o.id, { operability: $any(val($event)) })"><option value="FULL" [selected]="o.operability === 'FULL'">Totale</option><option value="PARTIAL" [selected]="o.operability === 'PARTIAL'">Parziale</option><option value="FIXED" [selected]="o.operability === 'FIXED'">Fissa</option></select></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" [value]="o.openableArea ?? ''" [disabled]="o.operability !== 'PARTIAL'" (change)="po(o.id, { openableArea: num($event) || undefined })" /></td>
                <td><input class="input input-sm mono" style="width:70px" inputmode="decimal" placeholder="—" [value]="o.overhangDepth ?? ''" (change)="po(o.id, { overhangDepth: num($event) || undefined })" /></td>
                <td><button class="btn btn-ghost btn-icon" (click)="rai.removeOpening(projectId(), room().id, o.id)" title="Rimuovi"><ui-icon name="x" [size]="14" /></button></td>
              </tr>
            }
          </tbody>
        </table></div>
      } @else { <p class="muted small">Nessuna apertura. Se il vano è cieco, spunta "Vano cieco" e indica la ventilazione.</p> }
    </div>
  `,
  styles: `
    .title { border: 0; background: transparent; font: inherit; font-weight: 600; font-size: 16px; padding: 4px 0; flex: 1; outline: 0; border-bottom: 1px solid transparent; }
    .title:focus { border-bottom-color: var(--color-primary); }
    .ot-wrap { overflow-x: auto; margin: 0 -20px; padding: 0 20px; }
    .ot th, .ot td { padding: 6px 6px; }
    .ot th:first-child, .ot td:first-child { padding-left: 0; }
  `,
})
export class RaiRoomForm {
  readonly projectId = input.required<string>();
  readonly room = input.required<RoomInput>();
  readonly removed = output<void>();
  protected readonly rai = inject(RaiStore);
  protected readonly val = val;
  protected readonly num = num;
  protected readonly uses = Object.entries(ROOM_USE_LABEL) as [RoomUse, string][];
  protected readonly kinds = Object.entries(OPENING_KIND_LABEL) as [OpeningKind, string][];

  protected isRoof(kind: OpeningKind): boolean {
    return kind === 'ROOF_WINDOW' || kind === 'SKYLIGHT';
  }

  protected patch(p: Partial<RoomInput>): void {
    this.rai.updateRoom(this.projectId(), this.room().id, p);
  }

  protected po(openingId: string, p: Partial<OpeningInput>): void {
    this.rai.updateOpening(this.projectId(), this.room().id, openingId, p);
  }

  protected setCeiling(type: string, values: Record<string, string> = {}): void {
    const current = this.room().ceiling as unknown as Record<string, string>;
    const base: Record<string, string> =
      type === 'FLAT' ? { height: current['height'] ?? current['averageHeight'] ?? '2.70' }
      : type === 'SLOPED' ? { minHeight: current['minHeight'] ?? '2.20', maxHeight: current['maxHeight'] ?? '3.20' }
      : { averageHeight: current['averageHeight'] ?? current['height'] ?? '2.70' };
    this.patch({ ceiling: { type, ...base, ...values } as unknown as Ceiling });
  }

  protected remove(): void {
    this.rai.removeRoom(this.projectId(), this.room().id);
    this.removed.emit();
  }
}
