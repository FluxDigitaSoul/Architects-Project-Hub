import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { ThresholdCheck, UnitResult, UnitType } from '@aph/rai-engine';
import { toApiError } from '../../core/api/api';
import { RaiApi, type RaiUnit, type RegulationProfileOption, type UnitFields } from '../../core/api/rai-api';
import { fmtNum } from '../../core/data/format';
import { Confirmer } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { OutcomeBadge } from '../../shared/ui/outcome-badge';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { RaiDerogations } from './rai-derogations';

const UNIT_TYPE_LABEL: Record<UnitType, string> = { DWELLING: 'Abitazione', STUDIO_APARTMENT: 'Monolocale', OTHER: 'Altro' };
const STATUS_LABEL = { PASSED: 'Verificata', FAILED: 'Non verificata', COVERED_BY_DEROGATION: 'In deroga' } as const;

/** Dati e verifiche dell'unità immobiliare (AFU FR-M3-02, FR-M3-13: monolocale e superficie per abitante). */
@Component({
  selector: 'app-rai-unit-panel',
  imports: [Icon, OutcomeBadge, RaiDerogations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let u = unit();
    <div class="card-header">
      <input class="title" [value]="u.name" [disabled]="readOnly()" (change)="save({ name: val($event).trim() || u.name })" aria-label="Nome dell'unità" />
      @if (result(); as r) { <ui-outcome [outcome]="r.outcome" /> }
      @if (!readOnly()) { <button class="btn btn-ghost btn-icon" title="Elimina unità" (click)="remove()"><ui-icon name="trash" [size]="16" /></button> }
    </div>
    <fieldset class="card-body stack" [disabled]="readOnly()">
      <div class="grid grid-3">
        <div class="field"><label [for]="id('type')">Tipo</label>
          <select [id]="id('type')" class="select" (change)="save({ unitType: $any(val($event)) })">
            @for (t of types; track t[0]) { <option [value]="t[0]" [selected]="t[0] === u.unitType">{{ t[1] }}</option> }
          </select></div>
        <div class="field"><label [for]="id('floor')">Piano</label>
          <input [id]="id('floor')" class="input" maxlength="20" [value]="u.floor ?? ''" (change)="save({ floor: val($event).trim() || null })" /></div>
        <div class="field"><label [for]="id('occ')">Occupanti previsti</label>
          <input [id]="id('occ')" class="input mono" type="number" min="1" max="50" [value]="u.occupants ?? ''" (change)="save({ occupants: +val($event) || null })" /></div>
      </div>
      <div class="grid grid-2">
        <label class="check"><input type="checkbox" [checked]="u.isAttic" (change)="save({ isAttic: $any($event.target).checked })" /> Sottotetto (rapporti per aperture in falda)</label>
        <div class="field"><label [for]="id('prof')">Profilo normativo dell'unità</label>
          <select [id]="id('prof')" class="select" (change)="save({ regulationProfileVersionId: val($event) || null })">
            <option value="" [selected]="!u.regulationProfileVersionId">Come la commessa</option>
            @for (p of profiles(); track p.versionId) { <option [value]="p.versionId" [selected]="p.versionId === u.regulationProfileVersionId">{{ p.name }} (v{{ p.version }})</option> }
          </select></div>
      </div>

      @if (result(); as r) {
        <div class="checks">
          <div class="kv"><span class="k">Vani</span><span class="v">{{ r.rooms.length }} · {{ r.counts.COMPLIANT }} conformi · {{ r.counts.NON_COMPLIANT }} non conformi</span></div>
          <div class="kv"><span class="k">Superficie computabile</span><span class="v mono">{{ n(r.totals.computableArea) }} mq</span></div>
          @if (r.studioApartment; as c) {
            <div class="kv"><span class="k">Monolocale (min.)</span><span class="v mono">{{ n(c.value) }} / {{ n(c.minimum) }} mq</span><span [class]="'st ' + c.status">{{ st(c) }}</span></div> }
          @if (r.occupancy; as c) {
            <div class="kv"><span class="k">Superficie per abitanti</span><span class="v mono">{{ n(c.value) }} / {{ n(c.minimum) }} mq</span><span [class]="'st ' + c.status">{{ st(c) }}</span></div> }
          @for (note of r.notes; track $index) { <p class="note small"><ui-icon name="info" [size]="13" /> {{ note.message }}</p> }
        </div>
      }

      <app-rai-derogations [projectId]="projectId()" [target]="{ unitId: u.id }" [items]="u.derogations" [readOnly]="readOnly()" (changed)="changed.emit()" />
    </fieldset>
  `,
  styles: `
    .card-header { gap: 10px; }
    .title { border: 0; background: transparent; font: inherit; font-weight: 600; font-size: 16px; padding: 4px 0; flex: 1; min-width: 0; outline: 0; border-bottom: 1px solid transparent; color: inherit; }
    .title:focus { border-bottom-color: var(--color-primary); }
    fieldset { border: 0; margin: 0; min-width: 0; gap: 14px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; align-self: end; padding-bottom: 8px; }
    .checks { display: grid; gap: 6px; padding: 10px 12px; background: var(--surface-2); border-radius: 8px; }
    .kv { display: grid; grid-template-columns: 180px 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
    .k { color: var(--muted); }
    .st { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .st.PASSED { background: var(--success-soft); color: var(--success); } .st.FAILED { background: var(--danger-soft); color: var(--danger); } .st.COVERED_BY_DEROGATION { background: var(--warning-soft); color: var(--warning); }
    .note { display: flex; gap: 6px; margin: 0; color: var(--ink-2); }
  `,
})
export class RaiUnitPanel {
  readonly projectId = input.required<string>();
  readonly unit = input.required<RaiUnit>();
  readonly result = input<UnitResult | null>(null);
  readonly profiles = input<RegulationProfileOption[]>([]);
  readonly readOnly = input(false);
  readonly changed = output<void>();
  readonly removed = output<void>();

  private readonly api = inject(RaiApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly n = fmtNum;
  protected readonly types = Object.entries(UNIT_TYPE_LABEL) as [UnitType, string][];

  protected id(name: string): string {
    return `unit-${this.unit().id}-${name}`;
  }

  protected st(c: ThresholdCheck): string {
    return STATUS_LABEL[c.status];
  }

  protected async save(patch: Partial<UnitFields>): Promise<void> {
    try {
      await this.api.updateUnit(this.projectId(), this.unit().id, patch);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.changed.emit();
  }

  protected async remove(): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Eliminare "${this.unit().name}"?`, text: 'Si eliminano tutti i vani, le aperture e le deroghe dell’unità.', confirmLabel: 'Elimina', tone: 'danger',
    });
    if (!ok) return;
    try {
      await this.api.remove(this.projectId(), 'units', this.unit().id);
      this.removed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.changed.emit();
  }
}
