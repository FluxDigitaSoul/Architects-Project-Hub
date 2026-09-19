import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import {
  INTERVENTION_LABEL,
  PERMIT_LABEL,
  PROJECT_STATUS_LABEL,
  ProjectsApi,
  TRANSITIONS,
  type TransitionAction,
} from '../../core/api/projects-api';
import { TenantContext } from '../../core/tenant/tenant-context';
import { Confirmer } from '../../shared/ui/confirm';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { ProjectChangeRequests } from './project-change-requests';
import { ProjectContacts } from './project-contacts';
import { ProjectData } from './project-data';
import { ProjectDocuments } from './project-documents';
import { ProjectDrawings } from './project-drawings';
import { ProjectOverview } from './project-overview';
import { ProjectTeam } from './project-team';
import { ProjectVisits } from './project-visits';

type Tab = 'panoramica' | 'tavole' | 'sopralluoghi' | 'documenti' | 'richieste' | 'committenti' | 'team' | 'dati';
const TABS: { key: Tab; label: string }[] = [
  { key: 'panoramica', label: 'Panoramica' },
  { key: 'tavole', label: 'Tavole' },
  { key: 'sopralluoghi', label: 'Sopralluoghi' },
  { key: 'documenti', label: 'Documenti' },
  { key: 'richieste', label: 'Richieste di modifica' },
  { key: 'committenti', label: 'Committenti' },
  { key: 'team', label: 'Team e imprese' },
  { key: 'dati', label: 'Dati' },
];

