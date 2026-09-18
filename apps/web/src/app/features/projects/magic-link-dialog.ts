import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ProjectsStore } from '../../core/data/projects-store';
import type { ClientContact } from '../../core/models';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';

/** Accessi dei committenti al portale (AFU FR-M1-05/06). */
@Component({
  selector: 'app-magic-link-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Accesso dei committenti" [width]="640" (closed)="closed.emit()">
      <p class="muted">Ogni committente ha un link personale al portale, senza password. Chi è <b>firmatario</b> può approvare le tavole.</p>
      @for (c of contacts(); track c.id) {
        <div class="contact">
          <div class="row-between">
            <div><b>{{ c.name }}</b> @if (c.isSigner) { <span class="badge badge-primary badge-plain" style="margin-left:6px">Firmatario</span> }
              <div class="muted small">{{ c.email }}</div></div>
          </div>
          <div class="link">
            <input class="input mono small" readonly [value]="linkOf(c)" (focus)="$any($event.target).select()" />
            <button class="btn btn-outline btn-sm" (click)="copy(c)">Copia</button>
            <a class="btn btn-outline btn-sm" [href]="linkOf(c)" target="_blank" rel="noopener noreferrer">Apri</a>
            <button class="btn btn-ghost btn-sm" (click)="regenerate(c)" title="Revoca il link attuale e ne crea uno nuovo">Rigenera</button>
          </div>
        </div>
      }
      <p class="muted small">Se inoltri il link con altri canali (es. WhatsApp), chiunque lo riceve potrà accedere: rigeneralo se viene condiviso per errore.</p>
    </ui-dialog>
  `,
  styles: `
    .contact { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 10px; }
    .link { display: flex; gap: 6px; align-items: center; }
    .link .input { flex: 1; min-width: 0; height: 30px; }
  `,
})
export class MagicLinkDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly closed = output<void>();
  private readonly store = inject(ProjectsStore);
  private readonly toaster = inject(Toaster);
  protected readonly contacts = computed(() => this.store.contactsOf(this.projectId())());

  protected linkOf(c: ClientContact): string {
    return `${location.origin}/p/${c.token}`;
  }

  protected async copy(c: ClientContact): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linkOf(c));
      this.toaster.show('Link copiato');
    } catch {
      this.toaster.show('Copia non riuscita: seleziona il link e copialo a mano', 'danger');
    }
  }

  protected regenerate(c: ClientContact): void {
    this.store.regenerateToken(c.id);
    this.toaster.show(`Link di ${c.name} rigenerato: il precedente non funziona più`, 'info');
  }
}
