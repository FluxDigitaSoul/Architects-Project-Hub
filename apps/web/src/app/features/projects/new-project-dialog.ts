import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectsStore } from '../../core/data/projects-store';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const INTERVENTIONS = [
  'Ristrutturazione edilizia',
  'Manutenzione straordinaria',
  'Nuova costruzione',
  'Restauro e risanamento conservativo',
  'Cambio di destinazione d’uso',
  'Frazionamento / accorpamento',
  'Recupero sottotetto',
  'Interior design',
  'Altro',
];

/** Creazione della commessa con il primo committente (AFU FR-M1-01, FR-M1-05). */
@Component({
  selector: 'app-new-project-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Nuova commessa" [width]="620" (closed)="closed.emit()">
      <div class="grid g">
        <div class="field"><label>Codice</label>
          <input class="input mono" [class.is-invalid]="codeTaken()" [value]="code()" (input)="code.set(val($event))" />
          @if (codeTaken()) { <span class="hint" style="color:var(--danger)">Codice già in uso</span> }
        </div>
        <div class="field span2"><label>Titolo</label><input class="input" placeholder="Es. Ristrutturazione appartamento Via Verdi 12" [value]="title()" (input)="title.set(val($event))" /></div>
      </div>
      <div class="grid g">
        <div class="field span2"><label>Indirizzo del cantiere</label><input class="input" [value]="address()" (input)="address.set(val($event))" /></div>
        <div class="field"><label>Comune</label><input class="input" [value]="municipality()" (input)="municipality.set(val($event))" /></div>
      </div>
      <div class="field"><label>Tipologia di intervento</label>
        <select class="select" (change)="intervention.set(val($event))">
          @for (i of interventions; track i) { <option [selected]="i === intervention()">{{ i }}</option> }
        </select>
      </div>
      <div class="divider"></div>
      <div class="eyebrow">Committente</div>
      <div class="grid grid-2">
        <div class="field"><label>Nome e cognome / ragione sociale</label><input class="input" [value]="clientName()" (input)="clientName.set(val($event))" /></div>
        <div class="field"><label>Email</label><input class="input" type="email" [class.is-invalid]="clientEmail() && !emailValid()" [value]="clientEmail()" (input)="clientEmail.set(val($event))" /></div>
      </div>
      <p class="muted small">Il committente riceverà un link personale al portale, senza password. Potrai revocarlo in qualsiasi momento.</p>
      <div dialog-actions>
        <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="submit()">Crea commessa</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .g { grid-template-columns: 1fr 2fr; }
    .span2 { grid-column: span 1; }
    @media (max-width: 640px) { .g { grid-template-columns: 1fr; } }
  `,
})
export class NewProjectDialog {
  readonly open = input(false);
  readonly closed = output<void>();
  private readonly store = inject(ProjectsStore);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly interventions = INTERVENTIONS;

  protected readonly code = signal('');
  protected readonly title = signal('');
  protected readonly address = signal('');
  protected readonly municipality = signal('');
  protected readonly intervention = signal(INTERVENTIONS[0] as string);
  protected readonly clientName = signal('');
  protected readonly clientEmail = signal('');

  protected readonly codeTaken = computed(() => this.store.isCodeTaken(this.code()));
  protected readonly emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.clientEmail().trim()));
  protected readonly valid = computed(
    () =>
      this.code().trim().length > 0 &&
      !this.codeTaken() &&
      this.title().trim().length > 2 &&
      this.address().trim().length > 2 &&
      this.municipality().trim().length > 1 &&
      this.clientName().trim().length > 1 &&
      this.emailValid(),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.code.set(this.store.nextCode());
      for (const s of [this.title, this.address, this.municipality, this.clientName, this.clientEmail]) s.set('');
    });
  }

  protected submit(): void {
    if (!this.valid()) return;
    const project = this.store.create({
      code: this.code(),
      title: this.title(),
      address: this.address(),
      municipality: this.municipality(),
      interventionType: this.intervention(),
      clientName: this.clientName(),
      clientEmail: this.clientEmail(),
    });
    this.closed.emit();
    this.toaster.show(`Commessa ${project.code} creata`);
    void this.router.navigate(['/commesse', project.id]);
  }
}
