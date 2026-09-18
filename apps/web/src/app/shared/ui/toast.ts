import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

export type ToastTone = 'success' | 'info' | 'danger';

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** Notifiche brevi e non bloccanti. */
@Injectable({ providedIn: 'root' })
export class Toaster {
  private seq = 0;
  readonly items = signal<Toast[]>([]);

  show(text: string, tone: ToastTone = 'success', ms = 3500): void {
    const id = ++this.seq;
    this.items.update((all) => [...all, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items.update((all) => all.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'ui-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toaster.items(); track t.id) {
        <div class="toast" [class]="'toast ' + t.tone" (click)="toaster.dismiss(t.id)">{{ t.text }}</div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: grid; gap: 8px; z-index: 100; width: min(92vw, 420px); }
    .toast { padding: 11px 16px; border-radius: 10px; background: var(--ink); color: #fff; box-shadow: var(--shadow-md); font-size: 13.5px; font-weight: 500; cursor: pointer; animation: fade-up 0.18s ease-out; border-left: 4px solid var(--success); }
    .toast.info { border-left-color: var(--info); }
    .toast.danger { border-left-color: var(--danger); }
  `,
})
export class Toasts {
  protected readonly toaster = inject(Toaster);
}
