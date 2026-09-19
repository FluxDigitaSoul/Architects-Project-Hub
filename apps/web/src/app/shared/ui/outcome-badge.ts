import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Outcome } from '@aph/rai-engine';

export const OUTCOME_LABEL: Record<Outcome | 'NONE', string> = {
  COMPLIANT: 'Conforme',
  NON_COMPLIANT: 'Non conforme',
  SUBJECT_TO_ATTESTATION: 'Subordinato ad asseverazione',
  INCOMPLETE: 'Dati incompleti',
  NOT_REQUIRED: 'Non richiesto',
  INVALID_INPUT: 'Dati non validi',
  NONE: 'Nessun dato',
};

const OUTCOME_CLASS: Record<Outcome | 'NONE', string> = {
  COMPLIANT: 'badge-success',
  NON_COMPLIANT: 'badge-danger',
  SUBJECT_TO_ATTESTATION: 'badge-warning',
  INCOMPLETE: '',
  NOT_REQUIRED: 'badge-plain',
  INVALID_INPUT: 'badge-danger',
  NONE: 'badge-plain',
};

/** Badge degli esiti normativi: colori semantici fissi + testo sempre presente (AFU FR-M3-10, NFR-UX-05). */
@Component({
  selector: 'ui-outcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="cls()">{{ label() }}@if (detail()) {<span class="mono"> · {{ detail() }}</span>}</span>`,
})
export class OutcomeBadge {
  readonly outcome = input.required<Outcome | 'NONE'>();
  readonly detail = input<string>();
  readonly label = computed(() => OUTCOME_LABEL[this.outcome()]);
  readonly cls = computed(() => `badge ${OUTCOME_CLASS[this.outcome()]}`);
}
