import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ratioAsFraction, type RatioCheck, type RoomInput, type RoomResult } from '@aph/rai-engine';
import { fmtNum, fmtSigned } from '../../core/data/format';
import { Icon } from '../../shared/ui/icon';
import { OutcomeBadge } from '../../shared/ui/outcome-badge';

const STATUS_LABEL = { PASSED: 'Verificata', FAILED: 'Non verificata', COVERED_BY_DEROGATION: 'In deroga' } as const;

/** Riquadro di una verifica di rapporto (illuminante o aerante). */
@Component({
  selector: 'app-rai-ratio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ratio" [class]="'ratio ' + c().status">
      <div class="row-between"><b>{{ title() }}</b><span class="st" [class]="'st ' + c().status">{{ st[c().status] }}</span></div>
      <div class="big mono">{{ n(c().total) }} <span class="unit">mq</span> <span class="delta" [class.neg]="c().delta.startsWith('-')">{{ signed(c().delta) }}</span></div>
      <div class="muted small mono">minimo {{ n(c().minimum) }} mq · rapporto {{ n(c().ratio, 3) }} ({{ frac(c().ratio) }}) · richiesto {{ frac(c().requiredRatio) }}</div>
    </div>
  `,
  styles: `
    .ratio { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 4px; border-left-width: 4px; }
    .ratio.PASSED { border-left-color: var(--success); } .ratio.FAILED { border-left-color: var(--danger); } .ratio.COVERED_BY_DEROGATION { border-left-color: var(--warning); }
    .big { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .unit { font-size: 13px; font-weight: 400; color: var(--muted); }
    .delta { font-size: 13px; font-weight: 600; color: var(--success); margin-left: 6px; }
    .delta.neg { color: var(--danger); }
    .st { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .st.PASSED { background: var(--success-soft); color: var(--success); } .st.FAILED { background: var(--danger-soft); color: var(--danger); } .st.COVERED_BY_DEROGATION { background: var(--warning-soft); color: var(--warning); }
  `,
})
export class RaiRatio {
  readonly c = input.required<RatioCheck>();
  readonly title = input.required<string>();
  protected readonly st = STATUS_LABEL;
  protected readonly n = fmtNum;
  protected readonly signed = fmtSigned;
  protected readonly frac = ratioAsFraction;
}

/** Pannello dei risultati per vano: valori, minimi, margine, spiegazioni (AFU FR-M3-08/09/10). */
@Component({
  selector: 'app-rai-results',
  imports: [Icon, OutcomeBadge, RaiRatio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header"><h3>Esito · {{ room().name }}</h3></div>
      <div class="card-body stack" style="gap:14px">
        <ui-outcome [outcome]="result().outcome" />

        @if (result().issues.length) {
          <ul class="issues">@for (i of result().issues; track i.path) { <li><ui-icon name="alert" [size]="14" /> {{ i.message }}</li> }</ul>
        }

        @if (result().illuminating; as c) { <app-rai-ratio [c]="c" title="Illuminante" /> }
        @if (result().ventilating; as c) { <app-rai-ratio [c]="c" title="Aerante" /> }

        @if (result().height; as h) {
          <div class="kv"><span class="k">Altezza</span><span class="v mono">{{ n(h.value) }} m <span class="muted">/ min {{ n(h.minimum) }}</span></span><span class="st" [class]="'st ' + h.status">{{ st[h.status] }}</span></div>
        }
        @if (result().minimumArea; as m) {
          <div class="kv"><span class="k">Superficie min.</span><span class="v mono">{{ n(m.value) }} mq <span class="muted">/ min {{ n(m.minimum) }}</span></span><span class="st" [class]="'st ' + m.status">{{ st[m.status] }}</span></div>
        }
        @if (result().ventilation; as v) {
          <div class="kv"><span class="k">Ventilazione</span><span class="v">{{ v.via === 'OPENING' ? 'Apertura' : v.via === 'MECHANICAL' ? 'Meccanica' : 'Assente' }}</span><span class="st" [class]="'st ' + v.status">{{ st[v.status] }}</span></div>
        }
        @if (result().outcome === 'NOT_REQUIRED') { <p class="muted small">Questa destinazione non richiede la verifica del rapporto aeroilluminante.</p> }

        @if (result().openings.length) {
          <div class="divider"></div>
          <table class="mini"><thead><tr><th>Apertura</th><th class="num">Si</th><th class="num">Sa</th></tr></thead>
            <tbody>@for (o of result().openings; track o.id) { <tr><td>{{ o.label }}</td><td class="num mono">{{ n(o.illuminatingArea) }}</td><td class="num mono">{{ n(o.ventilatingArea) }}</td></tr> }</tbody></table>
        }

        @if (result().notes.length) {
          <div class="divider"></div>
          <ul class="notes">@for (note of result().notes; track $index) { <li><ui-icon name="info" [size]="14" /> {{ note.message }}</li> }</ul>
        }
        <div class="muted" style="font-size:11.5px">Profilo {{ result().profile.id }} v{{ result().profile.version }} · confronto sui valori esatti (BR-22)</div>
      </div>
    </div>
  `,
  styles: `
    .st { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .st.PASSED { background: var(--success-soft); color: var(--success); } .st.FAILED { background: var(--danger-soft); color: var(--danger); } .st.COVERED_BY_DEROGATION { background: var(--warning-soft); color: var(--warning); }
    .kv { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 13px; }
    .kv .k { color: var(--muted); }
    .mini { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .mini th { text-align: left; color: var(--muted); font-weight: 500; padding: 2px 0; } .mini td { padding: 3px 0; }
    .num { text-align: right; }
    .issues, .notes { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 12.5px; }
    .issues li { display: flex; gap: 6px; color: var(--danger); } .notes li { display: flex; gap: 6px; color: var(--ink-2); }
  `,
})
export class RaiResults {
  readonly result = input.required<RoomResult>();
  readonly room = input.required<RoomInput>();
  protected readonly st = STATUS_LABEL;
  protected readonly n = fmtNum;
}
