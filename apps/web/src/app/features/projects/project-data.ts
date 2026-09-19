import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { type Cadastral, type ProjectDetail, ProjectsApi } from '../../core/api/projects-api';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { type ProjectDraft, ProjectFieldsForm, draftToFields, isProjectValid, projectToDraft } from './project-fields-form';

const MAX_CADASTRAL = 20;
const MAX_TAGS = 20;

/** Dati anagrafici e catastali della commessa (AFU FR-M1-01), con controllo di concorrenza sulla versione. */
@Component({
  selector: 'app-project-data',
  imports: [Icon, ProjectFieldsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card body">
      <fieldset [disabled]="!canManage()">
        <div class="field code"><label for="pd-code">Codice</label>
          <input id="pd-code" class="input mono" [value]="code()" (input)="code.set(val($event))" /></div>
        <app-project-fields-form [(value)]="draft" [touched]="touched()" [extended]="true" />

        <div class="eyebrow">Dati catastali</div>
        @for (c of cadastral(); track $index; let i = $index) {
          <div class="grid cad">
            <input class="input mono" placeholder="Foglio" [value]="c.sheet ?? ''" (input)="setCad(i, { sheet: val($event) })" aria-label="Foglio" />
            <input class="input mono" placeholder="Particella" [value]="c.parcel ?? ''" (input)="setCad(i, { parcel: val($event) })" aria-label="Particella" />
            <input class="input mono" placeholder="Sub." [value]="c.sub ?? ''" (input)="setCad(i, { sub: val($event) })" aria-label="Subalterno" />
            <input class="input mono" placeholder="Categoria (es. A/2)" [value]="c.category ?? ''" (input)="setCad(i, { category: val($event) })" aria-label="Categoria catastale" />
            <button class="btn btn-ghost btn-icon" type="button" (click)="removeCad(i)" aria-label="Rimuovi riga"><ui-icon name="x" [size]="15" /></button>
          </div>
        }
        @if (cadastral().length < maxCadastral) {
          <button class="btn btn-ghost btn-sm add" type="button" (click)="addCad()"><ui-icon name="plus" [size]="14" /> Aggiungi identificativo catastale</button>
        }

        <div class="field"><label for="pd-tags">Etichette <span class="muted">(separate da virgola)</span></label>
          <input id="pd-tags" class="input" placeholder="Es. bonus, condominio" [value]="tags()" (input)="tags.set(val($event))" /></div>
      </fieldset>

      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      @if (canManage()) {
        <div class="actions">
          <button class="btn btn-outline" type="button" [disabled]="!dirty() || saving()" (click)="discard()">Annulla modifiche</button>
          <button class="btn btn-primary" type="button" [disabled]="!dirty() || saving()" (click)="save()">{{ saving() ? 'Salvataggio…' : 'Salva' }}</button>
        </div>
      }
    </div>
  `,
  styles: `
    .body { padding: 18px 20px; display: grid; gap: 14px; max-width: 760px; }
    fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 14px; min-width: 0; }
    .code { max-width: 220px; }
    .cad { grid-template-columns: 1fr 1fr 0.7fr 1fr auto; gap: 8px; }
    .add { justify-self: start; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    @media (max-width: 640px) { .cad { grid-template-columns: 1fr 1fr; } }
  `,
})
export class ProjectData {
  readonly project = input.required<ProjectDetail>();
  readonly canManage = input(false);
  readonly changed = output<void>();

  private readonly api = inject(ProjectsApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly maxCadastral = MAX_CADASTRAL;

  protected readonly code = linkedSignal(() => this.project().code);
  protected readonly draft = linkedSignal<ProjectDraft>(() => projectToDraft(this.project()));
  protected readonly cadastral = linkedSignal<Cadastral[]>(() => this.project().cadastral.map((c) => ({ ...c })));
  protected readonly tags = linkedSignal(() => this.project().tags.join(', '));
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly dirty = computed(() => {
    const p = this.project();
    return (
      this.code() !== p.code ||
      JSON.stringify(this.draft()) !== JSON.stringify(projectToDraft(p)) ||
      JSON.stringify(this.cleanCadastral()) !== JSON.stringify(p.cadastral) ||
      JSON.stringify(this.cleanTags()) !== JSON.stringify(p.tags)
    );
  });

  protected setCad(i: number, patch: Partial<Cadastral>): void {
    this.cadastral.update((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  protected addCad(): void {
    this.cadastral.update((rows) => [...rows, {}]);
  }

  protected removeCad(i: number): void {
    this.cadastral.update((rows) => rows.filter((_, j) => j !== i));
  }

  protected discard(): void {
    const p = this.project();
    this.code.set(p.code);
    this.draft.set(projectToDraft(p));
    this.cadastral.set(p.cadastral.map((c) => ({ ...c })));
    this.tags.set(p.tags.join(', '));
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    this.touched.set(true);
    this.error.set(null);
    if (!isProjectValid(this.draft()) || !this.code().trim()) {
      this.error.set('Controlla i campi evidenziati.');
      return;
    }
    this.saving.set(true);
    try {
      await this.api.update(this.project().id, {
        ...draftToFields(this.draft()),
        code: this.code().trim(),
        cadastral: this.cleanCadastral(),
        tags: this.cleanTags(),
        version: this.project().version,
      });
      this.toaster.show('Dati della commessa salvati');
      this.changed.emit();
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'CODE_UNAVAILABLE') this.error.set('Codice già usato da un’altra commessa.');
      else this.error.set(err.userMessage);
    } finally {
      this.saving.set(false);
    }
  }

  private cleanCadastral(): Cadastral[] {
    return this.cadastral()
      .map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) as Cadastral)
      .filter((c) => Object.keys(c).length > 0);
  }

  private cleanTags(): string[] {
    return [...new Set(this.tags().split(',').map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TAGS);
  }
}
