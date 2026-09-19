import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { type Member, StudioSettingsApi } from '../../core/api/studio-settings';
import { Auth } from '../../core/auth/auth';
import { fmtRelative } from '../../core/data/format';
import { type StudioRole, TenantContext } from '../../core/tenant/tenant-context';
import { Confirmer } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

export const STUDIO_ROLE_LABEL: Record<StudioRole, string> = { OWNER: 'Owner', ARCHITECT: 'Architetto', COLLABORATOR: 'Collaboratore' };
const ROLE_HINT: Record<StudioRole, string> = {
  OWNER: 'Gestisce studio, piano, marchio e persone. Vede tutte le commesse.',
  ARCHITECT: 'Crea e gestisce commesse, firma relazioni e verbali se iscritto all’albo.',
  COLLABORATOR: 'Lavora sulle commesse a cui è assegnato. Non firma documenti.',
};
const STATUS_LABEL: Record<Member['status'], string> = { ACTIVE: 'Attivo', INVITED: 'Invitato', SUSPENDED: 'Sospeso' };
const ROLES = Object.keys(STUDIO_ROLE_LABEL) as StudioRole[];
type MemberStatusChange = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

/**
 * Persone dello studio (AFU FR-M0-06/07, BR-12, BR-28): inviti, ruoli, sospensione e rimozione.
 * Solo l'Owner modifica; lo studio deve sempre avere un Owner attivo (verificato anche dal database).
 */
