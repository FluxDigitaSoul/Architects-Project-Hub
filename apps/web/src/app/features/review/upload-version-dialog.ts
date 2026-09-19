import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { DRAWING_ACCEPT, DRAWING_MAX_BYTES, StudioReviewApi } from '../../core/api/review-api';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { formatBytes } from './drawing-form-dialog';

/**
 * Nuova versione di una tavola (AFU FR-M2-02): nasce come bozza. Se la versione precedente ha
 * osservazioni aperte si possono riportare sulla nuova (FR-M2-12, pin trasferiti).
 */
@Component({
  selector: 'app-upload-version-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Nuova versione" [width]="540" (closed)="closed.emit()">
      <div class="field">
        <label>File (PDF o immagine, fino a 200 MB)</label>
        <label class="drop">
          <input type="file" [accept]="accept" hidden (change)="onFile($event)" />
          @if (file(); as f) { <b>{{ f.name }}</b> <span class="muted small">{{ size(f.size) }} · clicca per sostituire</span> }
          @else { <span>Scegli il file aggiornato</span> }
        </label>
        @if (fileError(); as e) { <span class="hint is-error">{{ e }}</span> }
      </div>
      <div class="field"><label for="uv-note">Cosa è cambiato <span class="muted">(visibile al committente)</span></label>
        <textarea id="uv-note" class="input" rows="3" maxlength="1000" placeholder="Es. Spostata la porta del bagno, aggiornate le quote." [value]="note()" (input)="note.set(val($event))"></textarea></div>
      @if (previousOpenPins()) {
        <label class="check"><input type="checkbox" [checked]="transfer()" (change)="transfer.set($any($event.target).checked)" />
          <span>Riporta sulla nuova versione le {{ previousOpenPins() }} osservazioni ancora aperte</span></label>
      }
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" [disabled]="!file() || busy()" (click)="upload()">{{ busy() ? 'Caricamento e verifica…' : 'Carica' }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; text-align: center; }
    .drop:hover { border-color: var(--color-primary); }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    textarea.input { height: auto; padding-top: 8px; resize: vertical; }
    .hint.is-error { color: var(--danger); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class UploadVersionDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly drawingId = input.required<string>();
  /** Versione da cui riportare le osservazioni aperte (se ce ne sono). */
  readonly previousVersionId = input<string | null>(null);
  readonly previousOpenPins = input(0);
  readonly closed = output<void>();
  /** Id della nuova versione (bozza). */
  readonly uploaded = output<string>();

  private readonly api = inject(StudioReviewApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly size = formatBytes;
  protected readonly accept = DRAWING_ACCEPT;
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly transfer = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.file.set(null);
      this.fileError.set(null);
      this.note.set('');
      this.transfer.set(true);
      this.error.set(null);
    });
  }

  protected onFile(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!DRAWING_ACCEPT.split(',').includes(f.type)) this.fileError.set('Formato non supportato: carica un PDF o un’immagine PNG, JPEG o WebP.');
    else if (f.size > DRAWING_MAX_BYTES) this.fileError.set('Il file supera i 200 MB.');
    else {
      this.fileError.set(null);
      this.file.set(f);
    }
  }

  protected async upload(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.uploadVersion(this.projectId(), this.drawingId(), file, this.note().trim() || null);
      if (r.status === 'ERROR') {
        this.error.set(`Il file non è valido: ${r.error ?? 'prova con un altro file'}.`);
        return;
      }
      const from = this.previousVersionId();
      let moved = 0;
      if (from && this.previousOpenPins() && this.transfer()) {
        moved = (await this.api.transferPins(this.projectId(), r.versionId, from)).transferred;
      }
      this.toaster.show(`Versione ${r.number} caricata in bozza${moved ? ` con ${moved} osservazioni riportate` : ''}`);
      this.uploaded.emit(r.versionId);
      this.closed.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
