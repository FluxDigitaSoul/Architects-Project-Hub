import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FieldStore } from '../../core/data/field-store';
import { ProjectsStore } from '../../core/data/projects-store';
import { fmtDate, fmtRelative } from '../../core/data/format';
import { VISIT_STATUS_LABEL } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

/** "I miei cantieri": punto di partenza dal telefono (AFU FR-M4-02). */
@Component({
  selector: 'app-field-list',
  imports: [RouterLink, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header title="Cantiere" subtitle="Sopralluoghi con foto e note vocali: il verbale è pronto prima di andare via." />

    @if (drafts().length) {
      <h3 class="sec">Da completare</h3>
      <div class="stack">
        @for (v of drafts(); track v.id) {
          <a class="card item" [routerLink]="['/cantiere', v.id]">
            <span class="ic warn"><ui-icon name="clock" [size]="18" /></span>
            <span class="tx"><b>Sopralluogo n. {{ v.number }} · {{ store.codeOf(v.projectId) }}</b><span class="muted small">{{ label[v.status] }} · {{ rel(v.date) }}</span></span>
            <ui-icon name="chevron-right" [size]="18" class="muted" />
          </a>
        }
      </div>
    }

    <h3 class="sec">I miei cantieri</h3>
    <div class="stack">
      @for (r of sites(); track r.p.id) {
        <div class="card site">
          <div class="site-head">
            <div>
              <div class="eyebrow">{{ r.p.code }}</div>
              <b>{{ r.p.title }}</b>
              <div class="muted small">{{ r.p.address }}</div>
            </div>
          </div>
          <div class="site-foot">
            <span class="muted small">{{ r.count }} sopralluoghi@if (r.last) { · ultimo {{ date(r.last) }} }</span>
            <button class="btn btn-primary" (click)="start(r.p.id)"><ui-icon name="plus" [size]="16" /> Nuovo sopralluogo</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; max-width: 720px; }
    .sec { margin: 18px 0 10px; }
    .item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .ic { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; flex: none; }
    .ic.warn { background: var(--warning-soft); color: var(--warning); }
    .tx { flex: 1; display: grid; gap: 2px; }
    .site { padding: 16px; display: grid; gap: 12px; }
    .site-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .site-foot .btn { height: 44px; }
  `,
})
export class FieldList {
  protected readonly store = inject(ProjectsStore);
  private readonly field = inject(FieldStore);
  private readonly router = inject(Router);
  protected readonly label = VISIT_STATUS_LABEL;
  protected readonly rel = fmtRelative;
  protected readonly date = fmtDate;

  protected readonly drafts = computed(() => this.store.visits().filter((v) => v.status === 'DRAFT' || v.status === 'REVIEW'));
  protected readonly sites = computed(() =>
    this.store.active().map((p) => {
      const visits = this.store.visits().filter((v) => v.projectId === p.id);
      const last = visits.map((v) => v.date).sort().at(-1) ?? null;
      return { p, count: visits.length, last };
    }),
  );

  protected start(projectId: string): void {
    const id = this.field.start(projectId);
    void this.router.navigate(['/cantiere', id]);
  }
}
