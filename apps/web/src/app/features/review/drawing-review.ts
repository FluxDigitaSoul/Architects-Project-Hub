import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { ProjectsStore } from '../../core/data/projects-store';
import { DRAWING_STATUS_LABEL } from '../../core/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { ReviewWorkspace } from './review-workspace';

/** Revisione di una tavola lato studio (AFU P-01). */
@Component({
  selector: 'app-drawing-review',
  imports: [RouterLink, Icon, EmptyState, ReviewWorkspace],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (drawing(); as d) {
      <a [routerLink]="['/commesse', id()]" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> {{ project()?.code }} · {{ project()?.title }}</a>
      <div class="head">
        <div>
          <div class="row" style="gap:8px"><span class="eyebrow">{{ d.code }} · v{{ d.version }}</span>
            <span class="badge" [class.badge-success]="d.status === 'APPROVED'" [class.badge-info]="d.status === 'PUBLISHED'">{{ label[d.status] }}</span></div>
          <h1 style="margin-top:4px">{{ d.title }}</h1>
        </div>
        <div class="row">
          <button class="btn btn-outline"><ui-icon name="upload" [size]="15" /> Nuova versione</button>
        </div>
      </div>
      <app-review-workspace [drawing]="d" actor="STUDIO" [author]="author()" />
    } @else {
      <div class="card"><ui-empty icon="file" title="Tavola non trovata" /></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  `,
})
export class DrawingReview {
  readonly id = input.required<string>();
  readonly drawingId = input.required<string>();
  private readonly store = inject(ProjectsStore);
  private readonly auth = inject(Auth);
  protected readonly label = DRAWING_STATUS_LABEL;
  protected readonly project = computed(() => this.store.byId(this.id())());
  protected readonly drawing = computed(() => this.store.drawingById(this.drawingId())());
  protected readonly author = computed(() => this.auth.session()?.name ?? 'Studio');
}
