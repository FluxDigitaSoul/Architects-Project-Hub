import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { type Delivery, DocumentsApi, type Recipient, type StudioDocument } from '../../core/api/documents-api';
import { ProjectsApi } from '../../core/api/projects-api';
import { fmtDateTime } from '../../core/data/format';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;

interface Suggestion extends Recipient {
  key: string;
  name: string;
  role: string;
}

const CHANNEL_LABEL: Record<Delivery['channel'], string> = {
  EMAIL_ATTACHMENT: 'Email con allegato', EMAIL_LINK: 'Email con link (7 giorni)', MANUAL_PEC: 'PEC registrata a mano',
};

/**
 * Invio di un documento (AFU FR-M5-05): email con il PDF in allegato (o link se supera 10 MB),
 * oppure registrazione di un invio via PEC fatto dal proprio gestore. Nessun tracciamento della lettura.
 */
@Component({
  selector: 'app-send-document-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" [title]="'Invia · ' + (doc()?.title ?? '')" [width]="620" (closed)="closed.emit()">
      @if (result(); as r) {
        <p><b>{{ r.channel === 'MANUAL_PEC' ? 'Invio PEC registrato' : 'Invio completato' }}</b></p>
        <ul class="res">@for (d of r.deliveries; track d.email) {
          <li><span>{{ d.email }}</span><span class="badge" [class.badge-success]="d.status !== 'FAILED'" [class.badge-danger]="d.status === 'FAILED'">{{ statusLabel(d.status) }}</span></li>
        }</ul>
      } @else {
        <div class="channels" role="radiogroup" aria-label="Canale">
          <label class="ch" [class.is-on]="channel() === 'EMAIL'"><input type="radio" name="ch" [checked]="channel() === 'EMAIL'" (change)="channel.set('EMAIL')" />
            <span><b>Email</b><span class="muted small">Parte ora dal Project Hub con il marchio dello studio</span></span></label>
          <label class="ch" [class.is-on]="channel() === 'MANUAL_PEC'"><input type="radio" name="ch" [checked]="channel() === 'MANUAL_PEC'" (change)="channel.set('MANUAL_PEC')" />
            <span><b>PEC (registrazione)</b><span class="muted small">L'hai inviata dalla tua casella PEC: qui resta traccia</span></span></label>
        </div>

        @if (suggestions().length) {
          <div class="field"><label>Destinatari della commessa</label>
            <div class="sugg">@for (s of suggestions(); track s.key) {
              <label class="check"><input type="checkbox" [checked]="picked().has(s.key)" (change)="toggle(s.key)" />
                <span><b>{{ s.name }}</b> <span class="muted small">{{ s.role }} · {{ s.email }}</span></span></label>
            }</div>
          </div>
        }
        <div class="field"><label for="sd-extra">Altri indirizzi <span class="muted">(separati da virgola)</span></label>
          <input id="sd-extra" class="input" type="text" placeholder="es. ufficio.tecnico@comune.it" [value]="extra()" (input)="extra.set(val($event))" />
          @if (invalidExtra().length) { <span class="hint is-error">Indirizzi non validi: {{ invalidExtra().join(', ') }}</span> }</div>
        <div class="field"><label for="sd-msg">Messaggio <span class="muted">(facoltativo)</span></label>
          <textarea id="sd-msg" class="input area" rows="3" maxlength="2000" [value]="message()" (input)="message.set(val($event))"></textarea></div>
        @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      }

      @if (history.value()?.length) {
        <details class="hist"><summary>Invii precedenti ({{ history.value()!.length }})</summary>
          @for (h of history.value(); track h.id) {
            <div class="h small"><b>{{ dt(h.sentAt) }}</b> · {{ channelLabel[h.channel] }} · {{ summary(h) }}</div>
          }
        </details>
      }

      <div dialog-actions>
        @if (result()) { <button class="btn btn-primary" (click)="closed.emit()">Chiudi</button> }
        @else {
          <button class="btn btn-outline" (click)="closed.emit()">Annulla</button>
          <button class="btn btn-primary" [disabled]="!recipients().length || invalidExtra().length > 0 || busy()" (click)="send()">
            {{ busy() ? 'Invio…' : channel() === 'EMAIL' ? 'Invia a ' + recipients().length : 'Registra invio PEC' }}</button>
        }
      </div>
    </ui-dialog>
  `,
  styles: `
    .channels { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .ch { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; cursor: pointer; }
    .ch.is-on { border-color: var(--color-primary); background: var(--primary-soft); }
    .ch span { display: grid; gap: 2px; }
    .sugg { display: grid; gap: 6px; max-height: 180px; overflow: auto; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
    .area { height: auto; padding-top: 8px; resize: vertical; }
    .hint.is-error { color: var(--danger); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
    .res { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .res li { display: flex; justify-content: space-between; gap: 10px; }
    .hist summary { cursor: pointer; font-size: 13px; color: var(--muted); }
    .h { padding: 4px 0; }
    @media (max-width: 560px) { .channels { grid-template-columns: 1fr; } }
  `,
})
export class SendDocumentDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly doc = input<StudioDocument | null>(null);
  readonly closed = output<void>();
  readonly sent = output<void>();

  private readonly api = inject(DocumentsApi);
  private readonly projects = inject(ProjectsApi);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly dt = fmtDateTime;
  protected readonly channelLabel = CHANNEL_LABEL;

  protected readonly channel = signal<'EMAIL' | 'MANUAL_PEC'>('EMAIL');
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly extra = signal('');
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<{ channel: string; deliveries: { email: string; status: string }[] } | null>(null);

  private readonly project = resource({
    params: () => (this.open() ? this.projectId() : undefined),
    loader: ({ params }) => this.projects.detail(params),
  });
  protected readonly history = resource({
    params: () => {
      const d = this.doc();
      return this.open() && d ? { p: this.projectId(), d: d.id } : undefined;
    },
    loader: ({ params }) => this.api.deliveries(params.p, params.d),
  });

  protected readonly suggestions = computed<Suggestion[]>(() => {
    const p = this.project.value();
    if (!p) return [];
    const pec = this.channel() === 'MANUAL_PEC';
    const contacts = p.contacts.map((c) => ({ key: `c:${c.id}`, name: c.displayName, email: c.email, role: c.isSigner ? 'Committente firmatario' : 'Committente' }));
    const contractors = p.contractors
      .map((c) => ({ key: `i:${c.id}`, name: c.name, email: (pec ? c.pec ?? c.email : c.email ?? c.pec) ?? '', role: 'Impresa' }))
      .filter((c) => c.email);
    return [...contacts, ...contractors];
  });
  private readonly extraList = computed(() => this.extra().split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
  protected readonly invalidExtra = computed(() => this.extraList().filter((e) => !EMAIL_RE.test(e)));
  protected readonly recipients = computed<Recipient[]>(() => {
    const chosen: Recipient[] = this.suggestions().filter((s) => this.picked().has(s.key)).map((s) => ({ email: s.email.toLowerCase(), name: s.name }));
    const extra: Recipient[] = this.extraList().filter((e) => EMAIL_RE.test(e)).map((email) => ({ email }));
    const seen = new Set<string>();
    const unique: Recipient[] = [];
    for (const r of [...chosen, ...extra]) {
      if (seen.has(r.email)) continue;
      seen.add(r.email);
      unique.push(r);
    }
    return unique.slice(0, MAX_RECIPIENTS);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.channel.set('EMAIL');
      this.picked.set(new Set());
      this.extra.set('');
      this.message.set('');
      this.error.set(null);
      this.result.set(null);
    });
    // Per default si propongono i committenti firmatari.
    effect(() => {
      const p = this.project.value();
      if (p && this.open()) this.picked.set(new Set(p.contacts.filter((c) => c.isSigner).map((c) => `c:${c.id}`)));
    });
  }

  protected toggle(key: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected statusLabel(status: string): string {
    return status === 'FAILED' ? 'Non inviato' : status === 'RECORDED' ? 'Registrato' : 'Inviato';
  }

  protected summary(h: Delivery): string {
    return h.deliveryStatus.map((d) => `${d.email} (${this.statusLabel(d.status).toLowerCase()})`).join(', ');
  }

  protected async send(): Promise<void> {
    const d = this.doc();
    if (!d) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.send(this.projectId(), d.id, { channel: this.channel(), recipients: this.recipients(), message: this.message().trim() || null });
      this.result.set({ channel: r.channel, deliveries: r.deliveries });
      const failed = r.deliveries.filter((x) => x.status === 'FAILED').length;
      this.toaster.show(failed ? `${failed} invii non riusciti` : 'Documento inviato', failed ? 'danger' : 'success');
      this.history.reload();
      this.sent.emit();
    } catch (e) {
      this.error.set(toApiError(e).userMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
