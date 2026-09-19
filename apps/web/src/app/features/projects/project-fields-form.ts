import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import {
  INTERVENTION_LABEL,
  type InterventionType,
  PERMIT_LABEL,
  type PermitType,
  type ProjectDetail,
  type ProjectFields,
} from '../../core/api/projects-api';
import { val } from '../../shared/dom';

/** Bozza dei dati della commessa (stringhe vuote = campo non compilato). */
export interface ProjectDraft {
  title: string;
  description: string;
  interventionType: InterventionType;
  permitType: PermitType | '';
  street: string;
  number: string;
  zip: string;
  city: string;
  province: string;
  municipality: string;
  startDate: string;
  endDate: string;
}

export const emptyProject = (): ProjectDraft => ({
  title: '', description: '', interventionType: 'RENOVATION', permitType: '', street: '', number: '', zip: '',
  city: '', province: '', municipality: '', startDate: '', endDate: '',
});

export const projectToDraft = (p: ProjectDetail): ProjectDraft => ({
  title: p.title, description: p.description ?? '', interventionType: p.interventionType, permitType: p.permitType ?? '',
  street: p.siteAddress.street, number: p.siteAddress.number ?? '', zip: p.siteAddress.zip ?? '', city: p.siteAddress.city,
  province: p.siteAddress.province ?? '', municipality: p.municipality, startDate: p.startDate ?? '', endDate: p.endDate ?? '',
});

type ProjectErrors = Partial<Record<'title' | 'street' | 'city' | 'zip' | 'province' | 'municipality' | 'endDate', string>>;

export function projectErrors(d: ProjectDraft): ProjectErrors {
  return {
    ...(d.title.trim().length < 3 ? { title: 'Titolo troppo corto.' } : {}),
    ...(!d.street.trim() ? { street: 'Indica la via.' } : {}),
    ...(!d.city.trim() ? { city: 'Indica la città.' } : {}),
    ...(d.zip.trim() && !/^\d{5}$/.test(d.zip.trim()) ? { zip: 'CAP di 5 cifre.' } : {}),
    ...(d.province.trim() && !/^[A-Za-z]{2}$/.test(d.province.trim()) ? { province: 'Sigla di 2 lettere.' } : {}),
    ...(!(d.municipality.trim() || d.city.trim()) ? { municipality: 'Indica il comune.' } : {}),
    ...(d.startDate && d.endDate && d.endDate < d.startDate ? { endDate: 'La fine deve seguire l’inizio.' } : {}),
  };
}

export const isProjectValid = (d: ProjectDraft): boolean => Object.keys(projectErrors(d)).length === 0;

export function draftToFields(d: ProjectDraft): ProjectFields {
  const opt = (s: string) => s.trim() || undefined;
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    interventionType: d.interventionType,
    permitType: d.permitType || null,
    siteAddress: {
      street: d.street.trim(), number: opt(d.number), zip: opt(d.zip), city: d.city.trim(),
      province: opt(d.province)?.toUpperCase(),
    },
    // Il comune di competenza coincide di solito con la città del cantiere.
    municipality: d.municipality.trim() || d.city.trim(),
    startDate: d.startDate || null,
    endDate: d.endDate || null,
  };
}

