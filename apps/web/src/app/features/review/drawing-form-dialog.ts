import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import {
  CATEGORY_LABEL,
  DRAWING_ACCEPT,
  DRAWING_MAX_BYTES,
  type DrawingCategory,
  type DrawingInput,
  type DrawingListItem,
  StudioReviewApi,
} from '../../core/api/review-api';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const MB = 1024 * 1024;

interface DrawingForm {
  title: string;
  sheetCode: string;
  category: DrawingCategory;
  scale: string;
  phase: string;
  downloadAllowed: boolean;
}

export function formatBytes(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Nuovo elaborato con il primo file, oppure modifica dei suoi dati (AFU FR-M2-01/02). */
@Component({
  selector: 'app-drawing-form-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" [title]="editing() ? 'Dati della tavola' : 'Nuova tavola'" [width]="600" (closed)="closed.emit()">
      <div class="grid g">
        <div class="field"><label for="df-code">Codice tavola</label>
          <input id="df-code" class="input mono" placeholder="Es. A-101" maxlength="30" [value]="form().sheetCode" (input)="patch({ sheetCode: val($event) })" /></div>
        <div class="field"><label for="df-title">Titolo</label>
          <input id="df-title" class="input" placeholder="Es. Pianta piano primo — stato di progetto" maxlength="150" [class.is-invalid]="touched() && !form().title.trim()" [value]="form().title" (input)="patch({ title: val($event) })" /></div>
      </div>
      <div class="grid grid-3">
        <div class="field"><label for="df-cat">Tipo</label>
          <select id="df-cat" class="select" (change)="patch({ category: $any(val($event)) })">
            @for (c of categories; track c) { <option [value]="c" [selected]="c === form().category">{{ categoryLabel[c] }}</option> }
          </select></div>
        <div class="field"><label for="df-scale">Scala</label>
          <input id="df-scale" class="input mono" placeholder="1:50" maxlength="20" [value]="form().scale" (input)="patch({ scale: val($event) })" /></div>
        <div class="field"><label for="df-phase">Fase</label>
          <input id="df-phase" class="input" placeholder="Es. definitivo" maxlength="50" [value]="form().phase" (input)="patch({ phase: val($event) })" /></div>
      </div>
      <label class="check"><input type="checkbox" [checked]="form().downloadAllowed" (change)="patch({ downloadAllowed: $any($event.target).checked })" />
        <span>Il committente può scaricare il file originale</span></label>
      @if (!editing()) {
        <div class="field">
          <label>File (PDF o immagine, fino a 200 MB)</label>
          <label class="drop" [class.is-invalid]="touched() && !file()">
            <input type="file" [accept]="accept" hidden (change)="onFile($event)" />
            @if (file(); as f) { <b>{{ f.name }}</b> <span class="muted small">{{ size(f.size) }} · clicca per sostituire</span> }
            @else { <span>Scegli il file della tavola</span> <span class="muted small">Il PDF può avere più pagine (fino a 50)</span> }
          </label>
          @if (fileError(); as e) { <span class="hint is-error">{{ e }}</span> }
        </div>
      }
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" [disabled]="busy()" (click)="save()">{{ busyLabel() }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .g { grid-template-columns: 160px 1fr; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px; border: 1.5px dashed var(--line-strong); border-radius: 10px; cursor: pointer; text-align: center; }
    .drop:hover { border-color: var(--color-primary); }
    .drop.is-invalid { border-color: var(--danger); }
    .hint.is-error { color: var(--danger); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    @media (max-width: 560px) { .g { grid-template-columns: 1fr; } }
  `,
})
export class DrawingFormDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  /** Se presente si modificano i dati; altrimenti si crea una nuova tavola con il file. */
  readonly editing = input<DrawingListItem | null>(null);
  readonly closed = output<void>();
  /** Id della tavola creata o modificata. */
  readonly saved = output<string>();

  private readonly api = inject(StudioReviewApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly size = formatBytes;
  protected readonly accept = DRAWING_ACCEPT;
  protected readonly categories = Object.keys(CATEGORY_LABEL) as DrawingCategory[];
  protected readonly categoryLabel = CATEGORY_LABEL;

  protected readonly form = signal<DrawingForm>({ title: '', sheetCode: '', category: 'PLAN', scale: '', phase: '', downloadAllowed: false });
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busyLabel = computed(() => {
    if (!this.busy()) return this.editing() ? 'Salva' : 'Carica tavola';
    return this.uploading() ? 'Caricamento e verifica del file…' : 'Salvataggio…';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const d = this.editing();
      this.form.set({
        title: d?.title ?? '', sheetCode: d?.sheetCode ?? '', category: d?.category ?? 'PLAN',
        scale: d?.scale ?? '', phase: d?.phase ?? '', downloadAllowed: d?.downloadAllowed ?? false,
      });
      this.file.set(null);
      this.fileError.set(null);
      this.touched.set(false);
      this.error.set(null);
    });
  }

  protected patch(p: Partial<DrawingForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected onFile(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!DRAWING_ACCEPT.split(',').includes(f.type)) {
      this.fileError.set('Formato non supportato: carica un PDF o un’immagine PNG, JPEG o WebP.');
      return;
    }
    if (f.size > DRAWING_MAX_BYTES) {
      this.fileError.set('Il file supera i 200 MB.');
      return;
    }
    this.fileError.set(null);
    this.file.set(f);
    // Il nome del file è un buon titolo di partenza.
    if (!this.form().title.trim()) this.patch({ title: f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').slice(0, 150) });
  }

  protected async save(): Promise<void> {
    this.touched.set(true);
    this.error.set(null);
    const f = this.form();
    const editing = this.editing();
    const file = this.file();
    if (!f.title.trim() || (!editing && !file)) {
      this.error.set(editing ? 'Indica il titolo.' : 'Indica il titolo e scegli il file.');
      return;
    }
    const input: DrawingInput = {
      title: f.title.trim(), sheetCode: f.sheetCode.trim() || null, category: f.category,
      scale: f.scale.trim() || null, phase: f.phase.trim() || null, downloadAllowed: f.downloadAllowed,
    };
    this.busy.set(true);
    this.uploading.set(false);
    try {
      if (editing) {
        await this.api.updateDrawing(this.projectId(), editing.id, input);
        this.toaster.show('Dati della tavola salvati');
        this.saved.emit(editing.id);
        this.closed.emit();
        return;
      }
      const { id } = await this.api.createDrawing(this.projectId(), input);
      this.uploading.set(true);
      const result = await this.api.uploadVersion(this.projectId(), id, file!, null);
      this.saved.emit(id);
      this.closed.emit();
      if (result.status === 'ERROR') this.toaster.show(`Tavola creata, ma il file non è valido: ${result.error ?? 'riprova con un altro file'}`, 'danger', 7000);
      else this.toaster.show('Tavola caricata in bozza: controllala e pubblicala quando è pronta');
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
