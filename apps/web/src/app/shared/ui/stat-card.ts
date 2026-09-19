import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, type IconName } from './icon';

/** Widget numerico della dashboard (AFU FR-M1-04). */
@Component({
  selector: 'ui-stat',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  template: `
    <div class="stat">
      <div class="stat-icon" [class]="'tone-' + tone()"><ui-icon [name]="icon()" [size]="18" /></div>
      <div class="stat-text">
        <div class="stat-label">{{ label() }}</div>
        <div class="stat-value mono">{{ value() }}</div>
        @if (hint()) { <div class="stat-hint muted small">{{ hint() }}</div> }
      </div>
    </div>
  `,
  styles: `
    .stat { display: flex; gap: 14px; padding: 18px; align-items: flex-start; }
    .stat-icon { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; flex: none;
      background: var(--primary-soft); color: var(--color-primary); }
    .tone-success { background: var(--success-soft); color: var(--success); }
    .tone-warning { background: var(--warning-soft); color: var(--warning); }
    .tone-danger { background: var(--danger-soft); color: var(--danger); }
    .tone-info { background: var(--info-soft); color: var(--info); }
    .stat-label { font-size: 12.5px; color: var(--muted); font-weight: 500; }
    .stat-value { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; margin-top: 2px; }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input.required<IconName>();
  readonly hint = input<string>();
  readonly tone = input<'primary' | 'success' | 'warning' | 'danger' | 'info'>('primary');
}
