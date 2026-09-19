import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { type CheckId, type DerogationCode, type DerogationRule, MIN_JUSTIFICATION_LENGTH, NATIONAL_DM_1975 } from '@aph/rai-engine';
import { toApiError } from '../../core/api/api';
import { RaiApi, type RaiDerogation } from '../../core/api/rai-api';
import { Confirmer } from '../../shared/ui/confirm';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

export const CHECK_LABEL: Record<CheckId, string> = {
  RAI_ILLUMINATING: 'Rapporto illuminante', RAI_VENTILATING: 'Rapporto aerante', HEIGHT: 'Altezza',
  MIN_AREA: 'Superficie minima', VENTILATION: 'Ventilazione', STUDIO_APARTMENT_AREA: 'Superficie del monolocale',
  OCCUPANCY_AREA: 'Superficie per abitante',
};

/** Le verifiche che hanno senso sul vano o sull'intera unità. */
const ROOM_CHECKS: CheckId[] = ['RAI_ILLUMINATING', 'RAI_VENTILATING', 'HEIGHT', 'MIN_AREA', 'VENTILATION'];
const UNIT_CHECKS: CheckId[] = ['STUDIO_APARTMENT_AREA', 'OCCUPANCY_AREA'];
const RULES: DerogationRule[] = NATIONAL_DM_1975.allowedDerogations;

/**
 * Deroghe documentate (AFU FR-M3-12, BR-06): codice, verifiche coperte, motivazione tecnica di
 * almeno 50 caratteri e riferimento normativo. Una deroga rende l'esito "subordinato ad asseverazione".
 */
@Component({
  selector: 'app-rai-derogations',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-between"><h3>Deroghe</h3>
      @if (!readOnly()) { <button class="btn btn-outline btn-sm" (click)="openAdd()"><ui-icon name="plus" [size]="14" /> Deroga</button> }
    </div>
    @for (d of items(); track d.id) {
      <div class="der">
        <div class="row-between"><b>{{ d.code }} · {{ ruleLabel(d.code) }}</b>
          @if (!readOnly()) { <button class="btn btn-ghost btn-icon" (click)="remove(d)" [attr.aria-label]="'Rimuovi deroga ' + d.code"><ui-icon name="x" [size]="14" /></button> }</div>
        <div class="small muted">Copre: {{ coversText(d.covers) }}@if (d.legalReference) { · {{ d.legalReference }} }</div>
        <p class="small">{{ d.justification }}</p>
      </div>
    } @empty { <p class="muted small">Nessuna deroga. Aggiungila solo se una verifica non è soddisfatta e l'intervento lo consente.</p> }

    <ui-dialog [open]="adding()" title="Nuova deroga" [width]="580" (closed)="adding.set(false)">
      <div class="field"><label for="dg-code">Tipo di deroga</label>
        <select id="dg-code" class="select" (change)="pickRule($any(val($event)))">
          @for (r of rules; track r.code) { <option [value]="r.code" [selected]="r.code === code()">{{ r.code }} · {{ r.label }}</option> }
        </select>
        @if (rule()?.requiresMechanicalVentilation) { <span class="hint">Ammessa solo con ventilazione meccanica nel vano.</span> }
      </div>
      <fieldset class="covers"><legend>Verifiche coperte</legend>
        @for (c of availableChecks(); track c) {
          <label class="check"><input type="checkbox" [checked]="covers().includes(c)" (change)="toggleCover(c)" /> {{ checkLabel[c] }}</label>
        } @empty { <p class="muted small">Questa deroga non copre verifiche a questo livello.</p> }
      </fieldset>
      <div class="field"><label for="dg-just">Motivazione tecnica</label>
        <textarea id="dg-just" class="input area" rows="4" maxlength="5000" [value]="justification()" (input)="justification.set(val($event))"></textarea>
        <span class="hint" [class.is-error]="justification().trim().length > 0 && justification().trim().length < min">{{ justification().trim().length }}/{{ min }} caratteri minimi</span>
      </div>
      <div class="field"><label for="dg-ref">Riferimento normativo</label>
        <input id="dg-ref" class="input" maxlength="300" [value]="reference()" (input)="reference.set(val($event))" /></div>
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="adding.set(false)">Annulla</button>
        <button class="btn btn-primary" [disabled]="!valid() || busy()" (click)="save()">Aggiungi deroga</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .der { border: 1px solid var(--line); border-left: 3px solid var(--warning); border-radius: 8px; padding: 8px 12px; display: grid; gap: 4px; }
    .der p { margin: 0; white-space: pre-wrap; }
    .covers { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
    .covers legend { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    .area { height: auto; padding-top: 8px; resize: vertical; }
    .hint.is-error { color: var(--danger); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class RaiDerogations {
  readonly projectId = input.required<string>();
  readonly target = input.required<{ roomId: string } | { unitId: string }>();
  readonly items = input.required<RaiDerogation[]>();
  readonly readOnly = input(false);
  readonly changed = output<void>();

  private readonly api = inject(RaiApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly rules = RULES;
  protected readonly checkLabel = CHECK_LABEL;
  protected readonly min = MIN_JUSTIFICATION_LENGTH;

  protected readonly adding = signal(false);
  protected readonly code = signal<DerogationCode>('D-01');
  protected readonly covers = signal<CheckId[]>([]);
  protected readonly justification = signal('');
  protected readonly reference = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly rule = computed(() => RULES.find((r) => r.code === this.code()) ?? null);
  protected readonly availableChecks = computed(() => {
    const level = 'roomId' in this.target() ? ROOM_CHECKS : UNIT_CHECKS;
    return (this.rule()?.covers ?? []).filter((c) => level.includes(c));
  });
  protected readonly valid = computed(() => this.covers().length > 0 && this.justification().trim().length >= MIN_JUSTIFICATION_LENGTH);

  protected ruleLabel(code: DerogationCode): string {
    return RULES.find((r) => r.code === code)?.label ?? '';
  }

  protected coversText(covers: CheckId[]): string {
    return covers.map((c) => CHECK_LABEL[c]).join(', ');
  }

  protected openAdd(): void {
    const level = 'roomId' in this.target() ? ROOM_CHECKS : UNIT_CHECKS;
    const first = RULES.find((r) => r.covers.some((c) => level.includes(c)));
    this.pickRule(first?.code ?? 'D-99');
    this.justification.set('');
    this.error.set(null);
    this.adding.set(true);
  }

  protected pickRule(code: DerogationCode): void {
    this.code.set(code);
    this.covers.set([]);
    this.reference.set(RULES.find((r) => r.code === code)?.legalReference ?? '');
  }

  protected toggleCover(c: CheckId): void {
    this.covers.update((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.addDerogation(this.projectId(), this.target(), {
        code: this.code(), covers: this.covers(), justification: this.justification().trim(), legalReference: this.reference().trim() || null,
      });
      this.adding.set(false);
      this.toaster.show('Deroga aggiunta: l’esito diventa subordinato ad asseverazione');
      this.changed.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(d: RaiDerogation): Promise<void> {
    const ok = await this.confirmer.ask({ title: `Rimuovere la deroga ${d.code}?`, text: 'Il calcolo verrà aggiornato.', confirmLabel: 'Rimuovi', tone: 'danger' });
    if (!ok) return;
    try {
      await this.api.remove(this.projectId(), 'derogations', d.id);
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }
}
