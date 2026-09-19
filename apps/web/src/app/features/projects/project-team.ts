import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import {
  type Contractor,
  type ContractorInput,
  PROJECT_ROLE_LABEL,
  type ProjectRole,
  ProjectsApi,
  type TeamMember,
} from '../../core/api/projects-api';
import { type Member, StudioSettingsApi } from '../../core/api/studio-settings';
import { fmtDate } from '../../core/data/format';
import { Confirmer } from '../../shared/ui/confirm';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

const EMPTY_CONTRACTOR: ContractorInput = { name: '', vatNumber: '', contactName: '', email: '', pec: '', phone: '', category: '' };

/** Team della commessa e imprese esecutrici (AFU FR-M1-03, BR-17: un solo Direttore dei lavori attivo). */
@Component({
  selector: 'app-project-team',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid cols">
      <section class="card">
        <div class="card-header"><h2>Team dello studio</h2>
          @if (canManage()) { <button class="btn btn-outline btn-sm" (click)="openAssign()"><ui-icon name="plus" [size]="14" /> Assegna</button> }
        </div>
        <ul class="list">
          @for (m of team(); track m.assignmentId) {
            <li>
              <span class="avatar">{{ initials(m.name) }}</span>
              <span class="grow"><b>{{ m.name }}</b>
                <span class="muted small">{{ roleLabel[m.projectRole] }} · dal {{ date(m.since) }}@if (m.professionalRegistration) { · {{ m.professionalRegistration }} }</span></span>
              @if (canManage()) { <button class="btn btn-ghost btn-icon" (click)="unassign(m)" [attr.aria-label]="'Rimuovi ' + m.name"><ui-icon name="x" [size]="15" /></button> }
            </li>
          } @empty { <li class="muted empty">Nessuno assegnato. I Collaboratori vedono solo le commesse a cui sono assegnati.</li> }
        </ul>
      </section>

      <section class="card">
        <div class="card-header"><h2>Imprese</h2>
          @if (canManage()) { <button class="btn btn-outline btn-sm" (click)="openContractor()"><ui-icon name="plus" [size]="14" /> Aggiungi</button> }
        </div>
        <ul class="list">
          @for (c of contractors(); track c.id) {
            <li>
              <span class="avatar sq"><ui-icon name="building" [size]="15" /></span>
              <span class="grow"><b>{{ c.name }}</b>
                <span class="muted small">{{ contractorLine(c) }}</span></span>
              @if (canManage()) { <button class="btn btn-ghost btn-icon" (click)="unlink(c)" [attr.aria-label]="'Scollega ' + c.name"><ui-icon name="x" [size]="15" /></button> }
            </li>
          } @empty { <li class="muted empty">Nessuna impresa collegata. Le imprese ricevono le disposizioni dei verbali.</li> }
        </ul>
      </section>
    </div>

    <ui-dialog [open]="assignOpen()" title="Assegna alla commessa" [width]="480" (closed)="assignOpen.set(false)">
      <div class="field"><label for="as-m">Persona</label>
        <select id="as-m" class="select" [value]="assignMember()" (change)="assignMember.set(val($event))">
          <option value="">Scegli…</option>
          @for (m of assignable(); track m.membershipId) { <option [value]="m.membershipId" [selected]="m.membershipId === assignMember()">{{ m.name }} ({{ m.email }})</option> }
        </select>
        @if (!assignable().length) { <span class="hint">Tutti i membri attivi sono già assegnati. Invita colleghi da Impostazioni › Team.</span> }
      </div>
      <div class="field"><label for="as-r">Ruolo</label>
        <select id="as-r" class="select" [value]="assignRole()" (change)="assignRole.set($any(val($event)))">
          @for (r of roles; track r) { <option [value]="r" [selected]="r === assignRole()">{{ roleLabel[r] }}</option> }
        </select>
        @if (assignRole() === 'SITE_DIRECTOR' && hasDirector()) { <span class="hint">Il Direttore dei lavori attuale verrà sostituito: ce ne può essere uno solo.</span> }
      </div>
      <div dialog-actions>
        <button class="btn btn-outline" (click)="assignOpen.set(false)">Annulla</button>
        <button class="btn btn-primary" [disabled]="!assignMember() || busy()" (click)="assign()">Assegna</button>
      </div>
    </ui-dialog>

    <ui-dialog [open]="contractorOpen()" title="Aggiungi impresa" [width]="560" (closed)="contractorOpen.set(false)">
      @if (catalog().length) {
        <div class="field"><label for="ct-ex">Impresa già in archivio</label>
          <select id="ct-ex" class="select" [value]="existing()" (change)="existing.set(val($event))">
            <option value="">Nuova impresa…</option>
            @for (c of catalog(); track c.id) { <option [value]="c.id" [selected]="c.id === existing()">{{ c.name }}</option> }
          </select>
        </div>
      }
      @if (!existing()) {
        <div class="field"><label for="ct-n">Ragione sociale</label><input id="ct-n" class="input" [value]="draft().name" (input)="patch({ name: val($event) })" /></div>
        <div class="grid grid-2">
          <div class="field"><label for="ct-v">Partita IVA</label><input id="ct-v" class="input mono" maxlength="11" [value]="draft().vatNumber" (input)="patch({ vatNumber: val($event) })" /></div>
          <div class="field"><label for="ct-c">Categoria</label><input id="ct-c" class="input" placeholder="Es. edile, impianti elettrici" [value]="draft().category" (input)="patch({ category: val($event) })" /></div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label for="ct-r">Referente</label><input id="ct-r" class="input" [value]="draft().contactName" (input)="patch({ contactName: val($event) })" /></div>
          <div class="field"><label for="ct-t">Telefono</label><input id="ct-t" class="input" type="tel" [value]="draft().phone" (input)="patch({ phone: val($event) })" /></div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label for="ct-e">Email</label><input id="ct-e" class="input" type="email" [value]="draft().email" (input)="patch({ email: val($event) })" /></div>
          <div class="field"><label for="ct-p">PEC</label><input id="ct-p" class="input" type="email" [value]="draft().pec" (input)="patch({ pec: val($event) })" /></div>
        </div>
      }
      @if (error(); as e) { <div class="alert" role="alert">{{ e }}</div> }
      <div dialog-actions>
        <button class="btn btn-outline" (click)="contractorOpen.set(false)">Annulla</button>
        <button class="btn btn-primary" [disabled]="busy() || !canAddContractor()" (click)="addContractor()">Aggiungi</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .cols { grid-template-columns: 1fr 1fr; }
    @media (max-width: 960px) { .cols { grid-template-columns: 1fr; } }
    .list { list-style: none; margin: 0; padding: 6px 0; }
    .list li { display: flex; align-items: center; gap: 12px; padding: 10px 18px; }
    .empty { padding: 16px 18px; }
    .grow { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--primary-soft); color: var(--color-primary); font-size: 12px; font-weight: 600; flex: none; }
    .avatar.sq { border-radius: 8px; background: var(--surface-2); color: var(--ink-2); }
    .alert { padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13.5px; }
  `,
})
export class ProjectTeam {
  readonly projectId = input.required<string>();
  readonly team = input.required<TeamMember[]>();
  readonly contractors = input.required<Contractor[]>();
  readonly canManage = input(false);
  readonly changed = output<void>();

  private readonly api = inject(ProjectsApi);
  private readonly settings = inject(StudioSettingsApi);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly val = val;
  protected readonly date = fmtDate;
  protected readonly roleLabel = PROJECT_ROLE_LABEL;
  protected readonly roles = Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[];

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly assignOpen = signal(false);
  protected readonly members = signal<Member[]>([]);
  protected readonly assignMember = signal('');
  protected readonly assignRole = signal<ProjectRole>('DESIGNER');
  protected readonly hasDirector = computed(() => this.team().some((m) => m.projectRole === 'SITE_DIRECTOR'));
  protected readonly assignable = computed(() => {
    const assigned = new Set(this.team().map((m) => m.membershipId));
    return this.members().filter((m) => m.status === 'ACTIVE' && !assigned.has(m.membershipId));
  });

  protected readonly contractorOpen = signal(false);
  protected readonly catalog = signal<Contractor[]>([]);
  protected readonly existing = signal('');
  protected readonly draft = signal<ContractorInput>(EMPTY_CONTRACTOR);
  protected readonly canAddContractor = computed(() => !!this.existing() || this.draft().name.trim().length >= 2);

  protected initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  }

  protected contractorLine(c: Contractor): string {
    return [c.category, c.contactName, c.email ?? c.pec, c.phone].filter(Boolean).join(' · ') || '—';
  }

  protected patch(p: Partial<ContractorInput>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected async openAssign(): Promise<void> {
    this.assignMember.set('');
    this.assignRole.set(this.hasDirector() ? 'DESIGNER' : 'SITE_DIRECTOR');
    this.assignOpen.set(true);
    try {
      this.members.set(await this.settings.members());
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    }
  }

  protected async assign(): Promise<void> {
    await this.run(async () => {
      await this.api.assign(this.projectId(), this.assignMember(), this.assignRole());
      this.assignOpen.set(false);
    }, 'Assegnazione salvata');
  }

  protected async unassign(m: TeamMember): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Togliere ${m.name} dalla commessa?`,
      text: m.studioRole === 'COLLABORATOR' ? 'Essendo Collaboratore, non vedrà più la commessa.' : 'Resta nello storico delle assegnazioni.',
      confirmLabel: 'Togli', tone: 'danger',
    });
    if (ok) await this.run(() => this.api.unassign(this.projectId(), m.assignmentId), 'Assegnazione rimossa');
  }

  protected async openContractor(): Promise<void> {
    this.existing.set('');
    this.draft.set(EMPTY_CONTRACTOR);
    this.error.set(null);
    this.contractorOpen.set(true);
    try {
      const linked = new Set(this.contractors().map((c) => c.id));
      this.catalog.set((await this.api.contractors()).filter((c) => !linked.has(c.id)));
    } catch {
      this.catalog.set([]);
    }
  }

  protected async addContractor(): Promise<void> {
    this.error.set(null);
    await this.run(async () => {
      const id = this.existing() || (await this.api.createContractor(this.cleanDraft())).id;
      await this.api.linkContractor(this.projectId(), id);
      this.contractorOpen.set(false);
    }, 'Impresa collegata', true);
  }

  protected async unlink(c: Contractor): Promise<void> {
    const ok = await this.confirmer.ask({
      title: `Scollegare ${c.name}?`, text: 'L’impresa resta in archivio e si può ricollegare in seguito.', confirmLabel: 'Scollega',
    });
    if (ok) await this.run(() => this.api.unlinkContractor(this.projectId(), c.id), 'Impresa scollegata');
  }

  private cleanDraft(): ContractorInput {
    const d = this.draft();
    const clean = (s: string | null | undefined) => s?.trim() || null;
    return {
      name: d.name.trim(), vatNumber: clean(d.vatNumber), contactName: clean(d.contactName), phone: clean(d.phone),
      email: clean(d.email)?.toLowerCase() ?? null, pec: clean(d.pec)?.toLowerCase() ?? null, category: clean(d.category),
    };
  }

  private async run(action: () => Promise<unknown>, success: string, inline = false): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.toaster.show(success);
      this.changed.emit();
    } catch (e) {
      const message = toApiError(e).userMessage;
      if (inline) this.error.set(message);
      else this.toaster.show(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }
}
