import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDecimalIt } from '@aph/rai-engine';
import { type ActivityKind, LINK_STATUS_LABEL, type ProjectDashboard } from '../../core/api/projects-api';
import { fmtDate, fmtRelative } from '../../core/data/format';
import { Icon, type IconName } from '../../shared/ui/icon';

const ACTIVITY_ICON: Record<ActivityKind, IconName> = {
  PIN: 'map-pin', PUBLISH: 'upload', APPROVAL: 'check', VISIT: 'hardhat', DOCUMENT: 'file',
};

/** Widget della dashboard di commessa (AFU FR-M1-04, AC-FR-M1-04-1). */
@Component({
  selector: 'app-project-overview',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <div class="grid grid-3">
      <button class="card w" type="button" (click)="goto.emit('tavole')">
        <div class="eyebrow">Approvazioni</div>
        <div class="big mono">{{ d.approvals.byStatus['PUBLISHED'] ?? 0 }}</div>
        <div class="muted small">in attesa del committente · {{ d.approvals.byStatus['APPROVED'] ?? 0 }} approvate · {{ d.approvals.byStatus['DRAFT'] ?? 0 }} in bozza</div>
        @if (d.approvals.awaitingOverDays) {
          <div class="warn small">{{ d.approvals.awaitingOverDays }} in attesa da oltre {{ d.approvals.overdueThresholdDays }} giorni</div>
        }
      </button>
      <button class="card w" type="button" (click)="goto.emit('tavole')">
        <div class="eyebrow">Osservazioni</div>
        <div class="big mono" [class.warn]="d.pins.awaitingStudio > 0">{{ d.pins.awaitingStudio }}</div>
        <div class="muted small">da rispondere · {{ d.pins.awaitingClient }} in attesa del committente · {{ d.pins.resolved }} risolte</div>
        @if (d.pins.awaitingStudio) { <div class="muted small">età media {{ age(d.pins.averageOpenAgeDays) }}</div> }
      </button>
      <a class="card w" [routerLink]="['/commesse', d.project.id, 'rai']">
        <div class="row-between"><span class="eyebrow">Conformità R.A.I.</span><ui-icon name="arrow-right" [size]="15" class="muted" /></div>
        @if (d.rai.rooms) {
          <div class="rai">
            <span class="badge badge-success">{{ d.rai.counts['COMPLIANT'] ?? 0 }} conformi</span>
            @if (d.rai.counts['NON_COMPLIANT']) { <span class="badge badge-danger">{{ d.rai.counts['NON_COMPLIANT'] }} non conformi</span> }
            @if (d.rai.counts['SUBJECT_TO_ATTESTATION']) { <span class="badge badge-warning">{{ d.rai.counts['SUBJECT_TO_ATTESTATION'] }} da asseverare</span> }
            @if (incomplete()) { <span class="badge">{{ incomplete() }} incompleti</span> }
          </div>
          <div class="muted small">@if (deficit()) { Deficit totale {{ deficit() }} mq · } {{ d.rai.profile }}</div>
        } @else {
          <div class="muted small" style="margin-top:8px">Nessun vano inserito. Apri il modulo per verificare i rapporti aeroilluminanti.</div>
        }
      </a>
      <button class="card w" type="button" (click)="goto.emit('sopralluoghi')">
        <div class="eyebrow">Cantiere</div>
        <div class="big mono">{{ d.field.visits }}</div>
        <div class="muted small">sopralluoghi @if (d.field.lastVisitAt) { · ultimo il {{ date(d.field.lastVisitAt) }} }</div>
        <div class="small" [class.warn]="d.field.drafts > 0">{{ d.field.drafts }} verbali in bozza · {{ d.field.openIssues }} difformità aperte</div>
      </button>
      <div class="card w">
        <div class="eyebrow">Richieste di modifica</div>
        <div class="big mono">{{ d.changeRequests.open }}</div>
        <div class="muted small">aperte · {{ d.changeRequests.extraScope }} accettate extra-incarico</div>
      </div>
      <button class="card w" type="button" (click)="goto.emit('committenti')">
        <div class="eyebrow">Committenti</div>
        <ul class="clients">
          @for (c of d.clients; track c.id) {
            <li>
              <span><b>{{ c.name }}</b>@if (c.isSigner) { <span class="muted"> · firmatario</span> }</span>
              <span class="muted small">{{ linkLabel[c.linkStatus] }} · {{ c.lastAccessAt ? 'ultimo accesso ' + rel(c.lastAccessAt) : 'mai entrato' }}</span>
            </li>
          } @empty { <li class="muted small">Nessun committente.</li> }
        </ul>
      </button>
    </div>

    <section class="card act">
      <div class="card-header"><h2>Attività recente</h2></div>
      <ul class="list">
        @for (a of d.activity; track a.kind + a.ref + a.at) {
          <li><span class="li-icon"><ui-icon [name]="icon(a.kind)" [size]="15" /></span>
            <span class="li-text"><span>{{ a.text }}</span><span class="muted small">{{ rel(a.at) }}</span></span></li>
        } @empty { <li class="muted empty">Ancora nessuna attività: pubblica la prima tavola o avvia un sopralluogo.</li> }
      </ul>
    </section>
  `,
  styles: `
    .w { padding: 16px 18px; display: flex; flex-direction: column; gap: 3px; text-align: left; font: inherit; color: inherit; cursor: pointer; }
    div.w { cursor: default; }
    .w:hover { box-shadow: var(--shadow-md); }
    div.w:hover { box-shadow: none; }
    .big { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0; }
    .warn { color: var(--warning); }
    .rai { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 6px; }
    .clients { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
    .clients li { display: flex; flex-direction: column; line-height: 1.35; }
    .act { margin-top: 16px; }
    .list { list-style: none; margin: 0; padding: 6px 0; }
    .list li { display: flex; align-items: center; gap: 12px; padding: 9px 20px; }
    .empty { padding: 16px 20px; }
    .li-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); flex: none; }
    .li-text { display: flex; flex-direction: column; line-height: 1.35; }
  `,
})
export class ProjectOverview {
  readonly data = input.required<ProjectDashboard>();
  /** Apre una scheda della commessa. */
  readonly goto = output<string>();

  protected readonly rel = fmtRelative;
  protected readonly date = fmtDate;
  protected readonly linkLabel = LINK_STATUS_LABEL;

  protected readonly incomplete = computed(() => {
    const c = this.data().rai.counts;
    return (c['INCOMPLETE'] ?? 0) + (c['INVALID_INPUT'] ?? 0);
  });
  protected readonly deficit = computed(() => {
    const v = this.data().rai.deficitSqm;
    return Number(v) > 0 ? formatDecimalIt(v, 2) : null;
  });

  protected icon(kind: ActivityKind): IconName {
    return ACTIVITY_ICON[kind] ?? 'info';
  }

  protected age(days: number): string {
    return days < 1 ? 'meno di un giorno' : `${formatDecimalIt(String(days), 1)} giorni`;
  }
}
