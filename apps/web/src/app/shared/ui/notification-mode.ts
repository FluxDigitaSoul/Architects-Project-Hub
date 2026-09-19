import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NOTIFICATION_MODE_LABEL, type NotificationMode } from '../../core/api/studio-settings';

const MODES = Object.keys(NOTIFICATION_MODE_LABEL) as NotificationMode[];

/** Scelta di come ricevere le notifiche email (FR-MT-06): usata dal profilo dello studio e dal portale. */
@Component({
  selector: 'ui-notification-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="opts" role="radiogroup" [attr.aria-label]="label()">
      @for (m of modes; track m) {
        <label class="opt" [class.on]="value() === m">
          <input type="radio" [name]="name()" [value]="m" [checked]="value() === m" [disabled]="disabled()" (change)="changed.emit(m)" />
          <span><b>{{ labels[m].label }}</b><span class="muted small">{{ labels[m].hint }}</span></span>
        </label>
      }
    </div>
  `,
  styles: `
    .opts { display: grid; gap: 8px; }
    .opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
    .opt.on { border-color: var(--color-primary); background: var(--surface-2); }
    .opt input { margin-top: 3px; accent-color: var(--color-primary); }
    .opt > span { display: grid; gap: 2px; }
  `,
})
export class NotificationModePicker {
  readonly value = input.required<NotificationMode>();
  readonly name = input('notification-mode');
  readonly label = input('Avvisi via email');
  readonly disabled = input(false);
  readonly changed = output<NotificationMode>();
  protected readonly modes = MODES;
  protected readonly labels = NOTIFICATION_MODE_LABEL;
}
