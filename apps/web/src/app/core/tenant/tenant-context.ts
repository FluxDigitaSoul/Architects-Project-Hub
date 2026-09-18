import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

/** Branding del tenant (AFU FR-M0-02..04). Persistito localmente finché il BE non espone /public/tenant-context. */
export interface Branding {
  studioName: string;
  slug: string;
  primaryColor: string;
  logoDataUrl: string | null;
}

const STORAGE_KEY = 'aph.tenant';
const DEFAULT_BRANDING: Branding = {
  studioName: '',
  slug: '',
  primaryColor: '#0f172a',
  logoDataUrl: null,
};

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

@Injectable({ providedIn: 'root' })
export class TenantContext {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<Branding>(this.restore());

  readonly branding = this.state.asReadonly();
  readonly isConfigured = computed(() => this.state().slug.length > 0);
  readonly initials = computed(() => {
    const name = this.state().studioName.trim();
    if (!name) return 'PH';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  });

  constructor() {
    effect(() => {
      const { primaryColor } = this.state();
      const root = this.document.documentElement;
      root.style.setProperty('--color-primary', primaryColor);
      root.style.setProperty('--color-primary-contrast', contrastFor(primaryColor));
    });
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
      } catch {
        /* storage non disponibile: il branding resta in memoria */
      }
    });
  }

  update(patch: Partial<Branding>): void {
    this.state.update((b) => ({ ...b, ...patch }));
  }

  reset(): void {
    this.state.set(DEFAULT_BRANDING);
  }

  private restore(): Branding {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_BRANDING;
      return { ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<Branding>) };
    } catch {
      return DEFAULT_BRANDING;
    }
  }
}
