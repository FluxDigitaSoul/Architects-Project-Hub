import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { RaiApi, type RaiSnapshot } from '../../core/api/rai-api';
import { fmtDateTime } from '../../core/data/format';
import { Confirmer } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Toaster } from '../../shared/ui/toast';

/**
 * Revisioni del calcolo (AFU FR-M3-16, BR-21): fotografie immutabili di input ed esiti da cui si
 * generano la relazione asseverata (RAI_REPORT) o il report di verifica (RAI_CHECK).
 */
@Component({
  selector: 'app-rai-snapshots',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header"><h3>Revisioni emesse</h3>
        @if (canEmit()) { <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="emit()"><ui-icon name="lock" [size]="14" /> Emetti revisione</button> }
      </div>
      <ul class="list">
        @for (s of list.value() ?? []; track s.id) {
          <li>
            <div class="row-between"><b>Rev. {{ s.revision }}</b><span class="muted small">{{ dt(s.createdAt) }}</span></div>
            @if (s.reason) { <p class="small">{{ s.reason }}</p> }
            @if (s.summary; as sum) {
              <div class="small muted">{{ sum.rooms }} vani · {{ sum.counts.COMPLIANT }} conformi · {{ sum.counts.NON_COMPLIANT }} non conformi · {{ sum.counts.SUBJECT_TO_ATTESTATION }} da asseverare</div>
            }
            @if (canEmit()) {
              <div class="row acts">
                <button class="btn btn-outline btn-sm" [disabled]="busy()" (click)="report(s, 'RAI_REPORT')"><ui-icon name="file" [size]="14" /> Relazione asseverata</button>
                <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="report(s, 'RAI_CHECK')">Report di verifica</button>
              </div>
            }
          </li>
        } @empty {
          <li class="muted small">Nessuna revisione. Quando il calcolo è completo, emetti la Rev. 0: è la base della relazione per CILA/SCIA.</li>
        }
      </ul>
    </div>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { padding: 12px 16px; border-bottom: 1px solid var(--line); display: grid; gap: 6px; }
    .list li:last-child { border-bottom: 0; }
    .list p { margin: 0; white-space: pre-wrap; }
    .acts { gap: 6px; flex-wrap: wrap; }
  `,
})
export class RaiSnapshots {
  readonly projectId = input.required<string>();
  readonly canEmit = input(false);

  private readonly api = inject(RaiApi);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly confirmer = inject(Confirmer);
  protected readonly dt = fmtDateTime;
  protected readonly busy = signal(false);
  protected readonly list = resource({ params: () => this.projectId(), loader: ({ params }) => this.api.snapshots(params) });
  private readonly nextRevision = computed(() => (this.list.value()?.[0]?.revision ?? -1) + 1);

  protected async emit(): Promise<void> {
    const rev = this.nextRevision();
    const result = await this.confirmer.ask({
      title: `Emettere la Rev. ${rev}?`,
      text: 'La revisione fotografa dati ed esiti attuali e non si può più modificare. Le modifiche successive richiederanno una nuova revisione.',
      confirmLabel: 'Emetti',
      input: rev > 0 ? { label: 'Motivo della revisione', minLength: 5, placeholder: 'Es. Aggiornate le aperture del soggiorno dopo il rilievo.' } : undefined,
    });
    if (!result) return;
    await this.run(async () => {
      const s = await this.api.createSnapshot(this.projectId(), result.value || null);
      this.toaster.show(`Rev. ${s.revision} emessa`);
      this.list.reload();
    });
  }

  protected async report(s: RaiSnapshot, type: 'RAI_REPORT' | 'RAI_CHECK'): Promise<void> {
    await this.run(async () => {
      await this.api.generateReport(this.projectId(), s.id, type);
      this.toaster.show(type === 'RAI_REPORT' ? 'Relazione generata: firmala e inviala dai Documenti' : 'Report di verifica generato');
      await this.router.navigate(['/commesse', this.projectId()], { queryParams: { scheda: 'documenti' } });
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      const err = toApiError(e);
      const hint: Record<string, string> = {
        SIGNER_NOT_QUALIFIED: 'Per firmare la relazione completa ordine e numero di iscrizione nel tuo profilo (Impostazioni).',
        RAI_NOT_ATTESTABLE: 'Ci sono vani non conformi o incompleti: la relazione asseverata non si può emettere. Genera il report di verifica.',
      };
      this.toaster.show(hint[err.code] ?? err.userMessage, 'danger', 7000);
    } finally {
      this.busy.set(false);
    }
  }
}
