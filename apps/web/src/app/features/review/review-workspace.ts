import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { PIN_STATUS_LABEL, type ReviewBackend, type ReviewComment, type ReviewPin } from '../../core/api/review-api';
import { fmtDateTime, fmtRelative } from '../../core/data/format';
import { PageRenderer } from '../../core/pdf/page-renderer';
import { DrawingViewer, type PinPoint } from '../../shared/ui/drawing-viewer';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

/** BR-14: un commento si modifica entro 15 minuti e se nessuno ha ancora risposto. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE: ReviewPin['status'][] = ['OPEN', 'WAITING'];

/**
 * Revisione di una versione con pin e thread (AFU FR-M2-06..13). Condiviso da studio e portale:
 * il `backend` decide endpoint e permessi (lo studio può risolvere, il committente no).
 * Le azioni di approvazione si proiettano nel piede (`[review-actions]`).
 */
@Component({
  selector: 'app-review-workspace',
  imports: [DrawingViewer, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws">
      <div class="canvas card">
        @if (page.value(); as pg) {
          <ui-drawing-viewer [src]="pg.src" [pins]="pagePins()" [selectedId]="selectedId()" [commentMode]="commentMode()"
            [draft]="draft()" (pinPlace)="onPlace($event)" (pinSelect)="select($event)" />
        } @else if (page.error() || file.error() || view.error()) {
          <div class="state"><ui-icon name="alert" /> <p>{{ loadError() }}</p>
            <button class="btn btn-outline btn-sm" (click)="reload()">Riprova</button></div>
        } @else {
          <div class="state muted"><span class="spinner"></span> Caricamento della tavola…</div>
        }
        @if (pageCount() > 1) {
          <div class="pages" role="group" aria-label="Pagine">
            <button class="btn btn-outline btn-sm" [disabled]="pageIndex() === 0" (click)="goPage(pageIndex() - 1)" aria-label="Pagina precedente"><ui-icon name="chevron-left" [size]="14" /></button>
            <span class="small mono">{{ pageIndex() + 1 }} / {{ pageCount() }}</span>
            <button class="btn btn-outline btn-sm" [disabled]="pageIndex() >= pageCount() - 1" (click)="goPage(pageIndex() + 1)" aria-label="Pagina successiva"><ui-icon name="chevron-right" [size]="14" /></button>
          </div>
        }
      </div>

      <aside class="side card">
        @if (view.value(); as v) {
          @if (v.version.frozen) {
            <div class="frozen" [class.superseded]="v.version.status === 'SUPERSEDED'">
              <ui-icon [name]="v.version.status === 'APPROVED' ? 'check' : 'lock'" [size]="16" />
              <div><b>{{ v.version.status === 'APPROVED' ? 'Versione approvata' : 'Versione superata' }}</b>
                <div class="small">Le osservazioni sono congelate. {{ backend().actor === 'CLIENT' ? 'Per altre modifiche usa "Richiedi una modifica".' : '' }}</div></div>
            </div>
          }
        }

        <div class="side-head">
          <div class="row-between">
            <h3>Osservazioni <span class="muted">{{ activeCount() }} aperte</span></h3>
            @if (canPin()) {
              <button class="btn btn-sm" [class.btn-primary]="commentMode()" [class.btn-outline]="!commentMode()" (click)="toggleComment()">
                <ui-icon name="map-pin" [size]="14" /> {{ commentMode() ? 'Annulla' : 'Commenta' }}
              </button>
            }
          </div>
          <div class="row-between small">
            <label class="check"><input type="checkbox" [checked]="showClosed()" (change)="showClosed.set($any($event.target).checked)" /> Mostra risolte</label>
            @if (canDownload()) { <button class="btn btn-ghost btn-sm" (click)="download()"><ui-icon name="download" [size]="14" /> Scarica</button> }
          </div>
        </div>

        <div class="side-body">
          @if (draft(); as d) {
            <div class="composer">
              <div class="eyebrow">Nuova osservazione @if (pageCount() > 1) { · pagina {{ pageIndex() + 1 }} }</div>
              <textarea class="textarea" rows="4" placeholder="Scrivi la tua osservazione…" maxlength="5000" [value]="text()" (input)="text.set(val($event))" autofocus></textarea>
              <div class="row end">
                <button class="btn btn-ghost btn-sm" (click)="cancelDraft()">Annulla</button>
                <button class="btn btn-primary btn-sm" [disabled]="!text().trim() || busy()" (click)="submitPin(d)">Invia</button>
              </div>
            </div>
          } @else if (selected(); as p) {
            <div class="thread">
              <div class="row-between">
                <button class="btn btn-ghost btn-sm" (click)="selectedId.set(null)"><ui-icon name="chevron-left" [size]="14" /> Tutte</button>
                <span class="badge" [class.badge-primary]="p.status === 'OPEN'" [class.badge-warning]="p.status === 'WAITING'" [class.badge-plain]="!isActive(p)">#{{ p.number }} · {{ statusLabel[p.status] }}</span>
              </div>
              @for (c of p.comments; track c.id) {
                <div class="msg" [class.mine]="c.isMine">
                  <div class="row-between small"><b>{{ c.authorName }}</b><span class="muted" [title]="dt(c.createdAt)">{{ rel(c.createdAt) }}@if (c.edited) { · modificato }</span></div>
                  @if (editing()?.id === c.id) {
                    <textarea class="textarea" rows="3" [value]="editText()" (input)="editText.set(val($event))"></textarea>
                    <div class="row end"><button class="btn btn-ghost btn-sm" (click)="editing.set(null)">Annulla</button>
                      <button class="btn btn-primary btn-sm" [disabled]="!editText().trim() || busy()" (click)="saveEdit(c)">Salva</button></div>
                  } @else if (c.retracted) {
                    <p class="muted"><i>Messaggio ritirato</i></p>
                  } @else {
                    <p>{{ c.body }}</p>
                    @if (canEdit(p, c)) { <button class="linkish small" (click)="startEdit(c)">Modifica</button> }
                  }
                </div>
              }
              @if (canWrite() && p.status !== 'FROZEN' && p.status !== 'TRANSFERRED') {
                <textarea class="textarea" rows="3" maxlength="5000" [placeholder]="p.status === 'RESOLVED' ? 'Motivo della riapertura…' : 'Rispondi…'" [value]="text()" (input)="text.set(val($event))"></textarea>
                <div class="row end wrap">
                  @if (p.status === 'RESOLVED') {
                    @if (backend().actor === 'MEMBER' || p.isMine) { <button class="btn btn-outline btn-sm" [disabled]="!text().trim() || busy()" (click)="reopen(p)">Riapri</button> }
                  } @else {
                    @if (canWithdraw(p)) { <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="withdraw(p)">Ritira</button> }
                    @if (backend().resolve) { <button class="btn btn-outline btn-sm" [disabled]="busy()" (click)="resolve(p)"><ui-icon name="check" [size]="14" /> Risolvi</button> }
                    <button class="btn btn-primary btn-sm" [disabled]="!text().trim() || busy()" (click)="reply(p)">Rispondi</button>
                  }
                </div>
              }
            </div>
          } @else {
            <ul class="list">
              @for (p of listPins(); track p.id) {
                <li (click)="select(p.id)" (keydown.enter)="select(p.id)" tabindex="0">
                  <span [class]="'num ' + p.status">{{ p.number }}</span>
                  <span class="li-text"><span class="clip">{{ firstText(p) }}</span>
                    <span class="muted small">{{ p.authorName }} · {{ p.comments.length }} {{ p.comments.length === 1 ? 'messaggio' : 'messaggi' }}@if (pageCount() > 1) { · p. {{ p.pageIndex + 1 }} } · {{ statusLabel[p.status] }}</span></span>
                </li>
              } @empty {
                <li class="empty muted">Nessuna osservazione. @if (canPin()) { Premi "Commenta" e tocca la tavola nel punto da segnalare. }</li>
              }
            </ul>
          }
        </div>

        <div class="side-foot"><ng-content select="[review-actions]" /></div>
      </aside>
    </div>
  `,
  styles: `
    .ws { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; height: calc(100vh - var(--topbar-h) - 170px); min-height: 520px; }
    .canvas { overflow: hidden; position: relative; }
    .state { height: 100%; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; padding: 20px; text-align: center; }
    .spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--color-primary); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .pages { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 3px 6px; }
    .side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .frozen { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; background: var(--success-soft); color: var(--success); border-bottom: 1px solid var(--line); }
    .frozen.superseded { background: var(--surface-2); color: var(--ink-2); }
    .side-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
    .side-head h3 span { font-weight: 400; font-size: 13px; }
    .check { display: flex; gap: 6px; align-items: center; }
    .side-body { flex: 1; overflow: auto; }
    .side-foot { border-top: 1px solid var(--line); }
    .side-foot:empty { display: none; }
    .list { list-style: none; margin: 0; padding: 6px; }
    .list li { display: flex; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; align-items: flex-start; }
    .list li:hover, .list li:focus-visible { background: var(--surface-2); outline: none; }
    .list li.empty { cursor: default; font-size: 13px; }
    .num { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; background: var(--color-primary); color: var(--color-primary-contrast); }
    .num.WAITING { background: var(--warning); color: #fff; }
    .num.RESOLVED, .num.FROZEN, .num.TRANSFERRED { background: #94a3b8; color: #fff; }
    .li-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; font-size: 13px; }
    .clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .composer, .thread { padding: 14px 16px; display: grid; gap: 10px; }
    .msg { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; display: grid; gap: 4px; font-size: 13px; }
    .msg p { margin: 0; white-space: pre-wrap; }
    .msg.mine { background: var(--primary-soft); border-color: transparent; }
    .end { justify-content: flex-end; }
    .wrap { flex-wrap: wrap; }
    .linkish { background: none; border: 0; padding: 0; color: var(--color-primary); cursor: pointer; justify-self: start; }
    @media (max-width: 1000px) { .ws { grid-template-columns: 1fr; height: auto; } .canvas { height: 62vh; } }
  `,
})
export class ReviewWorkspace {
  readonly backend = input.required<ReviewBackend>();
  readonly versionId = input.required<string>();
  /** Permesso di commentare (es. commessa non attiva o sola lettura). */
  readonly canComment = input(true);
  readonly canDownload = input(false);
  /** Dopo ogni modifica (per aggiornare conteggi ed elenchi della pagina). */
  readonly changed = output<void>();

  private readonly renderer = inject(PageRenderer);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly rel = fmtRelative;
  protected readonly dt = fmtDateTime;
  protected readonly statusLabel = PIN_STATUS_LABEL;

  protected readonly view = resource({
    params: () => ({ backend: this.backend(), id: this.versionId() }),
    loader: ({ params }) => params.backend.view(params.id),
  });
  protected readonly file = resource({
    params: () => ({ backend: this.backend(), id: this.versionId() }),
    loader: ({ params }) => params.backend.file(params.id),
  });
  protected readonly pageIndex = linkedSignal({ source: this.versionId, computation: () => 0 });
  protected readonly page = resource({
    params: () => {
      const f = this.file.value();
      return f ? { id: this.versionId(), url: f.url, mime: f.mimeType, index: this.pageIndex() } : undefined;
    },
    loader: ({ params }) => this.renderer.render(params.id, params.url, params.mime, params.index),
  });

  protected readonly showClosed = signal(false);
  protected readonly commentMode = signal(false);
  protected readonly draft = signal<PinPoint | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly editing = signal<ReviewComment | null>(null);
  protected readonly editText = signal('');
  protected readonly busy = signal(false);

  protected readonly pins = computed(() => this.view.value()?.pins ?? []);
  protected readonly pageCount = computed(() => this.view.value()?.pages.length ?? 1);
  protected readonly activeCount = computed(() => this.pins().filter((p) => this.isActive(p)).length);
  protected readonly canWrite = computed(() => this.canComment() && !this.view.value()?.version.frozen);
  /** Lo studio annota bozze e pubblicate, il committente solo le pubblicate (FR-M2-08). */
  protected readonly canPin = computed(() => {
    const status = this.view.value()?.version.status;
    const allowed = this.backend().actor === 'MEMBER' ? ['DRAFT', 'PUBLISHED'] : ['PUBLISHED'];
    return this.canWrite() && !!status && allowed.includes(status);
  });
  protected readonly listPins = computed(() =>
    this.pins().filter((p) => this.showClosed() || this.isActive(p)).sort((a, b) => a.number - b.number),
  );
  protected readonly pagePins = computed(() => {
    const sel = this.selectedId();
    return this.pins().filter((p) => p.pageIndex === this.pageIndex() && (this.showClosed() || this.isActive(p) || p.id === sel));
  });
  protected readonly selected = computed(() => this.pins().find((p) => p.id === this.selectedId()) ?? null);
  protected readonly loadError = computed(() => {
    const e = this.view.error() ?? this.file.error();
    return e ? toApiError(e).userMessage : 'La tavola non si è caricata. Riprova tra poco.';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.renderer.release(this.versionId()));
  }

  reload(): void {
    this.view.reload();
    if (this.file.error() || this.page.error()) {
      this.renderer.release(this.versionId());
      this.file.reload();
    }
  }

  protected isActive(p: ReviewPin): boolean {
    return ACTIVE.includes(p.status);
  }

  protected firstText(p: ReviewPin): string {
    const c = p.comments[0];
    return !c ? '' : c.retracted ? 'Messaggio ritirato' : c.body;
  }

  protected canWithdraw(p: ReviewPin): boolean {
    return p.isMine && p.status === 'OPEN' && p.comments.length === 1;
  }

  protected canEdit(p: ReviewPin, c: ReviewComment): boolean {
    const last = p.comments[p.comments.length - 1];
    return this.canWrite() && c.isMine && !c.retracted && last?.id === c.id && Date.now() - Date.parse(c.createdAt) < EDIT_WINDOW_MS;
  }

  protected goPage(i: number): void {
    this.pageIndex.set(i);
    this.draft.set(null);
  }

  protected toggleComment(): void {
    this.commentMode.update((v) => !v);
    this.draft.set(null);
  }

  protected onPlace(point: PinPoint): void {
    this.draft.set(point);
    this.selectedId.set(null);
    this.text.set('');
  }

  protected cancelDraft(): void {
    this.draft.set(null);
    this.commentMode.set(false);
  }

  protected select(id: string): void {
    const pin = this.pins().find((p) => p.id === id);
    if (pin && pin.pageIndex !== this.pageIndex()) this.pageIndex.set(pin.pageIndex);
    this.selectedId.set(id);
    this.draft.set(null);
    this.editing.set(null);
    this.text.set('');
  }

  protected async submitPin(point: PinPoint): Promise<void> {
    const body = this.text().trim();
    await this.run(async () => {
      const pin = await this.backend().createPin(this.versionId(), { pageIndex: this.pageIndex(), x: point.x, y: point.y, body });
      this.draft.set(null);
      this.commentMode.set(false);
      this.selectedId.set(pin.id);
      this.toaster.show(`Osservazione #${pin.number} inviata`);
    });
  }

  protected async reply(p: ReviewPin): Promise<void> {
    await this.run(() => this.backend().comment(p.id, this.text().trim()));
  }

  protected async resolve(p: ReviewPin): Promise<void> {
    const resolve = this.backend().resolve;
    if (!resolve) return;
    await this.run(async () => {
      if (this.text().trim()) await this.backend().comment(p.id, this.text().trim());
      await resolve(p.id);
      this.toaster.show(`Osservazione #${p.number} risolta`);
    });
  }

  protected async reopen(p: ReviewPin): Promise<void> {
    await this.run(() => this.backend().reopen(p.id, this.text().trim()));
  }

  protected async withdraw(p: ReviewPin): Promise<void> {
    await this.run(async () => {
      await this.backend().withdraw(p.id);
      this.selectedId.set(null);
      this.toaster.show(`Osservazione #${p.number} ritirata`);
    });
  }

  protected startEdit(c: ReviewComment): void {
    this.editing.set(c);
    this.editText.set(c.body);
  }

  protected async saveEdit(c: ReviewComment): Promise<void> {
    await this.run(async () => {
      await this.backend().editComment(c.id, this.editText().trim());
      this.editing.set(null);
    });
  }

  protected async download(): Promise<void> {
    try {
      const link = await this.backend().file(this.versionId(), true);
      window.open(link.url, '_blank', 'noopener');
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
      this.text.set('');
      this.view.reload();
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
      this.view.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
