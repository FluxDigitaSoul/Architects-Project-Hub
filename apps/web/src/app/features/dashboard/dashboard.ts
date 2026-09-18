import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { ProjectsStore } from '../../core/data/projects-store';
import { fmtRelative } from '../../core/data/format';
import { PROJECT_STATUS_LABEL } from '../../core/models';
import { Icon, type IconName } from '../../shared/ui/icon';
import { OutcomeBadge } from '../../shared/ui/outcome-badge';
import { PageHeader } from '../../shared/ui/page-header';
import { StatCard } from '../../shared/ui/stat-card';

const ACTIVITY_ICON: Record<string, IconName> = { PIN: 'map-pin', PUBLISH: 'file', APPROVAL: 'check', VISIT: 'hardhat', RAI: 'ruler' };

/** Dashboard dello studio (AFU FR-M1-04 "Dashboard dello studio"). */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, OutcomeBadge, PageHeader, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header [title]="greeting()" subtitle="Ecco cosa succede nelle tue commesse." />

    <div class="grid grid-4">
      <ui-stat label="Commesse attive" [value]="t().active" icon="folder" />
      <ui-stat label="In attesa di approvazione" [value]="t().pendingApprovals" icon="file" tone="info" hint="tavole pubblicate" />
      <ui-stat label="Osservazioni aperte" [value]="t().pinsOpen" icon="map-pin" tone="warning" hint="da rispondere" />
      <ui-stat label="Verbali da finalizzare" [value]="t().reportsDraft" icon="hardhat" tone="danger" />
    </div>

    <div class="grid cols" style="margin-top:16px">
      <section class="card">
        <div class="card-header"><h2>Da fare</h2><span class="badge badge-plain">{{ todos().length }}</span></div>
        <ul class="list">
          @for (item of todos(); track item.id) {
            <li><a [routerLink]="item.link">
              <span class="li-icon" [class]="'tone-' + item.tone"><ui-icon [name]="item.icon" [size]="15" /></span>
              <span class="li-text"><b>{{ item.title }}</b><span class="muted small">{{ item.sub }}</span></span>
              <ui-icon name="chevron-right" [size]="16" class="muted" />
            </a></li>
          } @empty { <li class="muted" style="padding:18px 20px">Tutto in ordine. Niente da fare.</li> }
        </ul>
      </section>

      <section class="card">
        <div class="card-header"><h2>Attività recente</h2></div>
        <ul class="list">
          @for (a of activities(); track a.id) {
            <li><a [routerLink]="['/commesse', a.projectId]">
              <span class="li-icon"><ui-icon [name]="iconOf(a.kind)" [size]="15" /></span>
              <span class="li-text"><span>{{ a.text }}</span><span class="muted small">{{ store.codeOf(a.projectId) }} · {{ rel(a.at) }}</span></span>
            </a></li>
          }
        </ul>
      </section>
    </div>

    <div class="row-between" style="margin:26px 0 12px"><h2>Commesse recenti</h2><a routerLink="/commesse" class="small" style="color:var(--color-primary);font-weight:500">Vedi tutte →</a></div>
    <div class="grid grid-3">
      @for (r of recent(); track r.p.id) {
        <a class="card pcard" [routerLink]="['/commesse', r.p.id]">
          <div class="row-between"><span class="eyebrow">{{ r.p.code }}</span><span class="badge badge-plain">{{ statusLabel[r.p.status] }}</span></div>
          <h3>{{ r.p.title }}</h3>
          <div class="muted small">{{ r.p.clientName }} · {{ r.p.municipality }}</div>
          <div class="pcard-foot">
            <ui-outcome [outcome]="r.s.raiOutcome" />
            <span class="muted small">{{ r.s.pinsOpen }} pin · {{ r.s.visits }} sopralluoghi</span>
          </div>
        </a>
      }
    </div>
  `,
  styles: `
    .cols { grid-template-columns: 1.1fr 1fr; }
    @media (max-width: 960px) { .cols { grid-template-columns: 1fr; } }
    .list { list-style: none; margin: 0; padding: 6px 0; }
    .list a { display: flex; align-items: center; gap: 12px; padding: 10px 20px; }
    .list a:hover { background: var(--surface-2); }
    .li-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); flex: none; }
    .tone-warning { background: var(--warning-soft); color: var(--warning); }
    .tone-danger { background: var(--danger-soft); color: var(--danger); }
    .tone-info { background: var(--info-soft); color: var(--info); }
    .li-text { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .li-text b { font-weight: 500; }
    .pcard { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; transition: box-shadow 0.15s, transform 0.15s; }
    .pcard:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .pcard h3 { font-size: 14.5px; line-height: 1.3; }
    .pcard-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  `,
})
export class Dashboard {
  protected readonly store = inject(ProjectsStore);
  private readonly auth = inject(Auth);
  protected readonly statusLabel = PROJECT_STATUS_LABEL;
  protected readonly rel = fmtRelative;
  protected readonly t = this.store.totals;

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const hello = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const first = this.auth.session()?.name.split(' ')[0] ?? '';
    return `${hello}${first ? ', ' + first : ''}`;
  });

  protected readonly todos = computed(() => {
    const items: { id: string; title: string; sub: string; icon: IconName; tone: string; link: unknown[] }[] = [];
    for (const d of this.store.drawings()) {
      if (d.pinsOpen > 0) items.push({ id: 'd' + d.id, title: `Rispondi a ${d.pinsOpen} osservazioni su ${d.code} v${d.version}`, sub: this.store.codeOf(d.projectId) + ' · ' + d.title, icon: 'map-pin', tone: 'warning', link: ['/commesse', d.projectId] });
    }
    for (const v of this.store.visits()) {
      if (v.status === 'REVIEW') items.push({ id: 'v' + v.id, title: `Revisiona la bozza del verbale n. ${v.number}`, sub: this.store.codeOf(v.projectId) + ' · bozza AI pronta', icon: 'hardhat', tone: 'danger', link: ['/commesse', v.projectId] });
      if (v.status === 'DRAFT') items.push({ id: 'v' + v.id, title: `Completa il sopralluogo n. ${v.number}`, sub: this.store.codeOf(v.projectId) + ' · in bozza', icon: 'clock', tone: 'info', link: ['/commesse', v.projectId] });
    }
    return items;
  });

  protected readonly activities = computed(() =>
    [...this.store.activities()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
  );

  protected readonly recent = computed(() =>
    [...this.store.projects()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3)
      .map((p) => ({ p, s: this.store.stats(p.id)() })),
  );

  protected iconOf(kind: string): IconName {
    return ACTIVITY_ICON[kind] ?? 'info';
  }
}
