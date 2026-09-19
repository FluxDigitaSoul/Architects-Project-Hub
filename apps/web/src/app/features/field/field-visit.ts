import { ChangeDetectionStrategy, Component, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { DocumentsApi } from '../../core/api/documents-api';
import { FieldApi, VISIT_STATUS_LABEL, VISIT_TYPE_LABEL, type VisitPatch, type VisitType } from '../../core/api/field-api';
import { ProjectsApi } from '../../core/api/projects-api';
import { fmtDateTime } from '../../core/data/format';
import { FieldOps } from '../../core/field/field-ops';
import { MediaQueue } from '../../core/field/media-queue';
import { Confirmer } from '../../shared/ui/confirm';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { VisitAttendees } from './visit-attendees';
import { VisitItems } from './visit-items';
import { VisitMedia } from './visit-media';

const WEATHER = ['Sereno', 'Poco nuvoloso', 'Nuvoloso', 'Pioggia', 'Neve', 'Vento forte', 'Nebbia'];

/** ISO → valore per <input type="datetime-local"> nell'ora locale. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Sopralluogo e verbale (AFU Modulo 4): dati, presenti, voci per sezione, foto e note vocali,
 * difformità dei verbali precedenti da verificare, finalizzazione del DL e verbale PDF.
 */
@Component({
  selector: 'app-field-visit',
  imports: [RouterLink, EmptyState, Icon, VisitAttendees, VisitItems, VisitMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a [routerLink]="['/commesse', id()]" [queryParams]="{ scheda: 'sopralluoghi' }" class="back muted small">
      <ui-icon name="chevron-left" [size]="14" /> {{ project.value()?.code }} · {{ project.value()?.title }}</a>

    @if (view(); as v) {
      <div class="head">
        <div>
          <div class="row" style="gap:8px"><span class="eyebrow">{{ typeLabel[v.visitType] }}</span>
            <span class="badge" [class.badge-plain]="v.status === 'DRAFT'" [class.badge-warning]="v.status === 'REVIEW'" [class.badge-success]="v.status === 'FINAL' || v.status === 'SENT'" [class.badge-danger]="v.status === 'CANCELLED'">{{ statusLabel[v.status] }}</span></div>
          <h1>@if (v.number) { Sopralluogo n. {{ v.number }} } @else { Nuovo sopralluogo <span class="muted small">(numero in arrivo)</span> }</h1>
          <p class="muted small">Iniziato il {{ dt(v.startedAt) }}@if (v.finalizedAt) { · finalizzato il {{ dt(v.finalizedAt) }} }</p>
        </div>
        <div class="row actions">
          @if (editable()) {
            <button class="btn btn-ghost btn-sm" (click)="cancelVisit()">Annulla sopralluogo</button>
            <button class="btn btn-primary" [disabled]="busy()" (click)="finalize()"><ui-icon name="lock" [size]="15" /> Finalizza e firma</button>
          }
          @if (v.status === 'FINAL' || v.status === 'SENT') {
            <button class="btn btn-primary" [disabled]="busy()" (click)="generateReport()"><ui-icon name="file" [size]="15" /> Verbale PDF</button>
          }
        </div>
      </div>
      @if (v.status === 'CANCELLED') { <div class="notice small"><ui-icon name="info" [size]="15" /> Sopralluogo annullato: {{ v.cancelReason }}</div> }
      @if (finalizeError(); as e) { <div class="alert small" role="alert">{{ e }}</div> }
      @if (offlineSince() || pendingOps()) {
        <div class="notice sync small" role="status">
          <ui-icon name="refresh" [size]="15" />
          <span>
            @if (offlineSince(); as at) { Senza rete: stai vedendo i dati salvati sul telefono ({{ dt(at) }}). }
            @if (pendingOps()) { {{ pendingOps() === 1 ? '1 modifica' : pendingOps() + ' modifiche' }} in attesa di invio: partiranno da sole appena torna la connessione. }
          </span>
        </div>
      }
      @for (op of failedOps(); track op.id) {
        <div class="alert small row-between" role="alert">
          <span>Una modifica non è stata accettata dal server: {{ op.error }}</span>
          <span class="row"><button class="btn btn-ghost btn-sm" (click)="ops.retry(op.id)">Riprova</button><button class="btn btn-ghost btn-sm" (click)="ops.discard(op.id)">Scarta</button></span>
        </div>
      }

      <div class="layout">
        <div class="col">
          <section class="card">
            <div class="card-header"><h3>Dati del sopralluogo</h3></div>
            <fieldset class="card-body stack" [disabled]="!editable()">
              <div class="grid grid-2">
                <div class="field"><label for="fv-type">Tipo</label>
                  <select id="fv-type" class="select" (change)="patch({ visitType: $any(val($event)) })">
                    @for (t of types; track t[0]) { <option [value]="t[0]" [selected]="t[0] === v.visitType">{{ t[1] }}</option> }
                  </select></div>
                <div class="field"><label for="fv-phase">Fase dei lavori</label>
                  <input id="fv-phase" class="input" maxlength="100" placeholder="Es. demolizioni, impianti" [value]="v.phase ?? ''" (change)="patch({ phase: val($event).trim() || null })" /></div>
              </div>
              <div class="grid grid-2">
                <div class="field"><label for="fv-start">Inizio</label>
                  <input id="fv-start" class="input" type="datetime-local" [value]="local(v.startedAt)" (change)="patchDate('startedAt', val($event))" /></div>
                <div class="field"><label for="fv-end">Fine</label>
                  <input id="fv-end" class="input" type="datetime-local" [value]="local(v.endedAt)" (change)="patchDate('endedAt', val($event))" /></div>
              </div>
              <div class="grid grid-2">
                <div class="field"><label for="fv-w">Meteo</label>
                  <select id="fv-w" class="select" (change)="setWeather(val($event), v.weather?.temperatureC)">
                    <option value="" [selected]="!v.weather">—</option>
                    @for (w of weather; track w) { <option [value]="w" [selected]="w === v.weather?.condition">{{ w }}</option> }
                  </select></div>
                <div class="field"><label for="fv-t">Temperatura (°C)</label>
                  <input id="fv-t" class="input mono" type="number" min="-40" max="60" [value]="v.weather?.temperatureC ?? ''" [disabled]="!v.weather"
                    (change)="setWeather(v.weather?.condition ?? '', val($event) === '' ? undefined : +val($event))" /></div>
              </div>
              <div class="field"><label for="fv-notes">Note generali</label>
                <textarea id="fv-notes" class="input area" rows="3" maxlength="5000" [value]="v.generalNotes ?? ''" (change)="patch({ generalNotes: val($event).trim() || null })"></textarea></div>
            </fieldset>
          </section>

          <app-visit-attendees [projectId]="id()" [visitId]="v.id" [attendees]="v.attendees" [project]="project.value() ?? null" [readOnly]="!editable()" (changed)="refresh()" />

          @if (v.openActionsToVerify.length) {
            <section class="card">
              <div class="card-header"><h3>Difformità da verificare</h3><span class="badge badge-warning">{{ v.openActionsToVerify.length }}</span></div>
              <ul class="actions-list">
                @for (a of v.openActionsToVerify; track a.id) {
                  <li><label class="check"><input type="checkbox" [checked]="resolved().has(a.id)" [disabled]="!editable()" (change)="toggleResolved(a.id)" />
                    <span>{{ a.text }} <span class="muted small">· dal verbale n. {{ a.sourceVisitNumber }}@if (a.dueDate) { · entro il {{ a.dueDate }} }</span></span></label></li>
                }
              </ul>
              <p class="muted small pad">Spunta quelle risolte: si chiuderanno alla finalizzazione di questo verbale.</p>
            </section>
          }

          <app-visit-media [projectId]="id()" [visitId]="v.id" [photos]="v.photos" [audio]="v.audio" [readOnly]="!editable()" (changed)="refresh()" />
        </div>
        <div class="col">
          <app-visit-items [projectId]="id()" [visitId]="v.id" [items]="v.items" [readOnly]="!editable()" (changed)="refresh()" />
        </div>
      </div>
    } @else if (loaded.error()) {
      <div class="card"><ui-empty icon="hardhat" title="Sopralluogo non disponibile" [text]="errorText()" /></div>
    } @else { <div class="card skeleton"></div> }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
    .actions { gap: 8px; flex-wrap: wrap; }
    .notice { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--surface-2); margin-bottom: 12px; }
    .notice.sync { background: var(--info-soft); }
    .row-between { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); margin-bottom: 12px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .col { display: grid; gap: 14px; }
    fieldset { border: 0; margin: 0; min-width: 0; }
    .area { height: auto; padding-top: 8px; resize: vertical; }
    .actions-list { list-style: none; margin: 0; padding: 6px 16px; display: grid; gap: 8px; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; }
    .check input { margin-top: 3px; }
    .pad { padding: 0 16px 12px; margin: 0; }
    .skeleton { height: 50vh; }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class FieldVisit {
  readonly id = input.required<string>();
  readonly visitId = input.required<string>();

  private readonly api = inject(FieldApi);
  private readonly projects = inject(ProjectsApi);
  private readonly documents = inject(DocumentsApi);
  private readonly queue = inject(MediaQueue);
  protected readonly ops = inject(FieldOps);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly dt = fmtDateTime;
  protected readonly local = toLocalInput;
  protected readonly weather = WEATHER;
  protected readonly typeLabel = VISIT_TYPE_LABEL;
  protected readonly statusLabel = VISIT_STATUS_LABEL;
  protected readonly types = Object.entries(VISIT_TYPE_LABEL) as [VisitType, string][];

  /** FR-M4-14: commessa e sopralluogo si aprono anche senza rete, dall'ultima copia salvata sul telefono. */
  protected readonly project = resource({
    params: () => this.id(),
    loader: ({ params }) => this.ops.load(`project:${params}`, () => this.projects.detail(params)).then((r) => r.data),
  });
  protected readonly loaded = resource({
    params: () => ({ p: this.id(), v: this.visitId() }),
    loader: ({ params }) => this.ops.load(`visit:${params.v}`, () => this.api.detail(params.p, params.v), true),
  });
  /** Dati del server (o della copia locale) con sopra le modifiche ancora in coda. */
  protected readonly view = computed(() => {
    const r = this.loaded.value();
    return r ? this.ops.apply(r.data) : undefined;
  });
  protected readonly offlineSince = computed(() => this.loaded.value()?.offlineSince ?? null);
  private readonly visitOps = computed(() => this.ops.all().filter((o) => o.visitId === this.visitId()));
  protected readonly pendingOps = computed(() => this.visitOps().filter((o) => !o.error).length);
  protected readonly failedOps = computed(() => this.visitOps().filter((o) => o.error));
  protected readonly resolved = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly finalizeError = signal<string | null>(null);

  protected readonly editable = computed(() => {
    const s = this.view()?.status;
    // Senza rete e senza copia della commessa si lascia lavorare: il server ricontrolla all'invio.
    const projectStatus = this.project.value()?.status ?? (this.project.error() ? 'ACTIVE' : null);
    return (s === 'DRAFT' || s === 'REVIEW') && projectStatus === 'ACTIVE';
  });
  protected readonly errorText = computed(() => toApiError(this.loaded.error()).userMessage);

  constructor() {
    // Quando un file o una modifica in coda arrivano al server si ricarica il sopralluogo.
    effect(() => {
      if (this.queue.uploaded() + this.ops.synced() > 0) untracked(() => this.refresh());
    });
  }

  protected refresh(): void {
    this.loaded.reload();
  }

  /** Le modifiche si vedono subito e partono dalla coda del cantiere (FR-M4-14). */
  protected async patch(p: VisitPatch): Promise<void> {
    try {
      await this.ops.enqueue({ kind: 'update-visit', projectId: this.id(), visitId: this.visitId(), patch: p });
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  protected patchDate(field: 'startedAt' | 'endedAt', value: string): void {
    if (!value && field === 'startedAt') return;
    void this.patch({ [field]: value ? new Date(value).toISOString() : null });
  }

  protected setWeather(condition: string, temperatureC?: number): void {
    void this.patch({ weather: condition ? { condition, source: 'MANUAL', ...(temperatureC !== undefined ? { temperatureC } : {}) } : null });
  }

  protected toggleResolved(id: string): void {
    this.resolved.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** FR-M4-12: la finalizzazione congela il verbale (BR-09); lo firma il Direttore dei Lavori. */
  protected async finalize(): Promise<void> {
    // BR-23: si finalizza solo quando tutto quello che è sul telefono è arrivato al server.
    if (this.queue.all().some((q) => q.visitId === this.visitId() && !q.error) || this.visitOps().length) {
      this.finalizeError.set(this.failedOps().length
        ? 'Alcune modifiche sono state rifiutate dal server: riprova o scartale prima di finalizzare.'
        : 'Alcune modifiche, foto o note sono ancora sul telefono: attendi che arrivino al server (serve la rete).');
      return;
    }
    const ok = await this.confirmer.ask({
      title: 'Finalizzare il verbale?',
      text: 'Il verbale non si potrà più modificare. Per correggerlo andrà annullato e rifatto. Potrai poi generare il PDF e inviarlo.',
      confirmLabel: 'Finalizza',
    });
    if (!ok) return;
    this.busy.set(true);
    this.finalizeError.set(null);
    try {
      await this.api.finalize(this.id(), this.visitId(), [...this.resolved()]);
      this.toaster.show('Verbale finalizzato');
      this.refresh();
    } catch (e) {
      const err = toApiError(e);
      const hints: Record<string, string> = {
        SYNC_INCOMPLETE: 'Alcuni file non sono ancora arrivati al server: attendi la sincronizzazione e riprova.',
        AI_REVIEW_PENDING: 'Ci sono voci "da verificare": confermale o modificale prima di finalizzare.',
        SIGNER_NOT_QUALIFIED: err.message.includes('ordine')
          ? 'Per firmare il verbale completa ordine professionale e numero di iscrizione nel tuo profilo (Impostazioni).'
          : 'Il verbale lo finalizza il Direttore dei Lavori della commessa (assegnalo in Team e imprese).',
      };
      this.finalizeError.set(hints[err.code] ?? err.userMessage);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelVisit(): Promise<void> {
    const r = await this.confirmer.ask({
      title: 'Annullare il sopralluogo?', text: 'Resta nello storico con il motivo; il numero non viene riutilizzato.',
      confirmLabel: 'Annulla sopralluogo', tone: 'danger', input: { label: 'Motivo', minLength: 10 },
    });
    if (!r) return;
    try {
      await this.api.cancel(this.id(), this.visitId(), r.value);
      this.toaster.show('Sopralluogo annullato');
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
    this.refresh();
  }

  /** FR-M5-01: verbale PDF (se esiste già, si riapre quello archiviato). */
  protected async generateReport(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.documents.generateSiteReport(this.id(), this.visitId());
      this.toaster.show(r.existing ? 'Il verbale PDF esiste già: lo trovi nei Documenti' : 'Verbale PDF generato: firmalo e invialo dai Documenti');
      await this.router.navigate(['/commesse', this.id()], { queryParams: { scheda: 'documenti' } });
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(false);
    }
  }
}
