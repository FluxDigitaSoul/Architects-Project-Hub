import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ReviewStore } from '../../core/data/review-store';
import { fmtDateTime, fmtRelative } from '../../core/data/format';
import type { Actor, Drawing, Pin } from '../../core/models';
import { DrawingViewer, type PinPoint } from '../../shared/ui/drawing-viewer';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { SignOffDialog } from './sign-off-dialog';

const PIN_STATUS_LABEL = { OPEN: 'Aperta', WAITING: 'In attesa', RESOLVED: 'Risolta' } as const;

/**
 * Revisione di una tavola con pin e thread (AFU FR-M2-06..16). Usato sia dallo studio
 * sia dal committente: `actor` decide le azioni disponibili (cap. 2, matrice CRUD).
 */
@Component({
  selector: 'app-review-workspace',
  imports: [DrawingViewer, Icon, SignOffDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws">
      <div class="canvas card">
        <ui-drawing-viewer
          [src]="drawing().imageUrl ?? ''"
          [pins]="visiblePins()"
          [selectedId]="selectedId()"
          [commentMode]="commentMode()"
          [draft]="draft()"
          (pinPlace)="onPlace($event)"
          (pinSelect)="select($event)"
        />
      </div>

      <aside class="side card">
        @if (approval(); as a) {
          <div class="frozen">
            <ui-icon name="check" [size]="16" />
            <div><b>Versione approvata</b><div class="small">da {{ a.signer }} il {{ dt(a.at) }} · codice {{ a.verificationCode }}</div></div>
          </div>
        }

        <div class="side-head">
          <div class="row-between">
            <h3>Osservazioni <span class="muted">{{ openCount() }} aperte</span></h3>
            <button class="btn btn-sm" [class.btn-primary]="commentMode()" [class.btn-outline]="!commentMode()" [disabled]="frozen()"
              (click)="toggleComment()" [title]="frozen() ? 'Versione approvata: nuove osservazioni non ammesse (BR-01)' : ''">
              <ui-icon name="map-pin" [size]="14" /> {{ commentMode() ? 'Annulla' : 'Commenta' }}
            </button>
          </div>
          <label class="check small"><input type="checkbox" [checked]="showResolved()" (change)="showResolved.set($any($event.target).checked)" /> Mostra risolte</label>
        </div>

        <div class="side-body">
          @if (draft(); as d) {
            <div class="composer">
              <div class="eyebrow">Nuova osservazione #{{ nextNumber() }}</div>
              <textarea class="textarea" rows="4" placeholder="Scrivi la tua osservazione…" [value]="text()" (input)="text.set(val($event))" autofocus></textarea>
              <div class="row" style="justify-content:flex-end">
                <button class="btn btn-ghost btn-sm" (click)="cancelDraft()">Annulla</button>
                <button class="btn btn-primary btn-sm" [disabled]="!text().trim()" (click)="submitPin(d)">Invia</button>
              </div>
            </div>
          } @else if (selected(); as p) {
            <div class="thread">
              <div class="row-between">
                <button class="btn btn-ghost btn-sm" (click)="selectedId.set(null)"><ui-icon name="chevron-left" [size]="14" /> Tutte</button>
                <span class="badge" [class.badge-primary]="p.status === 'OPEN'" [class.badge-warning]="p.status === 'WAITING'" [class.badge-plain]="p.status === 'RESOLVED'">#{{ p.number }} · {{ statusLabel[p.status] }}</span>
              </div>
              @for (c of p.comments; track c.id) {
                <div class="msg" [class.mine]="c.actor === actor()">
                  <div class="row-between small"><b>{{ c.actor === 'STUDIO' ? 'Studio' : c.author }}</b><span class="muted">{{ rel(c.at) }}</span></div>
                  <p>{{ c.text }}</p>
                </div>
              }
              @if (!frozen()) {
                <textarea class="textarea" rows="3" [placeholder]="p.status === 'RESOLVED' ? 'Motivo della riapertura…' : 'Rispondi…'" [value]="text()" (input)="text.set(val($event))"></textarea>
                <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
                  @if (p.status === 'RESOLVED') {
                    <button class="btn btn-outline btn-sm" [disabled]="!text().trim()" (click)="reopen(p)">Riapri</button>
                  } @else {
                    @if (actor() === 'STUDIO') { <button class="btn btn-outline btn-sm" (click)="resolve(p)"><ui-icon name="check" [size]="14" /> Risolvi</button> }
                    <button class="btn btn-primary btn-sm" [disabled]="!text().trim()" (click)="reply(p)">Rispondi</button>
                  }
                </div>
              }
            </div>
          } @else {
            <ul class="list">
              @for (p of listPins(); track p.id) {
                <li (click)="select(p.id)">
                  <span class="num" [class]="'num ' + p.status">{{ p.number }}</span>
                  <span class="li-text"><span class="clip">{{ p.comments[0]?.text }}</span>
                    <span class="muted small">{{ p.comments.length }} {{ p.comments.length === 1 ? 'messaggio' : 'messaggi' }} · {{ rel(p.comments[p.comments.length - 1]?.at ?? '') }}</span></span>
                </li>
              } @empty {
                <li class="empty muted">Nessuna osservazione. {{ frozen() ? '' : 'Premi "Commenta" e clicca sulla tavola.' }}</li>
              }
            </ul>
          }
        </div>

        @if (canApprove() && !frozen()) {
          <div class="side-foot">
            <button class="btn btn-primary" style="width:100%" (click)="signOffOpen.set(true)"><ui-icon name="check" [size]="16" /> Approva questa versione</button>
          </div>
        }
      </aside>
    </div>

    <app-sign-off-dialog [open]="signOffOpen()" [drawing]="drawing()" [openPins]="openCount()" [signer]="author()" [email]="email()"
      (closed)="signOffOpen.set(false)" (confirmed)="approve()" />
  `,
  styles: `
    .ws { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; height: calc(100vh - var(--topbar-h) - 150px); min-height: 520px; }
    .canvas { overflow: hidden; }
    .side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .frozen { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; background: var(--success-soft); color: var(--success); border-bottom: 1px solid var(--line); }
    .side-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
    .side-head h3 span { font-weight: 400; font-size: 13px; }
    .side-body { flex: 1; overflow: auto; }
    .side-foot { padding: 12px 16px; border-top: 1px solid var(--line); }
    .list { list-style: none; margin: 0; padding: 6px; }
    .list li { display: flex; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; align-items: flex-start; }
    .list li:hover { background: var(--surface-2); }
    .list li.empty { cursor: default; font-size: 13px; }
    .num { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; background: var(--color-primary); color: var(--color-primary-contrast); }
    .num.WAITING { background: var(--warning); color: #fff; } .num.RESOLVED { background: #94a3b8; color: #fff; }
    .li-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; font-size: 13px; }
    .clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .composer, .thread { padding: 14px 16px; display: grid; gap: 10px; }
    .msg { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; display: grid; gap: 4px; font-size: 13px; }
    .msg.mine { background: var(--primary-soft); border-color: transparent; }
    @media (max-width: 1000px) { .ws { grid-template-columns: 1fr; height: auto; } .canvas { height: 60vh; } .side { max-height: none; } }
  `,
})
export class ReviewWorkspace {
  readonly drawing = input.required<Drawing>();
  readonly actor = input.required<Actor>();
  readonly author = input.required<string>();
  readonly email = input('');
  readonly canApprove = input(false);

  private readonly review = inject(ReviewStore);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly rel = fmtRelative;
  protected readonly dt = fmtDateTime;
  protected readonly statusLabel = PIN_STATUS_LABEL;

  protected readonly pins = computed(() => this.review.pinsOf(this.drawing().id)());
  protected readonly approval = computed(() => this.review.approvalOf(this.drawing().id)());
  protected readonly frozen = computed(() => this.approval() !== null);
  protected readonly openCount = computed(() => this.pins().filter((p) => p.status !== 'RESOLVED').length);
  protected readonly nextNumber = computed(() => this.pins().reduce((m, p) => Math.max(m, p.number), 0) + 1);

  protected readonly showResolved = signal(false);
  protected readonly commentMode = signal(false);
  protected readonly draft = signal<PinPoint | null>(null);
  /** Se si cambia tavola, `selected()` torna null da solo: il pin non appartiene più ai `pins()`. */
  protected readonly selectedId = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly signOffOpen = signal(false);

  protected readonly listPins = computed(() =>
    this.pins()
      .filter((p) => this.showResolved() || p.status !== 'RESOLVED')
      .sort((a, b) => a.number - b.number),
  );
  protected readonly visiblePins = computed(() => {
    const sel = this.selectedId();
    return this.pins().filter((p) => this.showResolved() || p.status !== 'RESOLVED' || p.id === sel);
  });
  protected readonly selected = computed(() => this.pins().find((p) => p.id === this.selectedId()) ?? null);

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
    this.selectedId.set(id);
    this.draft.set(null);
    this.text.set('');
  }

  protected submitPin(point: PinPoint): void {
    const res = this.review.addPin(this.drawing().id, point.x, point.y, this.text(), this.actor(), this.author());
    if (!res.ok) return this.fail(res.code);
    this.draft.set(null);
    this.commentMode.set(false);
    this.text.set('');
    this.selectedId.set(res.value.id);
    this.toaster.show(`Osservazione #${res.value.number} inviata`);
  }

  protected reply(p: Pin): void {
    const res = this.review.reply(p.id, this.text(), this.actor(), this.author());
    if (!res.ok) return this.fail(res.code);
    this.text.set('');
  }

  protected resolve(p: Pin): void {
    if (this.text().trim()) this.review.reply(p.id, this.text(), this.actor(), this.author());
    const res = this.review.resolve(p.id);
    if (!res.ok) return this.fail(res.code);
    this.text.set('');
    this.toaster.show(`Osservazione #${p.number} risolta`);
  }

  protected reopen(p: Pin): void {
    const res = this.review.reopen(p.id, this.text(), this.actor(), this.author());
    if (!res.ok) return this.fail(res.code);
    this.text.set('');
  }

  protected approve(): void {
    const d = this.drawing();
    const res = this.review.approve(d.id, d.version, this.author());
    this.signOffOpen.set(false);
    if (!res.ok) return this.fail(res.code);
    this.toaster.show(`Tavola approvata · codice ${res.value.verificationCode}`);
  }

  private fail(code: string): void {
    const msg: Record<string, string> = {
      VERSION_FROZEN: 'Questa versione è approvata: non si può più modificare (BR-01).',
      EMPTY_TEXT: 'Scrivi un messaggio.',
      NOT_FOUND: 'Osservazione non trovata.',
    };
    this.toaster.show(msg[code] ?? 'Operazione non riuscita', 'danger');
  }
}
