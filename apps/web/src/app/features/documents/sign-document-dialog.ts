import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { DocumentsApi, type StudioDocument } from '../../core/api/documents-api';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';

const MAX_SIGNED_BYTES = 30 * 1024 * 1024;

/**
 * Firma digitale del documento (AFU FR-M5-02, BR-08): il professionista scarica il PDF generato,
 * lo firma in PAdES con il proprio dispositivo e lo ricarica. Il server verifica che il file firmato
 * contenga esattamente il documento generato; da quel momento si inviano e si condividono i PDF firmati.
 */
@Component({
  selector: 'app-sign-document-dialog',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Firma digitale" [width]="560" (closed)="closed.emit()">
      @if (doc(); as d) {
        <ol class="steps">
          <li>
            <b>Scarica il PDF da firmare</b>
            <span class="muted small">{{ d.fileName }} · n. {{ d.number }} rev. {{ d.revision }}</span>
            <button class="btn btn-outline btn-sm" (click)="download(d)"><ui-icon name="download" [size]="14" /> Scarica</button>
          </li>
          <li>
            <b>Firmalo in formato PAdES</b>
            <span class="muted small">Con il tuo software di firma (es. firma remota, smart card o token USB). Non modificare il contenuto: aggiungi solo la firma.</span>
          </li>
          <li>
            <b>Carica il PDF firmato</b>
            <label class="drop" [class.is-busy]="busy()">
              <input type="file" accept="application/pdf" hidden [disabled]="busy()" (change)="upload(d, $event)" />
              @if (busy()) { <span>Verifica della firma…</span> } @else { <span><ui-icon name="upload" [size]="15" /> Scegli il file firmato (.pdf)</span> }
            </label>
          </li>
        </ol>
        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
        <p class="muted small">Il PDF firmato sostituisce l'originale per invii e portale; l'originale resta in archivio con la sua impronta.</p>
      }
    </ui-dialog>
  `,
  styles: `
    .steps { margin: 0; padding-left: 20px; display: grid; gap: 14px; }
    .steps li { display: grid; gap: 6px; justify-items: start; }
    .drop { display: flex; justify-content: center; width: 100%; padding: 16px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; }
    .drop:hover { border-color: var(--color-primary); }
    .drop.is-busy { cursor: progress; opacity: 0.7; }
    .drop span { display: inline-flex; gap: 6px; align-items: center; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class SignDocumentDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly doc = input<StudioDocument | null>(null);
  readonly closed = output<void>();
  readonly signed = output<void>();

  private readonly api = inject(DocumentsApi);
  private readonly toaster = inject(Toaster);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) this.error.set(null);
    });
  }

  protected async download(d: StudioDocument): Promise<void> {
    try {
      await this.api.downloadForSigning(this.projectId(), d);
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    }
  }

  protected async upload(d: StudioDocument, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > MAX_SIGNED_BYTES) {
      this.error.set('Carica il PDF firmato (massimo 30 MB).');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.uploadSigned(this.projectId(), d.id, file);
      this.toaster.show('Documento firmato digitalmente');
      this.signed.emit();
      this.closed.emit();
    } catch (err) {
      const apiErr = toApiError(err);
      this.error.set(apiErr.code === 'SIGNATURE_MISMATCH'
        ? 'Il file non contiene una firma PAdES valida del documento generato. Firma proprio il PDF scaricato, senza modificarlo, e riprova.'
        : apiErr.userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
