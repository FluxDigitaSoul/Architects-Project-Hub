import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { ProjectsApi } from '../../core/api/projects-api';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { ContactForm, type ContactDraft, draftToInput, emptyContact, isContactValid } from './contact-form';
import { type ProjectDraft, ProjectFieldsForm, draftToFields, emptyProject, isProjectValid } from './project-fields-form';

/** Creazione della commessa con il primo committente e l'invio del Magic Link (AFU FR-M1-01/03/05). */
@Component({
  selector: 'app-new-project-dialog',
  imports: [Dialog, ContactForm, ProjectFieldsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Nuova commessa" [width]="680" (closed)="closed.emit()">
      <div class="field code"><label for="np-code">Codice</label>
        <input id="np-code" class="input mono" [class.is-invalid]="codeError()" [value]="code()" (input)="onCode(val($event))" />
        <span class="hint" [class.is-error]="codeError()">{{ codeError() ?? 'Proposto secondo lo schema dello studio; puoi modificarlo.' }}</span>
      </div>
      <app-project-fields-form [(value)]="project" [touched]="touched()" />

      <div class="divider"></div>
      <div class="eyebrow">Committente</div>
      <app-contact-form [(value)]="contact" [touched]="touched()" prefix="np-contact" />
      <label class="check"><input type="checkbox" [checked]="sendInvite()" [disabled]="!contact().portalEnabled" (change)="sendInvite.set($any($event.target).checked)" />
        <span>Invia subito al committente l'email con il link al portale</span></label>

      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }

      <div dialog-actions>
        <button class="btn btn-outline" type="button" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="submit()">
          @if (busy()) { Creazione… } @else { Crea commessa }
        </button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .code { max-width: 220px; margin-bottom: 12px; }
    .hint.is-error { color: var(--danger); }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; margin-top: 12px; }
    .check input { margin-top: 3px; }
    .alert { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class NewProjectDialog {
  readonly open = input(false);
  readonly closed = output<void>();
  private readonly api = inject(ProjectsApi);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;

  protected readonly code = signal('');
  protected readonly codeTaken = signal(false);
  protected readonly project = signal<ProjectDraft>(emptyProject());
  protected readonly contact = signal<ContactDraft>(emptyContact());
  protected readonly sendInvite = signal(true);
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly codeError = computed(() => {
    if (this.codeTaken()) return 'Codice già in uso: scegline un altro.';
    return this.touched() && !this.code().trim() ? 'Indica un codice.' : null;
  });
  private readonly valid = computed(
    () => !!this.code().trim() && !this.codeTaken() && isProjectValid(this.project()) && isContactValid(this.contact()),
  );

  constructor() {
    effect(() => {
      if (this.open()) void this.reset();
    });
  }

  protected onCode(value: string): void {
    this.code.set(value);
    this.codeTaken.set(false);
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    this.error.set(null);
    if (!this.valid() || this.busy()) {
      if (!this.valid()) this.error.set('Controlla i campi evidenziati.');
      return;
    }
    this.busy.set(true);
    const contact = draftToInput(this.contact());
    try {
      const created = await this.api.create({
        ...draftToFields(this.project()),
        code: this.code().trim(),
        contacts: [contact],
        sendInvites: this.sendInvite() && contact.portalEnabled !== false,
      });
      this.closed.emit();
      this.toaster.show(
        created.invitesSent ? `Commessa ${created.code} creata e link inviato a ${contact.email}` : `Commessa ${created.code} creata`,
      );
      await this.router.navigate(['/commesse', created.id]);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'CODE_UNAVAILABLE') this.codeTaken.set(true);
      else this.error.set(err.userMessage);
    } finally {
      this.busy.set(false);
    }
  }

  private async reset(): Promise<void> {
    this.project.set(emptyProject());
    this.contact.set(emptyContact());
    this.sendInvite.set(true);
    this.touched.set(false);
    this.error.set(null);
    this.codeTaken.set(false);
    this.code.set('');
    try {
      this.code.set((await this.api.nextCode()).code);
    } catch {
      /* il codice si può inserire a mano */
    }
  }
}
