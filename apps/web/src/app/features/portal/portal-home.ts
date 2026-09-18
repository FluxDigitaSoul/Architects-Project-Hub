import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fmtRelative } from '../../core/data/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { PortalContext } from './portal-context';

/** Home del portale: le tavole da vedere, commentare e approvare. */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, Icon, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (portal.project(); as p) {
      <div class="hero">
        <div class="eyebrow">{{ p.code }}</div>
        <h1>Ciao {{ portal.firstName() }}, ecco il tuo progetto</h1>
        <p class="muted row" style="gap:6px"><ui-icon name="map-pin" [size]="14" /> {{ p.title }} · {{ p.address }}</p>
      </div>

      <h2 style="margin:24px 0 12px">Tavole</h2>
      <div class="grid grid-3">
        @for (d of portal.drawings(); track d.id) {
          <a class="card dcard" [routerLink]="['tavole', d.id]">
            <div class="thumb"><img [src]="d.imageUrl" alt="" loading="lazy" /></div>
            <div class="dbody">
              <div class="row-between"><span class="eyebrow">{{ d.code }} · v{{ d.version }}</span>
                @if (d.status === 'APPROVED') { <span class="badge badge-success">Approvata</span> } @else { <span class="badge badge-info">Da rivedere</span> }
              </div>
              <b>{{ d.title }}</b>
              <span class="muted small">{{ d.pinsOpen }} osservazioni aperte · aggiornata {{ rel(d.updatedAt) }}</span>
            </div>
          </a>
        } @empty {
          <div class="card" style="grid-column: 1 / -1"><ui-empty icon="file" title="Nessuna tavola da rivedere" text="Lo studio ti avviserà via email quando pubblica nuove tavole." /></div>
        }
      </div>

      <div class="help card">
        <ui-icon name="info" [size]="18" />
        <div>
          <b>Come funziona</b>
          <p class="muted small">Apri una tavola, premi "Commenta" e clicca nel punto che vuoi segnalare. Quando è tutto a posto, premi "Approva questa versione": riceverai un codice via email per confermare.</p>
        </div>
      </div>
    }
  `,
  styles: `
    .hero { display: grid; gap: 6px; }
    .hero h1 { font-size: 26px; }
    .dcard { overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.15s, transform 0.15s; }
    .dcard:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .thumb { aspect-ratio: 16 / 10; background: #eef1f5; border-bottom: 1px solid var(--line); overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .dbody { padding: 12px 14px; display: grid; gap: 4px; }
    .help { margin-top: 24px; padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; color: var(--info); }
    .help b { color: var(--ink); }
  `,
})
export class PortalHome {
  protected readonly portal = inject(PortalContext);
  protected readonly rel = fmtRelative;
}
