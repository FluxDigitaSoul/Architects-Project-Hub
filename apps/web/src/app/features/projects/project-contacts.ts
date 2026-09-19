import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import {
  type AccessLogEntry,
  CONTACT_ROLE_LABEL,
  type Contact,
  LINK_STATUS_LABEL,
  ProjectsApi,
} from '../../core/api/projects-api';
import { fmtDateTime, fmtRelative } from '../../core/data/format';
import { Confirmer } from '../../shared/ui/confirm';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { ContactForm, type ContactDraft, contactToDraft, draftToInput, emptyContact, isContactValid } from './contact-form';

/**
 * Committenti della commessa e accesso al portale (AFU FR-M1-03, FR-M1-05/06):
 * anagrafica, firmatari, Magic Link (invio, rigenerazione, revoca) e registro degli accessi.
 */
@Component({
  selector: 'app-project-contacts',
  imports: [ContactForm, Dialog, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-between head">
      <p class="muted">Ogni committente entra nel portale con un link personale, senza password. Solo i <b>firmatari</b> possono approvare le tavole.</p>
      @if (canManage()) { <button class="btn btn-primary btn-sm" (click)="openAdd()"><ui-icon name="plus" [size]="15" /> Aggiungi committente</button> }
    </div>

    @for (c of contacts(); track c.id) {
      <article class="card contact">
        <div class="row-between top">
          <div>
            <div class="name"><b>{{ c.displayName }}</b>
              @if (c.isSigner) { <span class="badge badge-primary badge-plain">Firmatario</span> }
              @if (c.roleInProject) { <span class="badge badge-plain">{{ roleLabel[c.roleInProject] }}</span> }
            </div>
            <div class="muted small">{{ c.email }}@if (c.phone) { · {{ c.phone }} }</div>
            @if (c.emailStatus === 'BOUNCED' || c.emailStatus === 'COMPLAINED') {
              <div class="warn small"><ui-icon name="alert" [size]="13" /> Le email a questo indirizzo non vengono recapitate: verifica l'indirizzo.</div>
            }
          </div>
          @if (canManage()) {
            <div class="row actions">
              <button class="btn btn-ghost btn-sm" (click)="openEdit(c)"><ui-icon name="pen" [size]="14" /> Modifica</button>
              <button class="btn btn-ghost btn-sm" (click)="remove(c)"><ui-icon name="trash" [size]="14" /> Rimuovi</button>
            </div>
          }
        </div>

        <div class="portal">
          @if (c.portalEnabled) {
            <span class="badge" [class.badge-success]="c.linkStatus === 'ACTIVE'" [class.badge-warning]="c.linkStatus === 'EXPIRED'" [class.badge-danger]="c.linkStatus === 'REVOKED'">{{ linkLabel[c.linkStatus] }}</span>
            <span class="muted small">{{ c.lastAccessAt ? 'Ultimo accesso ' + rel(c.lastAccessAt) : 'Non ha ancora aperto il portale' }}</span>
            @if (c.privacyAcknowledgedAt) { <span class="muted small">· informativa privacy letta il {{ dateTime(c.privacyAcknowledgedAt) }}</span> }
            <span class="spacer"></span>
            @if (canManage()) {
              <button class="btn btn-outline btn-sm" [disabled]="busy() === c.id" (click)="newLink(c, true)"><ui-icon name="send" [size]="14" /> Invia nuovo link</button>
              <button class="btn btn-ghost btn-sm" [disabled]="busy() === c.id" (click)="newLink(c, false)" title="Crea un nuovo link senza inviare l'email, per condividerlo a mano"><ui-icon name="link" [size]="14" /> Link da copiare</button>
              @if (c.linkStatus === 'ACTIVE') { <button class="btn btn-ghost btn-sm" [disabled]="busy() === c.id" (click)="revoke(c)"><ui-icon name="lock" [size]="14" /> Revoca</button> }
            }
            <button class="btn btn-ghost btn-sm" (click)="toggleLog(c)"><ui-icon name="eye" [size]="14" /> Accessi</button>
          } @else {
            <span class="muted small">Accesso al portale disattivato</span>
          }
        </div>

        @if (link()?.contactId === c.id) {
          <div class="new-link">
            <input class="input mono small" readonly [value]="link()!.url" (focus)="$any($event.target).select()" aria-label="Link al portale" />
            <button class="btn btn-outline btn-sm" (click)="copy(link()!.url)"><ui-icon name="copy" [size]="14" /> Copia</button>
            <p class="muted small">Eventuali link precedenti non funzionano più. Chi riceve questo link entra nel portale: condividilo solo con {{ c.displayName }}.</p>
          </div>
        }

        @if (log()?.contactId === c.id) {
          <div class="log">
            @for (a of log()!.entries; track a.firstSeenAt) {
              <div class="log-row small"><span>{{ dateTime(a.firstSeenAt) }} → {{ dateTime(a.lastSeenAt) }}</span><span class="muted">{{ a.ip ?? '—' }} · {{ device(a.userAgent) }}</span>
                @if (a.active) { <span class="badge badge-success badge-plain">attiva</span> }</div>
            } @empty { <div class="muted small">Nessun accesso registrato.</div> }
          </div>
        }
      </article>
    } @empty {
      <div class="card"><ui-empty icon="users" title="Nessun committente" text="Aggiungi il committente per condividere tavole e documenti nel portale." /></div>
    }

    <ui-dialog [open]="editing() !== null" [title]="editing() === 'new' ? 'Nuovo committente' : 'Modifica committente'" [width]="620" (closed)="editing.set(null)">
      <app-contact-form [(value)]="draft" [touched]="touched()" prefix="pc" />
      @if (editing() === 'new' && draft().portalEnabled) {
        <label class="check"><input type="checkbox" [checked]="sendInvite()" (change)="sendInvite.set($any($event.target).checked)" />
          <span>Invia subito l'email con il link al portale (altrimenti ti mostriamo il link da copiare)</span></label>
      }
      @if (formError(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="editing.set(null)">Annulla</button>
        <button class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Salvataggio…' : 'Salva' }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .head { margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .contact { padding: 16px 18px; display: grid; gap: 12px; margin-bottom: 12px; }
    .top { align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .name { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .actions { gap: 4px; }
    .portal { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--line); }
    .spacer { flex: 1; }
    .warn { color: var(--warning); display: flex; gap: 4px; align-items: center; margin-top: 4px; }
    .new-link { display: grid; grid-template-columns: 1fr auto; gap: 6px 8px; align-items: center; padding: 10px; background: var(--surface-2); border-radius: 8px; }
    .new-link p { grid-column: 1 / -1; margin: 0; }
    .new-link .input { height: 30px; }
    .log { display: grid; gap: 6px; padding: 10px; background: var(--surface-2); border-radius: 8px; }
    .log-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; }
    .check input { margin-top: 3px; }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class ProjectContacts {
  readonly projectId = input.required<string>();
  readonly contacts = input.required<Contact[]>();
  readonly canManage = input(false);
  /** Da ricaricare dopo ogni modifica. */
  readonly changed = output<void>();

  private readonly api = inject(ProjectsApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly roleLabel = CONTACT_ROLE_LABEL;
  protected readonly linkLabel = LINK_STATUS_LABEL;
  protected readonly rel = fmtRelative;
  protected readonly dateTime = fmtDateTime;

  protected readonly editing = signal<'new' | Contact | null>(null);
  protected readonly draft = signal<ContactDraft>(emptyContact());
  protected readonly sendInvite = signal(true);
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly link = signal<{ contactId: string; url: string } | null>(null);
  protected readonly log = signal<{ contactId: string; entries: AccessLogEntry[] } | null>(null);

  protected openAdd(): void {
    // Il primo committente è firmatario per default (serve almeno un firmatario per approvare).
    this.draft.set(emptyContact(this.contacts().every((c) => !c.isSigner)));
    this.sendInvite.set(true);
    this.open('new');
  }

  protected openEdit(c: Contact): void {
    this.draft.set(contactToDraft(c));
    this.open(c);
  }

  protected async save(): Promise<void> {
    this.touched.set(true);
    if (!isContactValid(this.draft())) {
      this.formError.set('Controlla i campi evidenziati.');
      return;
    }
    const target = this.editing();
    const input = draftToInput(this.draft());
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (target === 'new') {
        const r = await this.api.addContact(this.projectId(), input, this.sendInvite());
        if (r.url) this.link.set({ contactId: r.id, url: r.url });
        this.toaster.show(r.invitesSent ? `Committente aggiunto e link inviato a ${input.email}` : 'Committente aggiunto');
      } else if (target) {
        await this.api.updateContact(this.projectId(), target.id, input);
        this.toaster.show('Committente aggiornato');
      }
      this.editing.set(null);
      this.changed.emit();
    } catch (e) {
      this.formError.set(toApiError(e).userMessage);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(c: Contact): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Rimuovere ${c.displayName}?`,
      text: 'Il committente non potrà più accedere al portale. Commenti e approvazioni già registrati restano nello storico della commessa.',
      confirmLabel: 'Rimuovi', tone: 'danger',
    });
    if (!ok) return;
    await this.run(c.id, () => this.api.removeContact(this.projectId(), c.id), 'Committente rimosso');
  }

  /** FR-M1-06: il link precedente viene revocato; con `send` parte anche l'email. */
  protected async newLink(c: Contact, send: boolean): Promise<void> {
    if (c.linkStatus === 'ACTIVE') {
      const ok = await this.confirmer.ask({
        title: 'Creare un nuovo link?',
        text: `Il link attuale di ${c.displayName} smetterà subito di funzionare.`,
        confirmLabel: send ? 'Crea e invia' : 'Crea link',
      });
      if (!ok) return;
    }
    this.busy.set(c.id);
    try {
      const r = await this.api.regenerateLink(this.projectId(), c.id, send);
      this.link.set({ contactId: c.id, url: r.url });
      if (!send) this.toaster.show('Nuovo link pronto da copiare');
      else if (r.invitesSent) this.toaster.show(`Link inviato a ${c.email}`);
      else this.toaster.show('Link creato, ma l’email non è partita: copialo e invialo a mano', 'danger', 6000);
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(null);
    }
  }

  protected async revoke(c: Contact): Promise<void> {
    const ok = await this.confirmer.ask({
      title: 'Revocare il link?',
      text: `${c.displayName} non potrà più entrare nel portale finché non gli invii un nuovo link. Le sessioni aperte vengono chiuse.`,
      confirmLabel: 'Revoca', tone: 'danger',
    });
    if (!ok) return;
    if (this.link()?.contactId === c.id) this.link.set(null);
    await this.run(c.id, () => this.api.revokeLink(this.projectId(), c.id), 'Link revocato');
  }

  protected async toggleLog(c: Contact): Promise<void> {
    if (this.log()?.contactId === c.id) {
      this.log.set(null);
      return;
    }
    try {
      this.log.set({ contactId: c.id, entries: await this.api.accessLog(this.projectId(), c.id) });
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toaster.show('Link copiato');
    } catch {
      this.toaster.show('Copia non riuscita: seleziona il link e copialo a mano', 'danger');
    }
  }

  protected device(ua: string | null): string {
    if (!ua) return 'dispositivo sconosciuto';
    if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS/.test(ua)) return 'Mac';
    return 'browser';
  }

  private open(target: 'new' | Contact): void {
    this.touched.set(false);
    this.formError.set(null);
    this.editing.set(target);
  }

  private async run(contactId: string, action: () => Promise<unknown>, success: string): Promise<void> {
    this.busy.set(contactId);
    try {
      await action();
      this.toaster.show(success);
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(null);
    }
  }
}
