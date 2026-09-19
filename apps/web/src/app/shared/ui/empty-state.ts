import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, type IconName } from './icon';

@Component({
  selector: 'ui-empty',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="empty-icon"><ui-icon [name]="icon()" [size]="22" /></div>
      <h3>{{ title() }}</h3>
      @if (text()) { <p class="muted">{{ text() }}</p> }
      <div class="empty-actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 44px 20px; }
    .empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--primary-soft); color: var(--color-primary); margin-bottom: 4px; }
    .empty p { max-width: 380px; }
    .empty-actions { margin-top: 8px; display: flex; gap: 8px; }
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly text = input<string>();
  readonly icon = input<IconName>('sparkles');
}
