import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Finestra modale basata su <dialog> nativo: focus trap, tasto Esc e accessibilità
 * gestiti dal browser.
 */
@Component({
  selector: 'ui-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg (close)="closed.emit()" (click)="onBackdrop($event)" [style.max-width.px]="width()">
      <div class="head">
        <h2>{{ title() }}</h2>
        <button class="btn btn-ghost btn-icon" type="button" (click)="dlg.close()" aria-label="Chiudi">✕</button>
      </div>
      <div class="body"><ng-content /></div>
      <div class="foot"><ng-content select="[dialog-actions]" /></div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 14px; padding: 0; width: calc(100vw - 32px); box-shadow: 0 24px 64px rgba(15, 23, 42, 0.25); color: var(--ink); }
    dialog::backdrop { background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(2px); }
    dialog[open] { animation: fade-up 0.16s ease-out; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
    .body { padding: 18px 20px; display: grid; gap: 14px; max-height: 70vh; overflow: auto; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--line); background: var(--surface-2); border-radius: 0 0 14px 14px; }
    .foot:empty { display: none; }
  `,
})
export class Dialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly width = input(520);
  readonly closed = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) el.showModal();
      if (!this.open() && el.open) el.close();
    });
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.dlg().nativeElement.close();
  }
}
