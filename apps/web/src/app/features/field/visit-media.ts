import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { type AudioNote, FieldApi, type ReportSection, SECTION_LABEL, type VisitPhoto } from '../../core/api/field-api';
import { fmtDateTime } from '../../core/data/format';
import { MediaQueue, PhotoNotSupportedError, type QueuedMedia, compressPhoto } from '../../core/field/media-queue';
import { Confirmer } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { type Recording, VoiceRecorder } from './voice-recorder';

/** Anche HEIC/HEIF: la foto si converte in JPEG sul dispositivo prima dell'invio (FR-M4-05). */
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * Foto e note vocali del sopralluogo (AFU FR-M4-05/07/08). I file partono subito se c'è rete,
 * altrimenti restano sul telefono e si inviano da soli appena torna la connessione.
 */
@Component({
  selector: 'app-visit-media',
  imports: [Icon, VoiceRecorder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header"><h3>Foto <span class="muted">{{ photos().length }}</span></h3>
        @if (!readOnly()) {
          <label class="btn btn-primary btn-sm"><ui-icon name="camera" [size]="14" /> Scatta o scegli
            <input type="file" [accept]="accept" capture="environment" multiple hidden (change)="addPhotos($event)" /></label>
        }
      </div>
      @if (pending().length) {
        <div class="pending small">
          <ui-icon name="refresh" [size]="14" /> {{ pendingPhotos().length }} foto e {{ pendingAudio().length }} note in invio.
          @if (!online()) { Nessuna connessione: restano salvate sul dispositivo. }
        </div>
      }
      <div class="grid-ph">
        @for (q of pendingPhotos(); track q.id) {
          <figure class="ph local" [class.err]="q.error">
            <img [src]="preview(q)" alt="" />
            <figcaption class="small">@if (q.error) { <span class="danger">{{ q.error }}</span>
              <span class="row"><button class="btn btn-ghost btn-sm" (click)="queue.retry(q.id)">Riprova</button><button class="btn btn-ghost btn-sm" (click)="queue.discard(q.id)">Scarta</button></span>
            } @else { In invio… }</figcaption>
          </figure>
        }
        @for (p of photos(); track p.id) {
          <figure class="ph" [class.excluded]="!p.includeInReport">
            @if (p.url) { <a [href]="p.url" target="_blank" rel="noopener"><img [src]="p.url" alt="" loading="lazy" /></a> }
            @else { <div class="noimg small muted">{{ p.uploadStatus === 'FAILED' ? 'File non valido' : 'In arrivo…' }}</div> }
            <figcaption>
              <input class="input input-sm" placeholder="Didascalia" maxlength="500" [value]="p.caption ?? ''" [disabled]="readOnly()" (change)="patchPhoto(p, { caption: val($event).trim() || null })" aria-label="Didascalia" />
              <div class="row ctl">
                <select class="select select-sm" [disabled]="readOnly()" (change)="patchPhoto(p, { section: $any(val($event)) || null })" aria-label="Sezione">
                  <option value="" [selected]="!p.section">Sezione…</option>
                  @for (s of sections; track s[0]) { <option [value]="s[0]" [selected]="s[0] === p.section">{{ s[1] }}</option> }
                </select>
                <label class="small check" title="Includi nel verbale"><input type="checkbox" [checked]="p.includeInReport" [disabled]="readOnly()" (change)="patchPhoto(p, { includeInReport: $any($event.target).checked })" /> Verbale</label>
                @if (!readOnly()) { <button class="btn btn-ghost btn-icon" (click)="remove('photos', p.id)" aria-label="Elimina foto"><ui-icon name="trash" [size]="13" /></button> }
              </div>
            </figcaption>
          </figure>
        } @empty {
          @if (!pendingPhotos().length) { <p class="muted small pad">Nessuna foto. Dal telefono si apre direttamente la fotocamera.</p> }
        }
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>Note vocali</h3></div>
      <div class="card-body stack">
        @if (!readOnly()) { <app-voice-recorder (recorded)="addAudio($event)" /> }
        @for (q of pendingAudio(); track q.id) {
          <div class="note small"><ui-icon name="mic" [size]="14" /> Nota di {{ q.durationSec }} s · @if (q.error) { <span class="danger">{{ q.error }}</span> } @else { in invio… }</div>
        }
        @for (a of audio(); track a.id) {
          <div class="note">
            <span class="small muted">{{ dt(a.recordedAt) }}@if (a.durationSec) { · {{ a.durationSec }} s }</span>
            @if (a.url) { <audio controls preload="none" [src]="a.url"></audio> } @else { <span class="small muted">In arrivo…</span> }
            @if (!readOnly()) { <button class="btn btn-ghost btn-icon" (click)="remove('audio', a.id)" aria-label="Elimina nota"><ui-icon name="trash" [size]="13" /></button> }
          </div>
        } @empty {
          @if (!pendingAudio().length) { <p class="muted small">Registra le osservazioni a voce: poi riportale nelle voci del verbale.</p> }
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .card-header h3 span { font-weight: 400; font-size: 13px; }
    .pending { display: flex; gap: 6px; align-items: center; padding: 8px 16px; background: var(--info-soft); }
    .grid-ph { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; padding: 12px 16px; }
    .ph { margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: grid; background: var(--surface); }
    .ph img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--surface-2); }
    .ph.local img { opacity: 0.6; }
    .ph.err { border-color: var(--danger); }
    .ph.excluded img { filter: grayscale(0.8); opacity: 0.7; }
    .noimg { aspect-ratio: 4 / 3; display: grid; place-items: center; background: var(--surface-2); }
    figcaption { padding: 8px; display: grid; gap: 6px; }
    .ctl { gap: 4px; align-items: center; }
    .ctl .select { flex: 1; min-width: 0; }
    .check { display: flex; gap: 4px; align-items: center; white-space: nowrap; }
    .pad { grid-column: 1 / -1; margin: 0; }
    .note { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .note audio { height: 34px; flex: 1; min-width: 200px; }
    .danger { color: var(--danger); }
  `,
})
export class VisitMedia {
  readonly projectId = input.required<string>();
  readonly visitId = input.required<string>();
  readonly photos = input.required<VisitPhoto[]>();
  readonly audio = input.required<AudioNote[]>();
  readonly readOnly = input(false);
  readonly changed = output<void>();

  protected readonly queue = inject(MediaQueue);
  private readonly api = inject(FieldApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly dt = fmtDateTime;
  protected readonly accept = PHOTO_ACCEPT;
  protected readonly sections = Object.entries(SECTION_LABEL) as [ReportSection, string][];
  private readonly previews = new Map<string, string>();
  protected readonly online = signal(navigator.onLine);

  protected readonly pending = computed(() => this.queue.all().filter((q) => q.visitId === this.visitId()));
  protected readonly pendingPhotos = computed(() => this.pending().filter((q) => q.kind === 'photos'));
  protected readonly pendingAudio = computed(() => this.pending().filter((q) => q.kind === 'audio'));

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      this.previews.forEach((url) => URL.revokeObjectURL(url));
    });
  }

  protected preview(q: QueuedMedia): string {
    let url = this.previews.get(q.id);
    if (!url) {
      url = URL.createObjectURL(q.blob);
      this.previews.set(q.id, url);
    }
    return url;
  }

  protected async addPhotos(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (!file.type.startsWith('image/') && !/\.hei[cf]$/i.test(file.name)) {
        this.toaster.show(`${file.name}: non è un'immagine`, 'danger');
        continue;
      }
      let blob: Blob;
      try {
        blob = await compressPhoto(file);
      } catch (e) {
        this.toaster.show(e instanceof PhotoNotSupportedError ? e.message : `${file.name}: foto non leggibile`, 'danger', 8000);
        continue;
      }
      await this.queue.enqueue({
        id: crypto.randomUUID(), projectId: this.projectId(), visitId: this.visitId(), kind: 'photos',
        blob, takenAt: new Date(file.lastModified || Date.now()).toISOString(),
      });
    }
  }

  protected async addAudio(rec: Recording): Promise<void> {
    await this.queue.enqueue({
      id: crypto.randomUUID(), projectId: this.projectId(), visitId: this.visitId(), kind: 'audio',
      blob: rec.blob, takenAt: new Date().toISOString(), durationSec: Math.max(1, Math.round(rec.durationSec)),
    });
  }

  protected async patchPhoto(p: VisitPhoto, patch: { caption?: string | null; section?: ReportSection | null; includeInReport?: boolean }): Promise<void> {
    try {
      await this.api.updatePhoto(this.projectId(), this.visitId(), p.id, patch);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.changed.emit();
  }

  protected async remove(kind: 'photos' | 'audio', id: string): Promise<void> {
    const ok = await this.confirmer.ask({
      title: kind === 'photos' ? 'Eliminare la foto?' : 'Eliminare la nota vocale?', text: 'L’operazione non si può annullare.', confirmLabel: 'Elimina', tone: 'danger',
    });
    if (!ok) return;
    try {
      await this.api.removeMedia(this.projectId(), this.visitId(), kind, id);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.changed.emit();
  }
}