@Component({
  selector: 'app-settings-team',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canManage()) {
      <form class="card card-body invite" (submit)="$event.preventDefault(); invite()">
        <div class="field grow"><label for="st-email">Invita una persona</label>
          <input id="st-email" class="input" type="email" autocomplete="off" placeholder="nome@studio.it" [value]="email()" (input)="email.set(val($event))" /></div>
        <div class="field"><label for="st-role">Ruolo</label>
          <select id="st-role" class="select" (change)="role.set($any(val($event)))">
            @for (r of roles; track r) { <option [value]="r" [selected]="r === role()">{{ roleLabel[r] }}</option> }
          </select></div>
        <button class="btn btn-primary" type="submit" [disabled]="!emailValid() || inviting()"><ui-icon name="send" [size]="14" /> {{ inviting() ? 'Invio…' : 'Invia invito' }}</button>
        <span class="hint full">{{ roleHint[role()] }}@if (seatsText(); as s) { · {{ s }} }</span>
      </form>
    }
    <div class="card">
      @if (members.error()) {
        <div class="error-box">{{ loadError() }} <button class="btn btn-outline btn-sm" (click)="members.reload()">Riprova</button></div>
      } @else if (members.value(); as list) {
        <table class="table">
          <thead><tr><th>Persona</th><th>Ruolo</th><th>Stato</th><th>Firma</th>@if (canManage()) { <th class="num"><span class="sr-only">Azioni</span></th> }</tr></thead>
          <tbody>
            @for (m of list; track m.membershipId) {
              @let me = isMe(m);
              <tr [class.dim]="m.status !== 'ACTIVE'">
                <td><b>{{ m.name }}</b>@if (me) { <span class="badge badge-plain">tu</span> }@if (m.email && m.email !== m.name) { <div class="muted small">{{ m.email }}</div> }</td>
                <td>
                  @if (canManage() && !me && m.status !== 'INVITED') {
                    <select class="select select-sm" [attr.aria-label]="'Ruolo di ' + m.name" [disabled]="busy() === m.membershipId" (change)="changeRole(m, $any(val($event)))">
                      @for (r of roles; track r) { <option [value]="r" [selected]="r === m.role">{{ roleLabel[r] }}</option> }
                    </select>
                  } @else { {{ roleLabel[m.role] }} }
                </td>
                <td><span class="badge" [class.badge-success]="m.status === 'ACTIVE'" [class.badge-warning]="m.status === 'INVITED'" [class.badge-danger]="m.status === 'SUSPENDED'">{{ statusLabel[m.status] }}</span>
                  @if (m.status === 'INVITED' && m.invitedAt) { <div class="muted small">{{ rel(m.invitedAt) }}</div> }</td>
                <td>@if (m.canSign) { <span class="ok"><ui-icon name="shield" [size]="14" /> Abilitato</span> } @else { <span class="muted small">{{ m.role === 'COLLABORATOR' ? '—' : 'Iscrizione mancante' }}</span> }</td>
                @if (canManage()) {
                  <td class="num actions">
                    @if (!me) {
                      @if (m.status === 'ACTIVE') { <button class="btn btn-ghost btn-sm" [disabled]="busy() === m.membershipId" (click)="setStatus(m, 'SUSPENDED')">Sospendi</button> }
                      @if (m.status === 'SUSPENDED') { <button class="btn btn-ghost btn-sm" [disabled]="busy() === m.membershipId" (click)="setStatus(m, 'ACTIVE')">Riattiva</button> }
                      <button class="btn btn-ghost btn-sm danger" [disabled]="busy() === m.membershipId" (click)="setStatus(m, 'REMOVED')">{{ m.status === 'INVITED' ? 'Revoca invito' : 'Rimuovi' }}</button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      } @else { <div class="skeleton"></div> }
    </div>
    @if (!canManage()) { <p class="muted small">Solo l'Owner dello studio invita persone e cambia i ruoli.</p> }
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .invite { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .invite .grow { flex: 1; min-width: 220px; }
    .invite .full { flex-basis: 100%; }
    .card { overflow-x: auto; }
    .table .badge-plain { margin-left: 6px; }
    tr.dim td { opacity: 0.75; }
    .ok { display: inline-flex; gap: 4px; align-items: center; color: var(--success); font-size: 13px; }
    .actions { white-space: nowrap; }
    .danger { color: var(--danger); }
    .skeleton { height: 180px; }
    .error-box { padding: 20px; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class SettingsTeam {
  readonly canManage = input(false);

  private readonly api = inject(StudioSettingsApi);
  private readonly auth = inject(Auth);
  private readonly tenant = inject(TenantContext);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly rel = fmtRelative;
  protected readonly roles = ROLES;
  protected readonly roleLabel = STUDIO_ROLE_LABEL;
  protected readonly roleHint = ROLE_HINT;
  protected readonly statusLabel = STATUS_LABEL;

  protected readonly members = resource({ loader: () => this.api.members() });
  protected readonly loadError = computed(() => toApiError(this.members.error()).userMessage);
  protected readonly email = signal('');
  protected readonly role = signal<StudioRole>('ARCHITECT');
  protected readonly inviting = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim()));
  protected readonly seatsText = computed(() => {
    const max = this.tenant.context()?.plan.entitlements.limits['seats.max'];
    const used = this.members.value()?.filter((m) => m.status !== 'SUSPENDED').length;
    if (max === undefined || max === null || used === undefined) return null;
    return `${used} di ${max} postazioni del piano in uso`;
  });

  protected isMe(m: Member): boolean {
    const mine = this.auth.session()?.email?.toLowerCase();
    return !!mine && m.email?.toLowerCase() === mine && m.status === 'ACTIVE';
  }

  protected async invite(): Promise<void> {
    if (!this.emailValid()) return;
    this.inviting.set(true);
    try {
      const r = await this.api.invite(this.email().trim(), this.role());
      this.toaster.show(r.emailSent ? 'Invito inviato' : 'Invito creato, ma l’email non è partita: avvisa la persona o riprova più tardi.', r.emailSent ? 'success' : 'danger');
      this.email.set('');
      this.members.reload();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.inviting.set(false);
    }
  }

  protected async changeRole(m: Member, role: StudioRole): Promise<void> {
    if (role === m.role) return;
    await this.apply(m, { role }, `${m.name} ora è ${STUDIO_ROLE_LABEL[role]}`);
  }

  protected async setStatus(m: Member, status: MemberStatusChange): Promise<void> {
    if (status !== 'ACTIVE') {
      const ok = await this.confirmer.ask(this.confirmFor(m, status));
      if (!ok) return;
    }
    const done = { ACTIVE: 'riattivato', SUSPENDED: 'sospeso', REMOVED: m.status === 'INVITED' ? 'invito revocato' : 'rimosso' }[status];
    await this.apply(m, { status }, `${m.name}: ${done}`);
  }

  private confirmFor(m: Member, status: MemberStatusChange) {
    if (m.status === 'INVITED') {
      return { title: 'Revocare l’invito?', text: `Il link inviato a ${m.email} smetterà di funzionare.`, confirmLabel: 'Revoca', tone: 'danger' as const };
    }
    return status === 'SUSPENDED'
      ? { title: `Sospendere ${m.name}?`, text: 'Non potrà più accedere allo studio e perderà le assegnazioni alle commesse. Potrai riattivarlo.', confirmLabel: 'Sospendi', tone: 'danger' as const }
      : { title: `Rimuovere ${m.name}?`, text: 'Perde l’accesso allo studio e le assegnazioni alle commesse. Documenti e attività restano nello storico.', confirmLabel: 'Rimuovi', tone: 'danger' as const };
  }

  private async apply(m: Member, patch: { role?: StudioRole; status?: MemberStatusChange }, message: string): Promise<void> {
    this.busy.set(m.membershipId);
    try {
      await this.api.updateMember(m.membershipId, patch);
      this.toaster.show(message);
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(null);
      this.members.reload();
    }
  }
}
