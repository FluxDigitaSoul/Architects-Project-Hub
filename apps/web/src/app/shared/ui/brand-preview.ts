import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { contrastFor } from '../../core/tenant/tenant-context';
import { Icon } from './icon';

/** Anteprima dal vivo del branding su app, portale e documento (AFU FR-M0-05). */
@Component({
  selector: 'ui-brand-preview',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="preview" [style.--p]="color()" [style.--pc]="contrast()">
      <div class="win">
        <div class="win-bar">
          <span class="logo">
            @if (logo()) { <img [src]="logo()" alt="" /> } @else { <span class="mark">{{ initials() }}</span> }
            <span class="name">{{ name() || 'Il tuo studio' }}</span>
          </span>
          <span class="btn-mini">Pubblica tavola</span>
        </div>
        <div class="win-body">
          <div class="tile">
            <div class="tile-head"><span class="dot"></span> A-101 · Pianta piano primo</div>
            <div class="plan">
              <span class="pin" style="left: 32%; top: 40%">1</span>
              <span class="pin" style="left: 61%; top: 62%">2</span>
            </div>
          </div>
          <div class="side">
            <div class="line w60"></div><div class="line w80"></div><div class="line w40"></div>
            <span class="pill">Conforme · +0,20 mq</span>
          </div>
        </div>
      </div>
      <div class="doc">
        <div class="doc-head">
          @if (logo()) { <img [src]="logo()" alt="" /> } @else { <span class="mark">{{ initials() }}</span> }
          <div><b>{{ name() || 'Il tuo studio' }}</b><div class="tiny">Verbale di sopralluogo n. 3</div></div>
        </div>
        <div class="rule"></div>
        <div class="line w90"></div><div class="line w70"></div>
      </div>
      <div class="caption muted small"><ui-icon name="info" [size]="14" /> Il portale e i PDF usano il colore solo per elementi di interfaccia.</div>
    </div>
  `,
  styles: `
    .preview { display: grid; gap: 12px; }
    .win { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #fff; box-shadow: var(--shadow-sm); }
    .win-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .logo { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12.5px; }
    .logo img, .doc-head img { height: 20px; max-width: 90px; object-fit: contain; }
    .mark { width: 22px; height: 22px; border-radius: 6px; background: var(--p); color: var(--pc); display: grid; place-items: center; font-size: 10px; font-weight: 700; }
    .btn-mini { background: var(--p); color: var(--pc); font-size: 11px; font-weight: 500; padding: 5px 9px; border-radius: 6px; }
    .win-body { display: grid; grid-template-columns: 1.6fr 1fr; gap: 10px; padding: 12px; background: var(--bg); }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .tile-head { font-size: 11px; padding: 7px 9px; border-bottom: 1px solid var(--line); display: flex; gap: 6px; align-items: center; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--p); }
    .plan { position: relative; height: 84px; background:
      linear-gradient(#e6e9ee 1px, transparent 1px) 0 0/16px 16px, linear-gradient(90deg, #e6e9ee 1px, transparent 1px) 0 0/16px 16px; }
    .pin { position: absolute; width: 16px; height: 16px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg) translate(-50%, -50%);
      background: var(--p); color: var(--pc); font-size: 9px; font-weight: 700; display: grid; place-items: center; }
    .side { display: flex; flex-direction: column; gap: 8px; justify-content: center; }
    .line { height: 6px; border-radius: 4px; background: var(--line); }
    .w40 { width: 40%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; } .w90 { width: 90%; }
    .pill { align-self: flex-start; font-size: 10.5px; font-weight: 500; padding: 3px 8px; border-radius: 999px; background: var(--success-soft); color: var(--success); }
    .doc { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: #fff; display: grid; gap: 8px; }
    .doc-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
    .tiny { font-size: 10.5px; color: var(--muted); }
    .rule { height: 2px; background: var(--p); border-radius: 2px; }
    .caption { display: flex; gap: 6px; align-items: center; }
  `,
})
export class BrandPreview {
  readonly name = input('');
  readonly color = input('#0f172a');
  readonly logo = input<string | null>(null);
  readonly contrast = computed(() => contrastFor(this.color()));
  readonly initials = computed(() =>
    (this.name().trim() || 'PH')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  );
}
