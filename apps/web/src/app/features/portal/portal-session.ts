import { Injectable, computed, inject, signal } from '@angular/core';
import { type ApiError, toApiError } from '../../core/api/api';
import { type PortalContext, PortalApi } from '../../core/api/portal-api';
import { TenantContext } from '../../core/tenant/tenant-context';

const SLUG_KEY = 'aph.portal.slug';

export type PortalState = 'loading' | 'ready' | 'signed-out' | 'error';

function remember(slug: string): void {
  try {
    localStorage.setItem(SLUG_KEY, slug);
  } catch {
    /* storage non disponibile */
  }
}

export function rememberedStudio(): string | null {
  try {
    return localStorage.getItem(SLUG_KEY);
  } catch {
    return null;
  }
}

/**
 * Sessione del committente nel portale (AFU FR-M1-05, BR-25): contesto della commessa,
 * marchio dello studio applicato all'interfaccia (NFR-BRAND-02) e presa visione della privacy.
 */
@Injectable({ providedIn: 'root' })
export class PortalSession {
  private readonly api = inject(PortalApi);
  private readonly tenant = inject(TenantContext);

  private readonly ctx = signal<PortalContext | null>(null);
  readonly state = signal<PortalState>('loading');
  readonly error = signal<ApiError | null>(null);

  readonly context = this.ctx.asReadonly();
  readonly firstName = computed(() => this.ctx()?.contact.name.split(/\s+/)[0] ?? '');
  readonly readOnly = computed(() => this.ctx()?.readOnly ?? true);

  /** Scambia il Magic Link con la sessione. Restituisce false se il link non è valido. */
  async open(token: string): Promise<boolean> {
    this.state.set('loading');
    try {
      this.apply(await this.api.open(token));
      return true;
    } catch (e) {
      this.fail(toApiError(e));
      return false;
    }
  }

  /** Riprende la sessione dal cookie (es. ricarica della pagina). */
  async load(): Promise<void> {
    if (this.ctx()) return;
    this.state.set('loading');
    try {
      this.apply(await this.api.context());
    } catch (e) {
      this.fail(toApiError(e));
    }
  }

  async acknowledgePrivacy(): Promise<void> {
    await this.api.acknowledgePrivacy();
    this.ctx.update((c) => (c ? { ...c, contact: { ...c.contact, privacyAcknowledged: true } } : c));
  }

  async signOut(): Promise<void> {
    await this.api.close().catch(() => undefined);
    this.ctx.set(null);
    this.state.set('signed-out');
  }

  private apply(ctx: PortalContext): void {
    this.ctx.set(ctx);
    this.error.set(null);
    this.state.set('ready');
    remember(ctx.studio.slug);
    // Solo aspetto: colore e logo dello studio sul portale (nessun accesso ai dati dello studio).
    this.tenant.update({ studioName: ctx.studio.name, primaryColor: ctx.studio.primaryColor, logoDataUrl: ctx.studio.logoUrl });
  }

  private fail(error: ApiError): void {
    this.ctx.set(null);
    this.error.set(error);
    // 401/404: nessuna sessione o link non valido → si chiede un nuovo link; il resto è un errore temporaneo.
    this.state.set(error.status === 401 || error.status === 404 || error.code === 'LINK_INVALID' ? 'signed-out' : 'error');
  }
}
