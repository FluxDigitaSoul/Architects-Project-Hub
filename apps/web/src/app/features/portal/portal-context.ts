import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectsStore } from '../../core/data/projects-store';

/**
 * Contesto del portale del committente, risolto dal token del Magic Link (AFU FR-M1-05, BR-25).
 * Fornito da PortalShell: ogni istanza del portale ha il proprio contesto.
 */
@Injectable()
export class PortalContext {
  private readonly store = inject(ProjectsStore);
  readonly token = signal<string>('');

  readonly contact = computed(() => this.store.contactByToken(this.token()));
  readonly project = computed(() => {
    const c = this.contact();
    return c ? this.store.byId(c.projectId)() : null;
  });

  /** BR-25: il committente vede solo le tavole pubblicate o approvate, mai le bozze. */
  readonly drawings = computed(() => {
    const p = this.project();
    if (!p) return [];
    return this.store.drawingsOf(p.id)().filter((d) => d.status === 'PUBLISHED' || d.status === 'APPROVED');
  });

  readonly firstName = computed(() => this.contact()?.name.split(' ')[0] ?? '');
}
