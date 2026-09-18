import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Intestazione di pagina: occhiello, titolo, sottotitolo e azioni (content projection). */
@Component({
  selector: 'ui-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ph">
      <div class="ph-text">
        @if (eyebrow()) { <div class="eyebrow">{{ eyebrow() }}</div> }
        <h1>{{ title() }}</h1>
        @if (subtitle()) { <p class="muted">{{ subtitle() }}</p> }
      </div>
      <div class="ph-actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .ph-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .ph-actions { display: flex; gap: 8px; align-items: center; }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly eyebrow = input<string>();
}
