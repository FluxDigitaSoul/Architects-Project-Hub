import { ChangeDetectionStrategy, Component, computed, inject, input, output, resource } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { StudioReviewApi } from '../../core/api/review-api';
import { fmtDateTime } from '../../core/data/format';
import { Dialog } from '../../shared/ui/dialog';

/** Azioni del registro di audit (nomi usati dall'API) in italiano. */
const ACTION_LABEL: Record<string, string> = {
  DRAWING_VERSION_STARTED: 'Caricamento avviato',
  DRAWING_VERSION_READY: 'Versione pronta (file verificato)',
  DRAWING_UPLOAD_REJECTED: 'File rifiutato',
  DRAWING_VERSION_PUBLISHED: 'Versione pubblicata',
  DRAWING_VERSION_WITHDRAWN: 'Pubblicazione ritirata',
  DRAWING_VERSION_DISCARDED: 'Versione scartata',
  DRAWING_VERSION_APPROVED: 'Versione approvata',
  PIN_CREATED: 'Osservazione aggiunta',
  COMMENT_ADDED: 'Risposta',
  COMMENT_EDITED: 'Messaggio modificato',
  PIN_RESOLVED: 'Osservazione risolta',
  PIN_REOPENED: 'Osservazione riaperta',
  PIN_WITHDRAWN: 'Osservazione ritirata',
  PINS_TRANSFERRED: 'Osservazioni riportate',
  OTP_SENT: 'Codice di conferma inviato',
  CHANGE_REQUEST_SUBMITTED: 'Richiesta di modifica inviata',
  CHANGE_REQUEST_ASSESSED: 'Richiesta di modifica valutata',
};

/** Registro di approvazione: prova digitale dell'approvazione e cronologia (AFU FR-M2-16, NFR-LEG-02). */
@Component({
  selector: 'app-freeze-log-dialog',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog [open]="open()" title="Registro di approvazione" [width]="680" (closed)="closed.emit()">
      @if (log.value(); as l) {
        <p class="muted small">{{ l.version.title }} · versione {{ l.version.number }} · impronta del file (SHA-256) <span class="mono hash">{{ l.version.sha256 }}</span></p>
        @for (a of l.approvals; track a.id) {
          <section class="appr">
            <div class="row-between"><b>Approvata da {{ a.signer }}</b><span class="badge badge-success">Codice {{ a.verificationCode }}</span></div>
            <dl>
              <dt>Data e ora</dt><dd>{{ dt(a.approvedAt) }}</dd>
              <dt>Email</dt><dd>{{ a.email }}</dd>
              <dt>Indirizzo IP</dt><dd class="mono">{{ a.ip ?? '—' }}</dd>
              <dt>Dispositivo</dt><dd class="small">{{ a.userAgent ?? '—' }}</dd>
              <dt>File approvato</dt><dd class="mono hash">{{ a.fileSha256 }}</dd>
              <dt>Osservazioni aperte</dt><dd>{{ a.openPinsAtApproval }}</dd>
            </dl>
            <blockquote>{{ a.declarationText }}</blockquote>
          </section>
        } @empty { <p class="muted">Nessuna approvazione registrata per questa versione.</p> }
        <h3>Cronologia</h3>
        <ol class="events">
          @for (e of l.events; track $index) {
            <li><span class="muted small mono">{{ dt(e.at) }}</span> {{ label(e.action) }} <span class="muted small">· {{ actor(e.actorType) }}</span></li>
          }
        </ol>
      } @else if (log.error()) {
        <p class="err">{{ errorText() }}</p>
      } @else { <p class="muted">Caricamento…</p> }
    </ui-dialog>
  `,
  styles: `
    .hash { word-break: break-all; font-size: 11.5px; }
    .appr { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 8px; }
    dl { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--line-strong); background: var(--surface-2); font-size: 12.5px; }
    .events { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 13px; }
    .err { color: var(--danger); }
  `,
})
export class FreezeLogDialog {
  readonly open = input(false);
  readonly projectId = input.required<string>();
  readonly versionId = input.required<string>();
  readonly closed = output<void>();

  private readonly api = inject(StudioReviewApi);
  protected readonly dt = fmtDateTime;
  protected readonly log = resource({
    params: () => (this.open() ? { p: this.projectId(), v: this.versionId() } : undefined),
    loader: ({ params }) => this.api.freezeLog(params.p, params.v),
  });
  protected readonly errorText = computed(() => toApiError(this.log.error()).userMessage);

  protected label(action: string): string {
    return ACTION_LABEL[action] ?? action.toLowerCase().replace(/_/g, ' ');
  }

  protected actor(type: string): string {
    return type === 'CLIENT' ? 'committente' : type === 'USER' ? 'studio' : 'sistema';
  }
}
