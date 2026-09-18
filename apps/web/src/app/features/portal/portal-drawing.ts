import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { ReviewWorkspace } from '../review/review-workspace';
import { PortalContext } from './portal-context';

/** Revisione della tavola lato committente, con approvazione se firmatario (BR-10). */
@Component({
  selector: 'app-portal-drawing',
  imports: [RouterLink, Icon, EmptyState, ReviewWorkspace],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (drawing(); as d) {
      <a routerLink="../.." class="back muted small"><ui-icon name="chevron-left" [size]="14" /> Tutte le tavole</a>
      <div class="head">
        <div class="eyebrow">{{ d.code }} · versione {{ d.version }}</div>
        <h1>{{ d.title }}</h1>
      </div>
      <app-review-workspace [drawing]="d" actor="CLIENT" [author]="contact()?.name ?? ''" [email]="contact()?.email ?? ''" [canApprove]="contact()?.isSigner ?? false" />
    } @else {
      <div class="card"><ui-empty icon="file" title="Tavola non disponibile" /></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { margin-bottom: 16px; display: grid; gap: 2px; }
  `,
})
export class PortalDrawing {
  readonly drawingId = input.required<string>();
  private readonly portal = inject(PortalContext);
  protected readonly contact = this.portal.contact;
  /** Solo tavole visibili al committente: un id di una bozza o di un'altra commessa non si apre (BR-25). */
  protected readonly drawing = computed(() => this.portal.drawings().find((d) => d.id === this.drawingId()) ?? null);
}