/** Dati principali della commessa (AFU FR-M1-01): titolo, intervento, titolo edilizio, cantiere, date. */
@Component({
  selector: 'app-project-fields-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field"><label for="pf-title">Titolo</label>
      <input id="pf-title" class="input" placeholder="Es. Ristrutturazione appartamento Via Verdi 12" [class.is-invalid]="touched() && errors().title" [value]="value().title" (input)="patch({ title: val($event) })" />
    </div>
    <div class="grid grid-2">
      <div class="field"><label for="pf-int">Tipologia di intervento</label>
        <select id="pf-int" class="select" [value]="value().interventionType" (change)="patch({ interventionType: $any(val($event)) })">
          @for (i of interventions; track i) { <option [value]="i" [selected]="i === value().interventionType">{{ interventionLabel[i] }}</option> }
        </select>
      </div>
      <div class="field"><label for="pf-permit">Titolo edilizio</label>
        <select id="pf-permit" class="select" [value]="value().permitType" (change)="patch({ permitType: $any(val($event)) })">
          <option value="" [selected]="!value().permitType">—</option>
          @for (p of permits; track p) { <option [value]="p" [selected]="p === value().permitType">{{ permitLabel[p] }}</option> }
        </select>
      </div>
    </div>
    <div class="eyebrow">Cantiere</div>
    <div class="grid addr">
      <div class="field"><label for="pf-street">Via / piazza</label>
        <input id="pf-street" class="input" autocomplete="off" [class.is-invalid]="touched() && errors().street" [value]="value().street" (input)="patch({ street: val($event) })" /></div>
      <div class="field"><label for="pf-num">Civico</label>
        <input id="pf-num" class="input" [value]="value().number" (input)="patch({ number: val($event) })" /></div>
    </div>
    <div class="grid city">
      <div class="field"><label for="pf-zip">CAP</label>
        <input id="pf-zip" class="input mono" inputmode="numeric" maxlength="5" [class.is-invalid]="errors().zip" [value]="value().zip" (input)="patch({ zip: val($event) })" /></div>
      <div class="field"><label for="pf-city">Città</label>
        <input id="pf-city" class="input" [class.is-invalid]="touched() && errors().city" [value]="value().city" (input)="patch({ city: val($event) })" /></div>
      <div class="field"><label for="pf-prov">Prov.</label>
        <input id="pf-prov" class="input mono" maxlength="2" [class.is-invalid]="errors().province" [value]="value().province" (input)="patch({ province: val($event).toUpperCase() })" /></div>
    </div>
    <div class="field"><label for="pf-mun">Comune competente <span class="muted">(se diverso dalla città)</span></label>
      <input id="pf-mun" class="input" [placeholder]="value().city" [value]="value().municipality" (input)="patch({ municipality: val($event) })" /></div>
    @if (extended()) {
      <div class="grid grid-2">
        <div class="field"><label for="pf-start">Inizio lavori</label>
          <input id="pf-start" class="input" type="date" [value]="value().startDate" (input)="patch({ startDate: val($event) })" /></div>
        <div class="field"><label for="pf-end">Fine prevista</label>
          <input id="pf-end" class="input" type="date" [class.is-invalid]="errors().endDate" [value]="value().endDate" (input)="patch({ endDate: val($event) })" />
          @if (errors().endDate) { <span class="hint is-error">{{ errors().endDate }}</span> }</div>
      </div>
      <div class="field"><label for="pf-desc">Descrizione</label>
        <textarea id="pf-desc" class="input" rows="3" maxlength="2000" [value]="value().description" (input)="patch({ description: val($event) })"></textarea></div>
    }
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .addr { grid-template-columns: 1fr 110px; }
    .city { grid-template-columns: 110px 1fr 80px; }
    .hint.is-error { color: var(--danger); }
    textarea.input { height: auto; padding-top: 8px; resize: vertical; }
    @media (max-width: 560px) { .addr, .city { grid-template-columns: 1fr; } }
  `,
})
export class ProjectFieldsForm {
  readonly value = model.required<ProjectDraft>();
  readonly touched = input(false);
  /** Mostra anche date e descrizione (scheda Dati della commessa). */
  readonly extended = input(false);

  protected readonly val = val;
  protected readonly interventions = Object.keys(INTERVENTION_LABEL) as InterventionType[];
  protected readonly permits = Object.keys(PERMIT_LABEL) as PermitType[];
  protected readonly interventionLabel = INTERVENTION_LABEL;
  protected readonly permitLabel = PERMIT_LABEL;

  protected errors(): ProjectErrors {
    return projectErrors(this.value());
  }

  protected patch(p: Partial<ProjectDraft>): void {
    this.value.update((v) => ({ ...v, ...p }));
  }
}
