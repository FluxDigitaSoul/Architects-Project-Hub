import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { toApiError } from '../../core/api/api';
import { ATTENDEE_KIND_LABEL, type Attendee, type AttendeeKind } from '../../core/api/field-api';
import { FieldOps } from '../../core/field/field-ops';
import type { ProjectDetail } from '../../core/api/projects-api';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';
import { val } from '../../shared/dom';

interface Suggestion extends Attendee {
  key: string;
}

/**
 * Presenti al sopralluogo (AFU FR-M4-04): persone dello studio, committenti, imprese o altri.
 * Il Direttore dei Lavori deve essere tra i presenti per finalizzare il verbale.
 */
@Component({
  selector: 'app-visit-attendees',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header"><h3>Presenti</h3>
        @if (dirty() && !readOnly()) { <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="save()">Salva presenti</button> }
      </div>
      <ul class="list">
        @for (a of list(); track $index; let i = $index) {
          <li>
            <span class="kind badge badge-plain">{{ kindLabel[a.kind] }}</span>
            <span class="grow"><b>{{ a.name }}</b>@if (a.qualification || a.organization) { <span class="muted small"> · {{ detail(a) }}</span> }</span>
            <label class="dl small"><input type="radio" name="director" [checked]="a.isDirector" [disabled]="readOnly()" (change)="setDirector(i)" /> DL</label>
            @if (!readOnly()) { <button class="btn btn-ghost btn-icon" (click)="remove(i)" [attr.aria-label]="'Rimuovi ' + a.name"><ui-icon name="x" [size]="14" /></button> }
          </li>
        } @empty { <li class="muted small">Nessun presente indicato.</li> }
      </ul>
      @if (!readOnly()) {
        <div class="add">
          @if (available().length) {
            <select class="select select-sm" (change)="pick(val($event)); $any($event.target).value = ''" aria-label="Aggiungi dalla commessa">
              <option value="">Aggiungi dalla commessa…</option>
              @for (s of available(); track s.key) { <option [value]="s.key">{{ s.name }} ({{ kindLabel[s.kind] }})</option> }
            </select>
          }
          <div class="free">
            <input class="input input-sm" placeholder="Altra persona (nome e cognome)" maxlength="150" [value]="freeName()" (input)="freeName.set(val($event))" (keydown.enter)="addFree()" />
            <input class="input input-sm" placeholder="Ruolo / ente" maxlength="150" [value]="freeOrg()" (input)="freeOrg.set(val($event))" (keydown.enter)="addFree()" />
            <button class="btn btn-outline btn-sm" [disabled]="!freeName().trim()" (click)="addFree()" aria-label="Aggiungi"><ui-icon name="plus" [size]="14" /></button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 4px 0; }
    .list li { display: flex; gap: 10px; align-items: center; padding: 8px 16px; }
    .grow { flex: 1; min-width: 0; }
    .kind { flex: none; }
    .dl { display: flex; gap: 4px; align-items: center; color: var(--muted); }
    .add { display: grid; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); }
    .free { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; }
    @media (max-width: 560px) { .free { grid-template-columns: 1fr; } }
  `,
})
export class VisitAttendees {
  readonly projectId = input.required<string>();
  readonly visitId = input.required<string>();
  readonly attendees = input.required<Attendee[]>();
  readonly project = input<ProjectDetail | null>(null);
  readonly readOnly = input(false);
  readonly changed = output<void>();

  private readonly ops = inject(FieldOps);
  private readonly toaster = inject(Toaster);
  protected readonly val = val;
  protected readonly kindLabel = ATTENDEE_KIND_LABEL;

  protected readonly list = linkedSignal<Attendee[]>(() => this.attendees().map((a) => ({ ...a })));
  protected readonly dirty = signal(false);
  protected readonly busy = signal(false);
  protected readonly freeName = signal('');
  protected readonly freeOrg = signal('');

  private readonly suggestions = computed<Suggestion[]>(() => {
    const p = this.project();
    if (!p) return [];
    const team: Suggestion[] = p.team.map((m) => ({
      key: `m:${m.membershipId}`, kind: 'MEMBER' as AttendeeKind, refId: m.membershipId, name: m.name,
      qualification: m.projectRole === 'SITE_DIRECTOR' ? 'Direttore dei Lavori' : null, organization: null, isDirector: false,
    }));
    const clients: Suggestion[] = p.contacts.map((c) => ({
      key: `c:${c.id}`, kind: 'CLIENT' as AttendeeKind, refId: c.id, name: c.displayName, qualification: 'Committente', organization: null, isDirector: false,
    }));
    const contractors: Suggestion[] = p.contractors.map((c) => ({
      key: `i:${c.id}`, kind: 'CONTRACTOR' as AttendeeKind, refId: c.id, name: c.contactName ?? c.name,
      qualification: c.category, organization: c.name, isDirector: false,
    }));
    return [...team, ...clients, ...contractors];
  });
  protected readonly available = computed(() => {
    const used = new Set(this.list().map((a) => `${a.kind}:${a.refId ?? ''}`));
    return this.suggestions().filter((s) => !used.has(`${s.kind}:${s.refId ?? ''}`));
  });

  protected detail(a: Attendee): string {
    return [a.qualification, a.organization].filter(Boolean).join(' · ');
  }

  protected pick(key: string): void {
    const s = this.suggestions().find((x) => x.key === key);
    if (!s) return;
    const attendee: Attendee = { kind: s.kind, refId: s.refId, name: s.name, qualification: s.qualification, organization: s.organization, isDirector: false };
    const directorId = this.project()?.team.find((m) => m.projectRole === 'SITE_DIRECTOR')?.membershipId;
    const isDirector = attendee.kind === 'MEMBER' && attendee.refId === directorId && !this.list().some((a) => a.isDirector);
    this.update([...this.list(), { ...attendee, isDirector }]);
  }

  protected addFree(): void {
    const name = this.freeName().trim();
    if (!name) return;
    this.update([...this.list(), { kind: 'OTHER', name, organization: this.freeOrg().trim() || null, isDirector: false }]);
    this.freeName.set('');
    this.freeOrg.set('');
  }

  protected remove(i: number): void {
    this.update(this.list().filter((_, j) => j !== i));
  }

  protected setDirector(i: number): void {
    this.update(this.list().map((a, j) => ({ ...a, isDirector: j === i })));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.ops.enqueue({ kind: 'set-attendees', projectId: this.projectId(), visitId: this.visitId(), attendees: this.list() });
      this.dirty.set(false);
      this.toaster.show(navigator.onLine ? 'Presenti salvati' : 'Presenti salvati sul telefono: partono appena torna la rete');
      this.changed.emit();
    } catch (e) {
      this.toaster.show(toApiError(e).userMessage, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private update(list: Attendee[]): void {
    this.list.set(list);
    this.dirty.set(true);
  }
}
