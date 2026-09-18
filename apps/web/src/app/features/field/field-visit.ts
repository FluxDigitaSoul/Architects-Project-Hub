import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FieldStore } from '../../core/data/field-store';
import { ProjectsStore } from '../../core/data/projects-store';
import { fmtDateTime } from '../../core/data/format';
import { REPORT_SECTION_LABEL, type ReportSection, VISIT_STATUS_LABEL } from '../../core/models';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';
import { type Recording, VoiceRecorder } from './voice-recorder';

const SECTIONS: ReportSection[] = ['PROGRESS', 'ISSUES', 'ORDERS'];
const WEATHER = ['Sereno', 'Nuvoloso', 'Pioggia', 'Neve', 'Vento'];
const QUICK_ATTENDEES = ['Capocantiere', 'Committente', 'Impresa esecutrice', 'Coordinatore sicurezza'];

/** Sopralluogo dal telefono (AFU P-03, FR-M4-03..13). */
@Component({
  selector: 'app-field-visit',
  imports: [RouterLink, Icon, EmptyState, Dialog, VoiceRecorder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    @if (visit(); as v) {
      <a routerLink="/cantiere" class="back muted small"><ui-icon name="chevron-left" [size]="14" /> Cantiere</a>
      <div class="head">
        <div class="eyebrow">{{ store.codeOf(v.projectId) }} · {{ dt(v.date) }}</div>
        <h1>Sopralluogo n. {{ v.number }}</h1>
        <span class="badge" [class.badge-success]="final()" [class.badge-warning]="v.status === 'REVIEW'">{{ label[v.status] }}</span>
      </div>

      @if (final()) {
        <div class="final card">
          <ui-icon name="check" [size]="18" />
          <div><b>Verbale finalizzato</b><p class="small">Testo, foto e audio non sono più modificabili (BR-09). Il PDF sarà generato dal backend (FR-M5-01).</p></div>
        </div>
      }

      <section class="card sec">
        <h3>Presenti</h3>
        <div class="chips">
          @for (a of d().attendees; track a) {
            <span class="chip is-active">{{ a }}@if (!final() && !a.startsWith('Direttore')) { <button class="x" (click)="field.removeAttendee(id(), a)" aria-label="Rimuovi">✕</button> }</span>
          }
        </div>
        @if (!final()) {
          <div class="chips">@for (q of quick; track q) { <button class="chip" (click)="field.addAttendee(id(), q)">+ {{ q }}</button> }</div>
          <div class="row"><input class="input" placeholder="Nome e qualifica" [value]="attendee()" (input)="attendee.set(val($event))" (keydown.enter)="addAttendee()" /><button class="btn btn-outline" (click)="addAttendee()">Aggiungi</button></div>
        }
        <h3 style="margin-top:6px">Meteo</h3>
        <div class="chips">@for (w of weather; track w) { <button class="chip" [class.is-active]="d().weather === w" [disabled]="final()" (click)="field.setWeather(id(), w)">{{ w }}</button> }</div>
      </section>

      <section class="card sec">
        <div class="row-between"><h3>Foto <span class="muted">{{ d().photos.length }}</span></h3>
          @if (!final()) {
            <label class="btn btn-primary"><ui-icon name="upload" [size]="16" /> Scatta / carica
              <input type="file" accept="image/*" capture="environment" multiple hidden (change)="onPhotos($event)" /></label>
          }
        </div>
        @if (d().photos.length) {
          <div class="photos">
            @for (p of d().photos; track p.id; let i = $index) {
              <figure>
                <img [src]="p.url" alt="" />
                <span class="n">{{ i + 1 }}</span>
                @if (!final()) { <button class="rm" (click)="field.removePhoto(id(), p.id)" aria-label="Rimuovi foto">✕</button> }
                <input class="input input-sm" placeholder="Didascalia" [value]="p.caption" [disabled]="final()" (change)="field.setCaption(id(), p.id, val($event))" />
              </figure>
            }
          </div>
        } @else { <p class="muted small">Le foto vengono compresse sul telefono prima dell'invio (FR-M4-05).</p> }
      </section>

      <section class="card sec">
        <h3>Note vocali</h3>
        @if (!final()) { <app-voice-recorder (recorded)="onRecorded($event)" /> }
        @for (a of d().audio; track a.id; let i = $index) {
          <div class="audio"><span class="small"><b>Nota {{ i + 1 }}</b> · {{ a.durationSec }} s</span><audio [src]="a.url" controls preload="none"></audio>
            @if (!final()) { <button class="btn btn-ghost btn-icon" (click)="field.removeAudio(id(), a.id)" aria-label="Elimina"><ui-icon name="trash" [size]="15" /></button> }</div>
        }
        @if (!final()) {
          <button class="btn btn-outline ai" [disabled]="d().aiState === 'RUNNING'" (click)="runAi()">
            <ui-icon name="sparkles" [size]="16" /> {{ d().aiState === 'RUNNING' ? 'Trascrizione e strutturazione in corso…' : 'Genera la bozza del verbale con AI' }}
          </button>
          <p class="muted small">Simulazione: la trascrizione reale (FR-M4-09) arriverà con il backend. La bozza va sempre revisionata dal DL (BR-05).</p>
        }
      </section>

      @for (s of sections; track s) {
        <section class="card sec">
          <div class="row-between"><h3>{{ sectionLabel[s] }}</h3>
            @if (!final()) { <button class="btn btn-ghost btn-sm" (click)="field.addItem(id(), s)"><ui-icon name="plus" [size]="14" /> Voce</button> }</div>
          @for (it of itemsOf(s); track it.id; let i = $index) {
            <div class="item" [class.flag]="it.needsVerification">
              <div class="row-between small"><b>{{ prefix(s) }}.{{ i + 1 }}</b>
                <span class="row" style="gap:6px">
                  @if (it.origin !== 'HUMAN') { <span class="badge badge-info badge-plain">{{ it.origin === 'AI' ? 'Bozza AI' : 'AI · revisionata' }}</span> }
                  @if (!final()) {
                    <select class="select select-sm" style="width:auto" (change)="field.moveItem(id(), it.id, $any(val($event)))">
                      @for (t of sections; track t) { <option [value]="t" [selected]="t === s">{{ prefix(t) }}</option> }
                    </select>
                    <button class="btn btn-ghost btn-icon" (click)="field.removeItem(id(), it.id)" aria-label="Elimina voce"><ui-icon name="trash" [size]="14" /></button>
                  }
                </span>
              </div>
              <textarea class="textarea" rows="2" [value]="it.text" [disabled]="final()" (change)="field.updateItem(id(), it.id, val($event))"></textarea>
              @if (it.needsVerification) { <span class="small" style="color:var(--warning)">Completa il punto [DA VERIFICARE] per poter finalizzare.</span> }
            </div>
          } @empty { <p class="muted small">Nessuna voce.</p> }
        </section>
      }

      @if (!final()) {
        <div class="bar">
          <div class="small">
            @if (blockers().length) { @for (b of blockers(); track b) { <div style="color:var(--warning)">• {{ b }}</div> } }
            @else { <span style="color:var(--success)">Pronto per la finalizzazione</span> }
          </div>
          <button class="btn btn-primary btn-lg" [disabled]="blockers().length > 0" (click)="confirmOpen.set(true)"><ui-icon name="check" [size]="16" /> Finalizza verbale</button>
        </div>
      }

      <ui-dialog [open]="confirmOpen()" title="Finalizzare il verbale?" (closed)="confirmOpen.set(false)">
        <p>Finalizzando, il verbale n. {{ v.number }} non sarà più modificabile. Eventuali correzioni richiederanno l'annullamento motivato e un nuovo verbale.</p>
        <div dialog-actions>
          <button class="btn btn-outline" (click)="confirmOpen.set(false)">Annulla</button>
          <button class="btn btn-primary" (click)="finalize()">Finalizza</button>
        </div>
      </ui-dialog>
    } @else {
      <div class="card"><ui-empty icon="hardhat" title="Sopralluogo non trovato" /></div>
    }
  `,
  styles: `
    :host { display: block; max-width: 760px; padding-bottom: 96px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .head { display: grid; gap: 4px; justify-items: start; margin-bottom: 14px; }
    .final { display: flex; gap: 10px; padding: 14px 16px; margin-bottom: 12px; background: var(--success-soft); color: var(--success); border-color: transparent; }
    .sec { padding: 16px; display: grid; gap: 12px; margin-bottom: 12px; }
    .sec h3 span { font-weight: 400; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 36px; gap: 6px; }
    .chip .x { border: 0; background: transparent; color: inherit; cursor: pointer; opacity: 0.8; padding: 0 0 0 4px; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    figure { margin: 0; position: relative; display: grid; gap: 6px; }
    figure img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
    figure .n { position: absolute; top: 6px; left: 6px; background: rgba(15, 23, 42, 0.75); color: #fff; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
    figure .rm { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: 0; background: rgba(15, 23, 42, 0.75); color: #fff; cursor: pointer; }
    .audio { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .audio audio { height: 36px; flex: 1; min-width: 200px; }
    .ai { height: 46px; }
    .item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: grid; gap: 8px; }
    .item.flag { border-color: var(--warning); background: var(--warning-soft); }
    .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 8; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px max(16px, calc((100vw - var(--sidebar-w) - 760px) / 2)); padding-left: calc(var(--sidebar-w) + 28px);
      background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(8px); border-top: 1px solid var(--line); }
    @media (max-width: 960px) { .bar { padding: 12px 14px; } .bar .btn { height: 48px; } }
  `,
})
export class FieldVisit {
  readonly id = input.required<string>();
  protected readonly store = inject(ProjectsStore);
  protected readonly field = inject(FieldStore);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly dt = fmtDateTime;
  protected readonly label = VISIT_STATUS_LABEL;
  protected readonly sectionLabel = REPORT_SECTION_LABEL;
  protected readonly sections = SECTIONS;
  protected readonly weather = WEATHER;
  protected readonly quick = QUICK_ATTENDEES;

  protected readonly visit = computed(() => this.store.visits().find((v) => v.id === this.id()) ?? null);
  protected readonly d = computed(() => this.field.detail(this.id())());
  protected readonly blockers = computed(() => this.field.blockers(this.id())());
  protected readonly final = computed(() => ['FINAL', 'SENT'].includes(this.visit()?.status ?? ''));
  protected readonly attendee = signal('');
  protected readonly confirmOpen = signal(false);

  protected itemsOf(section: ReportSection) {
    return this.d().items.filter((i) => i.section === section);
  }

  protected prefix(section: ReportSection): number {
    return SECTIONS.indexOf(section) + 1;
  }

  protected addAttendee(): void {
    this.field.addAttendee(this.id(), this.attendee());
    this.attendee.set('');
  }

  protected onPhotos(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.field.addPhotos(this.id(), Array.from(input.files ?? []));
    input.value = '';
  }

  protected onRecorded(r: Recording): void {
    this.field.addAudio(this.id(), r.blob, r.durationSec);
    this.toaster.show('Nota vocale salvata sul dispositivo', 'info');
  }

  protected async runAi(): Promise<void> {
    await this.field.runAi(this.id());
    this.toaster.show('Bozza pronta: revisiona le voci evidenziate');
  }

  protected finalize(): void {
    this.confirmOpen.set(false);
    if (this.field.finalize(this.id())) this.toaster.show('Verbale finalizzato');
    else this.toaster.show('Completa le voci da verificare prima di finalizzare', 'danger');
  }
}
