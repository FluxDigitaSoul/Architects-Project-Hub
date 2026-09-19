import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  DocumentsApi,
  SIGNABLE_TYPES,
  type StudioDocument,
} from '../../core/api/documents-api';
import { fmtDateTime } from '../../core/data/format';
import { Confirmer } from '../../shared/ui/confirm';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { formatBytes } from '../review/drawing-form-dialog';
import { SendDocumentDialog } from './send-document-dialog';
import { SignDocumentDialog } from './sign-document-dialog';

/** Riga del documento; nell'archivio dello studio porta anche la commessa. */
export type DocumentRow = StudioDocument & { projectId?: string; projectCode?: string; projectTitle?: string };

/**
 * Elenco dei documenti con le azioni del ciclo di vita (AFU Modulo 5): apri, firma digitale,
 * invia (email o PEC), condividi nel portale, annulla con motivazione (BR-09).
 */
@Component({
  selector: 'app-document-table',
  imports: [RouterLink, EmptyState, Icon, SendDocumentDialog, SignDocumentDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <ul class="docs">
        @for (d of rows(); track d.id) {
          <li [class.cancelled]="d.status === 'CANCELLED'">
            <span class="ic" [class.ok]="d.signed"><ui-icon [name]="d.signed ? 'shield' : 'file'" [size]="16" /></span>
            <div class="main">
              <div class="row wrap"><b>{{ d.title }}</b>
                <span class="badge" [class.badge-success]="d.status === 'SIGNED'" [class.badge-info]="d.status === 'FINAL'" [class.badge-danger]="d.status === 'CANCELLED'" [class.badge-plain]="d.status === 'DRAFT'">{{ statusLabel[d.status] }}</span>
                @if (d.sharedWithClient) { <span class="badge badge-plain">Nel portale</span> }
              </div>
              <div class="muted small">
                {{ typeLabel[d.type] }} · n. {{ d.number }}@if (d.revision) { rev. {{ d.revision }} } · {{ dt(d.createdAt) }}@if (d.sizeBytes) { · {{ size(d.sizeBytes) }} }
                @if (showProject() && d.projectCode) { · <a [routerLink]="['/commesse', d.projectId]" [queryParams]="{ scheda: 'documenti' }">{{ d.projectCode }}</a> }
              </div>
              @if (d.verificationCode) { <div class="muted small">Codice di verifica <span class="mono">{{ d.verificationCode }}</span></div> }
              @if (needsSignature(d)) { <div class="warn small"><ui-icon name="pen" [size]="13" /> Da firmare digitalmente prima dell'invio</div> }
              @if (d.status === 'CANCELLED') { <div class="small danger">Annullato: {{ d.cancelReason }}</div> }
            </div>
            <div class="acts">
              <button class="btn btn-ghost btn-sm" (click)="open(d)" title="Apri il PDF"><ui-icon name="eye" [size]="14" /> Apri</button>
              @if (canManage() && d.status !== 'CANCELLED') {
                @if (needsSignature(d)) { <button class="btn btn-primary btn-sm" (click)="startSign(d)"><ui-icon name="pen" [size]="14" /> Firma</button> }
                @if (d.status === 'FINAL' || d.status === 'SIGNED') {
                  <button class="btn btn-outline btn-sm" (click)="startSend(d)"><ui-icon name="send" [size]="14" /> Invia</button>
                  <button class="btn btn-ghost btn-sm" (click)="toggleShare(d)" [title]="d.sharedWithClient ? 'Togli dal portale del committente' : 'Mostra nel portale del committente'">
                    <ui-icon name="link" [size]="14" /> {{ d.sharedWithClient ? 'Non condividere' : 'Condividi' }}</button>
                }
                <button class="btn btn-ghost btn-icon" (click)="cancel(d)" title="Annulla il documento" aria-label="Annulla il documento"><ui-icon name="x" [size]="14" /></button>
              }
            </div>
          </li>
        }
      </ul>
    } @else {
      <ui-empty icon="file" [title]="emptyTitle()" [text]="emptyText()" />
    }

    <app-send-document-dialog [open]="sending() !== null" [projectId]="projectOf(sending())" [doc]="sending()" (closed)="sending.set(null)" (sent)="changed.emit()" />
    <app-sign-document-dialog [open]="signing() !== null" [projectId]="projectOf(signing())" [doc]="signing()" (closed)="signing.set(null)" (signed)="changed.emit()" />
  `,
  styles: `
    .docs { list-style: none; margin: 0; padding: 0; }
    .docs li { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); align-items: flex-start; }
    .docs li:last-child { border-bottom: 0; }
    .docs li.cancelled .main b { text-decoration: line-through; color: var(--muted); }
    .ic { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); flex: none; }
    .ic.ok { background: var(--success-soft); color: var(--success); }
    .main { flex: 1; min-width: 0; display: grid; gap: 3px; }
    .wrap { gap: 8px; flex-wrap: wrap; }
    .main a { color: var(--color-primary); }
    .warn { color: var(--warning); display: flex; gap: 5px; align-items: center; }
    .danger { color: var(--danger); }
    .acts { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    @media (max-width: 760px) { .docs li { flex-wrap: wrap; } .acts { width: 100%; justify-content: flex-start; } }
  `,
})
export class DocumentTable {
  readonly rows = input.required<DocumentRow[]>();
  /** Commessa dei documenti (se tutti della stessa); altrimenti si usa quella della riga. */
  readonly projectId = input<string | null>(null);
  readonly showProject = input(false);
  readonly canManage = input(false);
  readonly emptyTitle = input('Nessun documento');
  readonly emptyText = input('I verbali e le relazioni generati compaiono qui, pronti da firmare e inviare.');
  readonly changed = output<void>();

  private readonly api = inject(DocumentsApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly typeLabel = DOCUMENT_TYPE_LABEL;
  protected readonly statusLabel = DOCUMENT_STATUS_LABEL;
  protected readonly dt = fmtDateTime;
  protected readonly size = formatBytes;
  protected readonly sending = signal<DocumentRow | null>(null);
  protected readonly signing = signal<DocumentRow | null>(null);

  protected projectOf(d: DocumentRow | null): string {
    return d?.projectId ?? this.projectId() ?? '';
  }

  protected needsSignature(d: DocumentRow): boolean {
    return d.status === 'FINAL' && !d.signed && SIGNABLE_TYPES.includes(d.type);
  }

  protected async open(d: DocumentRow): Promise<void> {
    try {
      await this.api.open(this.projectOf(d), d);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  protected startSign(d: DocumentRow): void {
    this.signing.set(d);
  }

  protected async startSend(d: DocumentRow): Promise<void> {
    if (this.needsSignature(d)) {
      const ok = await this.confirmer.ask({
        title: 'Inviare senza firma digitale?',
        text: 'Questo documento di norma si firma digitalmente prima dell’invio. Puoi firmarlo ora oppure inviarlo comunque.',
        confirmLabel: 'Invia senza firma',
      });
      if (!ok) return;
    }
    this.sending.set(d);
  }

  protected async toggleShare(d: DocumentRow): Promise<void> {
    try {
      await this.api.share(this.projectOf(d), d.id, !d.sharedWithClient);
      this.toaster.show(d.sharedWithClient ? 'Documento tolto dal portale' : 'Documento visibile nel portale del committente');
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  protected async cancel(d: DocumentRow): Promise<void> {
    const result = await this.confirmer.ask({
      title: `Annullare "${d.title}"?`,
      text: 'Il documento resta in archivio con la filigrana "ANNULLATO" e il motivo. Per correggerlo genera una nuova revisione.',
      confirmLabel: 'Annulla documento', tone: 'danger',
      input: { label: 'Motivo dell’annullamento', minLength: 10, placeholder: 'Es. Errore nella superficie del soggiorno, sostituito dalla Rev. 1.' },
    });
    if (!result) return;
    try {
      await this.api.cancel(this.projectOf(d), d.id, result.value);
      this.toaster.show('Documento annullato');
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }
}
