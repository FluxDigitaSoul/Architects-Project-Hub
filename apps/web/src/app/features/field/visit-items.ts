import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { FieldOps } from '../../core/field/field-ops';
import {
  type ItemInput,
  type ReportItem,
  type ReportSection,
  SECTION_LABEL,
  SEVERITY_LABEL,
  type Severity,
} from '../../core/api/field-api';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const SECTIONS: ReportSection[] = ['PROGRESS', 'ISSUES', 'ORDERS', 'GENERAL'];
const PLACEHOLDER: Record<ReportSection, string> = {
  PROGRESS: 'Es. Completati i massetti al piano primo.',
  ISSUES: 'Es. Quota del davanzale della camera diversa dal progetto (95 cm anziché 90).',
  ORDERS: 'Es. Ripristinare la quota del davanzale entro il prossimo sopralluogo.',
  GENERAL: 'Es. Cantiere ordinato, recinzione integra.',
};

/**
 * Voci del verbale per sezione (AFU FR-M4-06/09/10): avanzamento, difformità con gravità,
 * disposizioni con destinatario e scadenza. Le voci da verificare (es. proposte dall'AI) vanno
 * confermate prima della finalizzazione (BR-05).
 */
@Component({
  selector: 'app-visit-items',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of sections; track s) {
      <section class="card sec">
        <div class="card-header"><h3>{{ label[s] }}</h3><span class="badge badge-plain">{{ bySection()[s].length }}</span></div>
        <ul class="items">
          @for (it of bySection()[s]; track it.id) {
            <li [class.verify]="it.needsVerification" [class.pending]="it.pending">
              @if (it.pending) { <span class="sync small"><ui-icon name="refresh" [size]="12" /> Salvata sul telefono, in attesa di rete</span> }
              <textarea class="input area" rows="2" maxlength="5000" [value]="it.text" [disabled]="readOnly()" (change)="patch(it, { text: val($event).trim() || it.text })" aria-label="Testo della voce"></textarea>
              <div class="meta">
                @if (s === 'ISSUES') {
                  <select class="select select-sm" [disabled]="readOnly()" (change)="patch(it, { severity: $any(val($event)) || null })" aria-label="Gravità">
                    <option value="" [selected]="!it.severity">Gravità…</option>
                    @for (g of severities; track g) { <option [value]="g" [selected]="g === it.severity">{{ severityLabel[g] }}</option> }
                  </select>
                }
                @if (s === 'ORDERS' || s === 'ISSUES') {
                  <input class="input input-sm" placeholder="Destinatario (es. impresa)" maxlength="150" [value]="it.addressee ?? ''" [disabled]="readOnly()" (change)="patch(it, { addressee: val($event).trim() || null })" aria-label="Destinatario" />
                  <input class="input input-sm" type="date" [value]="it.dueDate ?? ''" [disabled]="readOnly()" (change)="patch(it, { dueDate: val($event) || null })" aria-label="Scadenza" />
                }
                <span class="spacer"></span>
                @if (it.needsVerification) {
                  <span class="badge badge-warning">Da verificare</span>
                  @if (!readOnly()) { <button class="btn btn-outline btn-sm" (click)="patch(it, { needsVerification: false })"><ui-icon name="check" [size]="13" /> Confermo</button> }
                }
                @if (!readOnly()) { <button class="btn btn-ghost btn-icon" (click)="remove(it)" aria-label="Elimina voce"><ui-icon name="trash" [size]="14" /></button> }
              </div>
            </li>
          }
        </ul>
        @if (!readOnly()) {
          <div class="add">
            <textarea class="input area" rows="2" maxlength="5000" [placeholder]="placeholder[s]" [value]="drafts()[s]" (input)="setDraft(s, val($event))" [attr.aria-label]="'Nuova voce: ' + label[s]"></textarea>
            <button class="btn btn-outline btn-sm" [disabled]="!drafts()[s].trim() || busy()" (click)="add(s)"><ui-icon name="plus" [size]="14" /> Aggiungi</button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .sec { overflow: hidden; }
    .items { list-style: none; margin: 0; padding: 0; }
    .items li { padding: 10px 16px; border-bottom: 1px solid var(--line); display: grid; gap: 6px; }
    .items li.verify { background: var(--warning-soft); }
    .items li.pending { border-left: 3px solid var(--info, #2563eb); }
    .sync { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); }
    .meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .meta .select, .meta .input { width: auto; }
    .spacer { flex: 1; }
    .area { height: auto; padding-top: 6px; resize: vertical; }
    .add { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px 16px; align-items: end; }
    @media (max-width: 560px) { .add { grid-template-columns: 1fr; } }
  `,
})
export class VisitItems {
  readonly projectId = input.required<string>();
  readonly visitId = input.required<string>();
  readonly items = input.required<ReportItem[]>();
  readonly readOnly = input(false);
  readonly changed = output<void>();

  private readonly ops = inject(FieldOps);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly sections = SECTIONS;
  protected readonly label = SECTION_LABEL;
  protected readonly placeholder = PLACEHOLDER;
  protected readonly severityLabel = SEVERITY_LABEL;
  protected readonly severities = Object.keys(SEVERITY_LABEL) as Severity[];
  protected readonly busy = signal(false);
  protected readonly drafts = signal<Record<ReportSection, string>>({ PROGRESS: '', ISSUES: '', ORDERS: '', GENERAL: '' });

  protected readonly bySection = computed(() => {
    const out: Record<ReportSection, ReportItem[]> = { PROGRESS: [], ISSUES: [], ORDERS: [], GENERAL: [] };
    for (const it of this.items()) out[it.section].push(it);
    return out;
  });

  protected setDraft(s: ReportSection, text: string): void {
    this.drafts.update((d) => ({ ...d, [s]: text }));
  }

  /** Le modifiche passano dalla coda del cantiere: con la rete partono subito, senza restano sul telefono (FR-M4-14). */
  protected async add(s: ReportSection): Promise<void> {
    const text = this.drafts()[s].trim();
    if (!text) return;
    const input: ItemInput = { section: s, text, sortOrder: this.bySection()[s].length };
    this.setDraft(s, '');
    await this.run(() => this.ops.enqueue({ kind: 'add-item', projectId: this.projectId(), visitId: this.visitId(), input }));
  }

  protected async patch(it: ReportItem, patch: Partial<ItemInput>): Promise<void> {
    // Modificare il testo di una proposta dell'AI la rende "rivista" (tracciabilità, FR-M4-10).
    const origin = patch.text && it.origin === 'AI' ? { origin: 'AI_EDITED' as const } : {};
    await this.run(() => this.ops.enqueue({
      kind: 'update-item', projectId: this.projectId(), visitId: this.visitId(), itemId: it.id, patch: { ...patch, ...origin },
    }));
  }

  protected async remove(it: ReportItem): Promise<void> {
    await this.run(() => this.ops.enqueue({ kind: 'remove-item', projectId: this.projectId(), visitId: this.visitId(), itemId: it.id }));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(false);
      this.changed.emit();
    }
  }
}
