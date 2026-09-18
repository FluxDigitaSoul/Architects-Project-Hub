import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { PinStatus } from '../../core/models';

export interface ViewerPin {
  id: string;
  number: number;
  x: number;
  y: number;
  status: PinStatus;
}

export interface PinPoint {
  x: number;
  y: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const DRAG_THRESHOLD_PX = 4;

/**
 * Converte un punto dello schermo in coordinate percentuali della pagina (AFU FR-M2-07, BR-20):
 * 0–100 su X e Y, 4 decimali, indipendenti da zoom e dispositivo.
 */
export function toPagePercent(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): PinPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return { x: round(x), y: round(y) };
}

/** Visualizzatore di tavole con zoom, pan, pinch e pin (AFU FR-M2-06..09). */
@Component({
  selector: 'ui-drawing-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #vp
      class="viewport"
      [class.is-comment]="commentMode()"
      [class.is-panning]="panning()"
      tabindex="0"
      role="application"
      aria-label="Tavola: usa + e − per lo zoom, 0 per adattare"
      (wheel)="onWheel($event)"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onCancel($event)"
      (keydown)="onKey($event)"
    >
      <div class="stage" [style.width.px]="natural().w" [style.height.px]="natural().h" [style.transform]="transform()">
        <img #img [src]="src()" alt="Tavola" draggable="false" (load)="onLoad()" />
        @for (p of pins(); track p.id) {
          <button
            type="button"
            class="pin"
            [class]="'pin ' + p.status"
            [class.is-selected]="p.id === selectedId()"
            [style.left.%]="p.x"
            [style.top.%]="p.y"
            [style.transform]="pinTransform()"
            [attr.aria-label]="'Osservazione ' + p.number"
            (pointerdown)="$event.stopPropagation()"
            (click)="pinSelect.emit(p.id)"
          >
            <span>{{ p.number }}</span>
          </button>
        }
        @if (draft(); as d) {
          <span class="pin DRAFT" [style.left.%]="d.x" [style.top.%]="d.y" [style.transform]="pinTransform()"><span>+</span></span>
        }
      </div>

      <div class="controls" (pointerdown)="$event.stopPropagation()">
        <button type="button" class="ctl" (click)="zoomBy(1 / 1.25)" aria-label="Riduci">−</button>
        <span class="pct mono">{{ percent() }}%</span>
        <button type="button" class="ctl" (click)="zoomBy(1.25)" aria-label="Ingrandisci">+</button>
        <span class="sep"></span>
        <button type="button" class="ctl wide" (click)="fit()">Adatta</button>
      </div>
      @if (commentMode()) {
        <div class="hint">Clicca sulla tavola nel punto da commentare</div>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .viewport { position: relative; height: 100%; overflow: hidden; touch-action: none; user-select: none; cursor: grab; outline: none;
      background: radial-gradient(circle, #d7dde5 1px, transparent 1px) 0 0/18px 18px, #eef1f5; border-radius: inherit; }
    .viewport:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-ring); }
    .viewport.is-panning { cursor: grabbing; }
    .viewport.is-comment { cursor: crosshair; }
    .stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
    .stage img { display: block; width: 100%; height: 100%; background: #fff; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.12); pointer-events: none; }
    .pin { position: absolute; width: 30px; height: 30px; margin: 0; padding: 0; border: 2px solid #fff; cursor: pointer; transform-origin: 50% 100%;
      border-radius: 50% 50% 50% 0; background: var(--color-primary); color: var(--color-primary-contrast); box-shadow: 0 3px 10px rgba(15, 23, 42, 0.3);
      display: grid; place-items: center; font-size: 12px; font-weight: 700; }
    .pin > span { transform: rotate(45deg); }
    .pin.WAITING { background: var(--warning); color: #fff; }
    .pin.RESOLVED { background: #94a3b8; color: #fff; }
    .pin.DRAFT { background: #fff; color: var(--color-primary); border-color: var(--color-primary); border-style: dashed; pointer-events: none; }
    .pin.is-selected { box-shadow: 0 0 0 4px var(--primary-ring), 0 3px 10px rgba(15, 23, 42, 0.3); z-index: 2; }
    .controls { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 2px; background: var(--surface); border: 1px solid var(--line);
      border-radius: 10px; padding: 3px; box-shadow: var(--shadow-sm); cursor: default; }
    .ctl { min-width: 30px; height: 30px; border: 0; background: transparent; border-radius: 7px; cursor: pointer; font-size: 16px; color: var(--ink-2); }
    .ctl.wide { font-size: 12.5px; font-weight: 500; padding: 0 10px; }
    .ctl:hover { background: var(--surface-2); }
    .pct { font-size: 12px; min-width: 44px; text-align: center; color: var(--muted); }
    .sep { width: 1px; height: 18px; background: var(--line); margin: 0 3px; }
    .hint { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: var(--ink); color: #fff; font-size: 12.5px; padding: 6px 12px; border-radius: 999px; pointer-events: none; }
  `,
})
export class DrawingViewer {
  readonly src = input.required<string>();
  readonly pins = input<ViewerPin[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly commentMode = input(false);
  readonly draft = input<PinPoint | null>(null);
  readonly pinPlace = output<PinPoint>();
  readonly pinSelect = output<string>();

  private readonly vp = viewChild.required<ElementRef<HTMLDivElement>>('vp');
  private readonly img = viewChild.required<ElementRef<HTMLImageElement>>('img');

  protected readonly natural = signal({ w: 1600, h: 1100 });
  private readonly scale = signal(1);
  private readonly tx = signal(0);
  private readonly ty = signal(0);
  protected readonly panning = signal(false);

  protected readonly transform = computed(() => `translate(${this.tx()}px, ${this.ty()}px) scale(${this.scale()})`);
  /** I pin mantengono la stessa dimensione sullo schermo a qualsiasi zoom. */
  protected readonly pinTransform = computed(() => `translate(-50%, -100%) scale(${1 / this.scale()}) rotate(-45deg)`);
  protected readonly percent = computed(() => Math.round(this.scale() * 100));

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
  private moved = false;
  private pinchStart: { dist: number; scale: number } | null = null;

  protected onLoad(): void {
    const el = this.img().nativeElement;
    this.natural.set({ w: el.naturalWidth || 1600, h: el.naturalHeight || 1100 });
    queueMicrotask(() => this.fit());
  }

  fit(): void {
    const box = this.vp().nativeElement.getBoundingClientRect();
    const { w, h } = this.natural();
    const s = Math.min(box.width / w, box.height / h) * 0.94;
    this.scale.set(clampScale(s));
    this.tx.set((box.width - w * this.scale()) / 2);
    this.ty.set((box.height - h * this.scale()) / 2);
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
    const box = this.vp().nativeElement.getBoundingClientRect();
    const px = cx ?? box.width / 2;
    const py = cy ?? box.height / 2;
    const s0 = this.scale();
    const s1 = clampScale(s0 * factor);
    this.tx.set(px - ((px - this.tx()) * s1) / s0);
    this.ty.set(py - ((py - this.ty()) * s1) / s0);
    this.scale.set(s1);
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const box = this.vp().nativeElement.getBoundingClientRect();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === '+' || e.key === '=') this.zoomBy(1.25);
    else if (e.key === '-') this.zoomBy(1 / 1.25);
    else if (e.key === '0') this.fit();
  }

  protected onDown(e: PointerEvent): void {
    this.vp().nativeElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY, tx: this.tx(), ty: this.ty() };
      this.moved = false;
    } else if (this.pointers.size === 2) {
      this.pinchStart = { dist: this.pointerDistance(), scale: this.scale() };
      this.moved = true;
    }
  }

  protected onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const box = this.vp().nativeElement.getBoundingClientRect();
      const target = clampScale((this.pinchStart.scale * this.pointerDistance()) / this.pinchStart.dist);
      this.zoomBy(target / this.scale(), (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
      return;
    }
    if (!this.dragStart) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    if (!this.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.moved = true;
    this.panning.set(true);
    this.tx.set(this.dragStart.tx + dx);
    this.ty.set(this.dragStart.ty + dy);
  }

  protected onUp(e: PointerEvent): void {
    const wasTap = this.pointers.size === 1 && !this.moved;
    this.onCancel(e);
    if (wasTap && this.commentMode()) {
      const point = toPagePercent(e.clientX, e.clientY, this.img().nativeElement.getBoundingClientRect());
      if (point) this.pinPlace.emit(point);
    }
  }

  protected onCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (this.pointers.size === 0) {
      this.dragStart = null;
      this.panning.set(false);
    }
  }

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
