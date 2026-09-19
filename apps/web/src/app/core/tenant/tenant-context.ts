import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Api, ApiSession } from '../api/api';

/** Branding del tenant applicato all'interfaccia (AFU FR-M0-03/04). */
export interface Branding {
  studioName: string;
  slug: string;
  primaryColor: string;
  /** URL del logo (firmato, temporaneo) oppure data URL durante un'anteprima locale. */
  logoDataUrl: string | null;
}

export type StudioRole = 'OWNER' | 'ARCHITECT' | 'COLLABORATOR';

export interface Membership {
  tenantId: string;
  slug: string;
  name: string;
  role: StudioRole;
}

export interface StudioContextInfo {
  tenant: { id: string; slug: string; name: string };
  role: StudioRole;
  plan: {
    planCode: string;
    status: string;
    trialEndsAt: string | null;
    entitlements: { limits: Record<string, number | null>; features: Record<string, boolean> };
  };
  branding: { primaryColor: string; secondaryColor: string | null; portalTheme: string } | null;
}

export interface ProvisionInput {
  studioName: string;
  slug: string;
  firstName: string;
  lastName: string;
  acceptedTerms: true;
}

const SLUG_KEY = 'aph.tenant.slug';
const DEFAULT_BRANDING: Branding = { studioName: '', slug: '', primaryColor: '#0f172a', logoDataUrl: null };

/** Testo bianco o scuro secondo la luminanza (WCAG, FR-M0-04 regola 2). */
export function contrastFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1] as string, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return l > 0.4 ? '#0f172a' : '#ffffff';
}

function readSlug(): string | null {
  try {
    return localStorage.getItem(SLUG_KEY);
  } catch {
    return null;
  }
}

/**
 * Studio corrente (FR-MT-03): elenco degli studi dell'utente da /me, studio scelto, ruolo,
 * piano e branding da /studio/context. Il branding si applica ai token CSS dell'interfaccia.
 */
@Injectable({ providedIn: 'root' })
export class TenantContext {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(Api);
  private readonly session = inject(ApiSession);

  private readonly state = signal<Branding>(DEFAULT_BRANDING);
  private readonly memberships = signal<Membership[] | null>(null);
  private readonly info = signal<StudioContextInfo | null>(null);

  readonly branding = this.state.asReadonly();
  readonly tenants = this.memberships.asReadonly();
  readonly context = this.info.asReadonly();
  readonly role = computed(() => this.info()?.role ?? null);
  readonly isConfigured = computed(() => this.state().slug.length > 0);
  readonly canManage = computed(() => this.role() === 'OWNER' || this.role() === 'ARCHITECT');
  readonly isOwner = computed(() => this.role() === 'OWNER');
  readonly initials = computed(() => {
    const name = this.state().studioName.trim();
    if (!name) return 'PH';
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  });

  constructor() {
    effect(() => {
      const { primaryColor } = this.state();
      const root = this.document.documentElement;
      root.style.setProperty('--color-primary', primaryColor);
      root.style.setProperty('--color-primary-contrast', contrastFor(primaryColor));
    });
  }

  /** Carica gli studi dell'utente e apre quello ricordato (o l'unico disponibile). */
  async load(force = false): Promise<Membership[]> {
    const cached = this.memberships();
    if (cached && !force) return cached;
    const me = await this.api.get<{ tenants: Membership[] }>('/me');
    this.memberships.set(me.tenants);
    const remembered = readSlug();
    const target = me.tenants.find((t) => t.slug === remembered) ?? (me.tenants.length === 1 ? me.tenants[0] : undefined);
    if (target) await this.select(target.slug);
    else this.clear();
    return me.tenants;
  }

  /** FR-M6-02: crea lo studio (prova gratuita) e lo apre subito. */
  async provision(input: ProvisionInput): Promise<void> {
    const created = await this.api.post<{ tenantId: string; slug: string }>('/onboarding/tenants', input);
    this.remember(created.slug);
    await this.load(true);
    if (this.state().slug !== created.slug) await this.select(created.slug);
  }

  /** FR-MT-03: cambio di studio; nessun dato del precedente resta visibile (AC-FR-MT-03-1). */
  async select(slug: string): Promise<void> {
    this.session.tenantSlug.set(slug);
    this.remember(slug);
    const ctx = await this.api.get<StudioContextInfo>('/studio/context');
    this.info.set(ctx);
    this.state.set({
      studioName: ctx.tenant.name,
      slug: ctx.tenant.slug,
      primaryColor: ctx.branding?.primaryColor ?? DEFAULT_BRANDING.primaryColor,
      logoDataUrl: null,
    });
    const settings = await this.api.get<{ branding: { logos: Record<string, string | null> } }>('/studio/settings').catch(() => null);
    const logo = settings?.branding.logos['primary'] ?? null;
    if (logo) this.state.update((b) => ({ ...b, logoDataUrl: logo }));
  }

  /** Anteprima locale (es. mentre si modifica il branding); il salvataggio passa dalle API delle impostazioni. */
  update(patch: Partial<Branding>): void {
    this.state.update((b) => ({ ...b, ...patch }));
  }

  /** Pulisce lo stato (logout o cambio utente). */
  reset(): void {
    this.memberships.set(null);
    this.clear();
    try {
      localStorage.removeItem(SLUG_KEY);
    } catch {
      /* ignore */
    }
  }

  private remember(slug: string): void {
    try {
      localStorage.setItem(SLUG_KEY, slug);
    } catch {
      /* storage non disponibile: lo studio resta scelto solo in questa scheda */
    }
  }

  private clear(): void {
    this.info.set(null);
    this.session.tenantSlug.set(null);
    this.state.set(DEFAULT_BRANDING);
  }
}
