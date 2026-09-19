import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { type ActivityKind, PROJECT_STATUS_LABEL, ProjectsApi, type StudioDashboard } from '../../core/api/projects-api';
import { Auth } from '../../core/auth/auth';
import { fmtRelative } from '../../core/data/format';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Icon, type IconName } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { StatCard } from '../../shared/ui/stat-card';

const ACTIVITY_ICON: Record<ActivityKind, IconName> = {
  PIN: 'map-pin', PUBLISH: 'upload', APPROVAL: 'check', VISIT: 'hardhat', DOCUMENT: 'file',
};

interface TodoView {
  key: string;
  title: string;
  sub: string;
  icon: IconName;
  tone: 'warning' | 'danger' | 'info';
  link: unknown[];
}

/** Dashboard dello studio (AFU FR-M1-04): indicatori aggregati, cose da fare, attività recente. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, PageHeader, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <ui-page-header [title]="greeting()" subtitle="Ecco cosa succede nelle tue commesse." />

    @if (data.error()) {
      <div class="card error-box">
        <p>{{ errorText() }}</p>
        <button class="btn btn-outline btn-sm" (click)="reload()"><ui-icon name="refresh" [size]="14" /> Riprova</button>
      </div>
    } @else if (data.value(); as d) {
      <div class="grid grid-4">
        <ui-stat label="Commesse attive" [value]="d.totals.activeProjects" icon="folder" />
        <ui-stat label="In attesa di approvazione" [value]="d.totals.awaitingApproval" icon="file" tone="info"
          [hint]="d.totals.overdueApprovals ? d.totals.overdueApprovals + ' da oltre ' + d.overdueThresholdDays + ' giorni' : 'tavole pubblicate'" />
        <ui-stat label="Osservazioni da rispondere" [value]="d.totals.pinsAwaitingStudio" icon="map-pin" tone="warning" hint="in attesa dello studio" />
        <ui-stat label="Verbali da finalizzare" [value]="d.totals.reportsDraft" icon="hardhat" tone="danger"
          [hint]="d.totals.openIssues ? d.totals.openIssues + ' difformità aperte' : ''" />
      </div>

      @if (isNewStudio()) {
        <section class="card start">
          <h2>Per iniziare</h2>
          <ol>
            @if (tenant.canManage()) {
              <li><a routerLink="/commesse" [queryParams]="{ nuova: 1 }"><ui-icon name="plus" [size]="15" /> Crea la prima commessa e invita il committente</a></li>
            }
            <li><a routerLink="/impostazioni"><ui-icon name="shield" [size]="15" /> Completa il profilo professionale: serve per firmare relazioni e verbali</a></li>
            @if (tenant.isOwner()) {
              <li><a routerLink="/impostazioni" [queryParams]="{ sezione: 'marchio' }"><ui-icon name="palette" [size]="15" /> Carica il logo: comparirà su portale, email e PDF</a></li>
              <li><a routerLink="/impostazioni" [queryParams]="{ sezione: 'team' }"><ui-icon name="users" [size]="15" /> Invita i colleghi dello studio</a></li>
            }
          </ol>
        </section>
      }

      <div class="grid cols" style="margin-top:16px">
        <section class="card">
          <div class="card-header"><h2>Da fare</h2><span class="badge badge-plain">{{ todos().length }}</span></div>
          <ul class="list">
            @for (item of todos(); track item.key) {
              <li><a [routerLink]="item.link">
                <span [class]="'li-icon tone-' + item.tone"><ui-icon [name]="item.icon" [size]="15" /></span>
                <span class="li-text"><b>{{ item.title }}</b><span class="muted small">{{ item.sub }}</span></span>
                <ui-icon name="chevron-right" [size]="16" class="muted" />
              </a></li>
            } @empty { <li class="muted empty">Tutto in ordine. Niente da fare.</li> }
          </ul>
        </section>

        <section class="card">
          <div class="card-header"><h2>Attività recente</h2></div>
          <ul class="list">
            @for (a of d.activity; track a.kind + a.ref + a.at) {
              <li><a [routerLink]="['/commesse', a.projectId]">
                <span class="li-icon"><ui-icon [name]="icon(a.kind)" [size]="15" /></span>
                <span class="li-text"><span>{{ a.text }}</span><span class="muted small">{{ a.projectCode }} · {{ rel(a.at) }}</span></span>
              </a></li>
            } @empty { <li class="muted empty">Nessuna attività ancora.</li> }
          </ul>
        </section>
      </div>

      @if (recentItems().length) {
        <div class="row-between" style="margin:26px 0 12px"><h2>Commesse recenti</h2><a routerLink="/commesse" class="small link">Vedi tutte →</a></div>
        <div class="grid grid-3">
          @for (p of recentItems(); track p.id) {
            <a class="card pcard" [routerLink]="['/commesse', p.id]">
              <div class="row-between"><span class="eyebrow">{{ p.code }}</span><span class="badge badge-plain">{{ statusLabel[p.status] }}</span></div>
              <h3>{{ p.title }}</h3>
              <div class="muted small">{{ p.clientName ?? '—' }} · {{ p.municipality }}</div>
              <div class="pcard-foot muted small">{{ p.pinsOpen }} osservazioni aperte · {{ p.drawingsAwaitingApproval }} in approvazione</div>
            </a>
          }
        </div>
      }
    } @else {
      <div class="grid grid-4">@for (i of [1, 2, 3, 4]; track i) { <div class="card skeleton"></div> }</div>
    }
  `,
  styles: `
    .cols { grid-template-columns: 1.1fr 1fr; }
    @media (max-width: 960px) { .cols { grid-template-columns: 1fr; } }
    .list { list-style: none; margin: 0; padding: 6px 0; }
    .list a { display: flex; align-items: center; gap: 12px; padding: 10px 20px; }
    .list a:hover { background: var(--surface-2); }
    .empty { padding: 18px 20px; }
    .li-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); flex: none; }
    .tone-warning { background: var(--warning-soft); color: var(--warning); }
    .tone-danger { background: var(--danger-soft); color: var(--danger); }
    .tone-info { background: var(--info-soft); color: var(--info); }
    .li-text { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .li-text b { font-weight: 500; }
    .link { color: var(--color-primary); font-weight: 500; }
    .pcard { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; transition: box-shadow 0.15s, transform 0.15s; }
    .pcard:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .pcard h3 { font-size: 14.5px; line-height: 1.3; }
    .pcard-foot { margin-top: 8px; }
    .start { margin-top: 16px; padding: 18px 20px; }
    .start ol { margin: 10px 0 0; padding-left: 18px; display: grid; gap: 8px; }
    .start a { display: inline-flex; gap: 8px; align-items: center; color: var(--color-primary); font-weight: 500; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    .skeleton { height: 96px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%); }
  `,
})
export class Dashboard {
  private readonly api = inject(ProjectsApi);
  private readonly auth = inject(Auth);
  protected readonly tenant = inject(TenantContext);
  protected readonly statusLabel = PROJECT_STATUS_LABEL;
  protected readonly rel = fmtRelative;

  protected readonly data = resource({ loader: () => this.api.studioDashboard() });
  private readonly recent = resource({ loader: () => this.api.list({ status: 'ACTIVE', pageSize: 3 }) });

  protected readonly recentItems = computed(() => (this.recent.hasValue() ? this.recent.value().items : []));
  protected readonly errorText = computed(() => toApiError(this.data.error()).userMessage);

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const hello = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const first = this.auth.session()?.name.split(' ')[0] ?? '';
    return `${hello}${first ? ', ' + first : ''}`;
  });

  protected readonly isNewStudio = computed(() => {
    const d = this.data.value();
    return !!d && d.totals.activeProjects === 0 && d.activity.length === 0;
  });

  protected readonly todos = computed<TodoView[]>(() => (this.data.value()?.todo ?? []).map((t) => this.toTodo(t)));

  protected icon(kind: ActivityKind): IconName {
    return ACTIVITY_ICON[kind] ?? 'info';
  }

  protected reload(): void {
    this.data.reload();
    this.recent.reload();
  }

  private toTodo(t: StudioDashboard['todo'][number]): TodoView {
    const key = `${t.kind}-${t.refId}`;
    switch (t.kind) {
      case 'PINS':
        return {
          key, icon: 'map-pin', tone: 'warning',
          title: t.count === 1 ? `Rispondi a 1 osservazione su ${t.label}` : `Rispondi a ${t.count} osservazioni su ${t.label}`,
          sub: `${t.projectCode} · la prima è di ${fmtRelative(t.since)}`,
          link: ['/commesse', t.projectId, 'tavole', t.refId],
        };
      case 'VISIT':
        return {
          key, icon: 'hardhat', tone: 'danger', title: `Completa e finalizza il ${t.label.toLowerCase()}`,
          sub: `${t.projectCode} · iniziato ${fmtRelative(t.since)}`,
          link: ['/commesse', t.projectId, 'sopralluoghi', t.refId],
        };
      case 'APPROVAL':
        return {
          key, icon: 'clock', tone: 'info', title: `Approvazione in attesa: ${t.label}`,
          sub: `${t.projectCode} · pubblicata ${fmtRelative(t.since)}, sollecita il committente`,
          link: ['/commesse', t.projectId, 'tavole', t.refId],
        };
    }
  }
}