/** Fascicolo della commessa (AFU FR-M1-04): dashboard, committenti, team, dati e stato. */
@Component({
  selector: 'app-project-detail',
  imports: [RouterLink, EmptyState, Icon, ProjectChangeRequests, ProjectContacts, ProjectData, ProjectDocuments, ProjectDrawings, ProjectOverview, ProjectTeam, ProjectVisits],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <a routerLink="/commesse" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> Commesse</a>
    @if (detail.error()) {
      <div class="card"><ui-empty icon="folder" [title]="notFound() ? 'Commessa non trovata' : 'Impossibile aprire la commessa'" [text]="errorText()">
        @if (!notFound()) { <button class="btn btn-outline btn-sm" (click)="reload()">Riprova</button> }
      </ui-empty></div>
    } @else if (detail.value(); as p) {
      <div class="head">
        <div class="head-text">
          <div class="row" style="gap:8px">
            <span class="eyebrow">{{ p.code }}</span>
            <span class="badge" [class.badge-success]="p.status === 'ACTIVE'" [class.badge-warning]="p.status === 'SUSPENDED'" [class.badge-plain]="p.status === 'ARCHIVED'">{{ statusLabel[p.status] }}</span>
            @if (p.permitType) { <span class="badge badge-plain">{{ permitLabel[p.permitType] }}</span> }
          </div>
          <h1>{{ p.title }}</h1>
          <div class="muted meta">
            <span><ui-icon name="map-pin" [size]="14" /> {{ p.address }}</span>
            <span><ui-icon name="users" [size]="14" /> {{ clients() }}</span>
            <span><ui-icon name="building" [size]="14" /> {{ interventionLabel[p.interventionType] }}</span>
          </div>
        </div>
        <div class="row actions">
          <a class="btn btn-outline" [routerLink]="['/commesse', p.id, 'rai']"><ui-icon name="ruler" [size]="15" /> R.A.I.</a>
          @if (tenant.canManage()) {
            @for (t of transitions(); track t.action) {
              <button class="btn btn-ghost" (click)="transition(t.action, t.label, t.confirm)">{{ t.label }}</button>
            }
          }
        </div>
      </div>
      @if (p.status !== 'ACTIVE') {
        <div class="notice small"><ui-icon name="info" [size]="15" />
          @switch (p.status) {
            @case ('SUSPENDED') { Commessa sospesa: consultabile, ma non si pubblicano tavole né si creano sopralluoghi. }
            @case ('CLOSED') { Commessa chiusa: i committenti mantengono l'accesso per il periodo di tolleranza. }
            @case ('ARCHIVED') { Commessa archiviata: sola lettura. }
          }
        </div>
      }

      <nav class="tabs" role="tablist">
        @for (t of tabs; track t.key) {
          <button role="tab" [attr.aria-selected]="tab() === t.key" [class.is-active]="tab() === t.key" (click)="setTab(t.key)">
            {{ t.label }} @if (t.key === 'committenti') { <span class="cnt">{{ p.contacts.length }}</span> }
          </button>
        }
      </nav>

      @switch (tab()) {
        @case ('panoramica') {
          @if (dashboard.value(); as d) { <app-project-overview [data]="d" (goto)="goto($event)" /> }
          @else if (dashboard.error()) { <div class="card error-box">{{ dashboardError() }} <button class="btn btn-outline btn-sm" (click)="dashboard.reload()">Riprova</button></div> }
          @else { <div class="card skeleton"></div> }
        }
        @case ('tavole') {
          <app-project-drawings [projectId]="p.id" [canManage]="tenant.canManage() && p.status === 'ACTIVE'" (changed)="dashboard.reload()" />
        }
        @case ('sopralluoghi') {
          <app-project-visits [projectId]="p.id" [canStart]="p.status === 'ACTIVE'" />
        }
        @case ('documenti') {
          <app-project-documents [projectId]="p.id" [canManage]="tenant.canManage()" (changed)="dashboard.reload()" />
        }
        @case ('richieste') {
          <app-project-change-requests [projectId]="p.id" [canManage]="canEdit()" (changed)="dashboard.reload()" />
        }
        @case ('committenti') {
          <app-project-contacts [projectId]="p.id" [contacts]="p.contacts" [canManage]="canEdit()" (changed)="reload()" />
        }
        @case ('team') {
          <app-project-team [projectId]="p.id" [team]="p.team" [contractors]="p.contractors" [canManage]="canEdit()" (changed)="reload()" />
        }
        @case ('dati') {
          <app-project-data [project]="p" [canManage]="canEdit()" (changed)="reload()" />
        }
      }
    } @else {
      <div class="card skeleton"></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
    .head h1 { margin-top: 4px; }
    .meta { display: flex; gap: 14px; margin-top: 4px; flex-wrap: wrap; }
    .meta span { display: inline-flex; gap: 5px; align-items: center; }
    .actions { gap: 6px; flex-wrap: wrap; }
    .notice { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--warning-soft); color: var(--ink-2); margin-bottom: 14px; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 18px; overflow-x: auto; }
    .tabs button { background: none; border: 0; padding: 10px 12px; font: inherit; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; white-space: nowrap; }
    .tabs button.is-active { color: var(--ink); border-color: var(--color-primary); }
    .cnt { font-size: 11px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; }
    .skeleton { height: 220px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%); }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  `,
})
export class ProjectDetail {
  readonly id = input.required<string>();
  /** Scheda aperta, da `?scheda=` (il link si può condividere e il tasto Indietro funziona). */
  readonly scheda = input<string>();

  private readonly api = inject(ProjectsApi);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly tenant = inject(TenantContext);
  protected readonly tabs = TABS;
  protected readonly statusLabel = PROJECT_STATUS_LABEL;
  protected readonly permitLabel = PERMIT_LABEL;
  protected readonly interventionLabel = INTERVENTION_LABEL;

  protected readonly detail = resource({ params: () => this.id(), loader: ({ params }) => this.api.detail(params) });
  protected readonly dashboard = resource({ params: () => this.id(), loader: ({ params }) => this.api.dashboard(params) });

  protected readonly tab = linkedSignal<Tab>(() => {
    const s = this.scheda();
    return TABS.some((t) => t.key === s) ? (s as Tab) : 'panoramica';
  });

  protected readonly notFound = computed(() => toApiError(this.detail.error()).code === 'NOT_FOUND');
  protected readonly errorText = computed(() =>
    this.notFound() ? 'Non esiste o non hai i permessi per vederla.' : toApiError(this.detail.error()).userMessage,
  );
  protected readonly dashboardError = computed(() => toApiError(this.dashboard.error()).userMessage);
  protected readonly clients = computed(() => this.detail.value()?.contacts.map((c) => c.displayName).join(', ') || 'Nessun committente');
  protected readonly transitions = computed(() => {
    const p = this.detail.value();
    return p ? TRANSITIONS[p.status] : [];
  });
  /** Le commesse archiviate sono in sola lettura. */
  protected readonly canEdit = computed(() => this.tenant.canManage() && this.detail.value()?.status !== 'ARCHIVED');

  protected setTab(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { scheda: t === 'panoramica' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected goto(target: string): void {
    if (TABS.some((t) => t.key === target)) this.setTab(target as Tab);
  }

  protected reload(): void {
    this.detail.reload();
    this.dashboard.reload();
  }

  protected async transition(action: TransitionAction, label: string, text: string): Promise<void> {
    const result = await this.confirmer.ask({
      title: `${label} la commessa?`,
      text,
      confirmLabel: label,
      tone: action === 'ARCHIVE' || action === 'CLOSE' ? 'danger' : 'primary',
      checkbox: action === 'CLOSE' ? { label: 'Revoca subito i link dei committenti' } : undefined,
    });
    if (!result) return;
    try {
      await this.api.transition(this.id(), action, result.checked);
      this.toaster.show('Stato della commessa aggiornato');
      this.reload();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }
}
