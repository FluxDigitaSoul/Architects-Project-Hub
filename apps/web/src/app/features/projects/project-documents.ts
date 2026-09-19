import { ChangeDetectionStrategy, Component, computed, inject, input, output, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { DocumentsApi } from '../../core/api/documents-api';
import { Icon } from '../../shared/ui/icon';
import { DocumentTable } from '../documents/document-table';

/** Documenti della commessa (AFU Modulo 5): generati da R.A.I., sopralluoghi e approvazioni. */
@Component({
  selector: 'app-project-documents',
  imports: [RouterLink, Icon, DocumentTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gen">
      <a class="card g" [routerLink]="['/commesse', projectId(), 'rai']">
        <ui-icon name="ruler" [size]="18" /><span><b>Relazione R.A.I.</b><span class="muted small">Emetti una revisione del calcolo e genera la relazione asseverata</span></span></a>
      <a class="card g" [routerLink]="['/commesse', projectId()]" [queryParams]="{ scheda: 'sopralluoghi' }">
        <ui-icon name="hardhat" [size]="18" /><span><b>Verbale di sopralluogo</b><span class="muted small">Si genera dal sopralluogo finalizzato</span></span></a>
      <div class="card g"><ui-icon name="check" [size]="18" /><span><b>Riepiloghi di approvazione</b><span class="muted small">Si creano da soli quando il committente approva una tavola</span></span></div>
    </div>
    <div class="card">
      @if (list.error()) {
        <div class="error-box">{{ errorText() }} <button class="btn btn-outline btn-sm" (click)="list.reload()">Riprova</button></div>
      } @else if (list.value(); as rows) {
        <app-document-table [rows]="rows" [projectId]="projectId()" [canManage]="canManage()" (changed)="reload()" />
      } @else { <div class="skeleton"></div> }
    </div>
  `,
  styles: `
    .gen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
    .g { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; color: inherit; }
    a.g:hover { box-shadow: var(--shadow-md); }
    .g > span { display: grid; gap: 2px; }
    .g ui-icon { color: var(--color-primary); margin-top: 2px; }
    .skeleton { height: 140px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    @media (max-width: 860px) { .gen { grid-template-columns: 1fr; } }
  `,
})
export class ProjectDocuments {
  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  readonly changed = output<void>();

  private readonly api = inject(DocumentsApi);
  protected readonly list = resource({ params: () => this.projectId(), loader: ({ params }) => this.api.list(params) });
  protected readonly errorText = computed(() => toApiError(this.list.error()).userMessage);

  protected reload(): void {
    this.list.reload();
    this.changed.emit();
  }
}
