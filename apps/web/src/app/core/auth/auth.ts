import { Injectable, computed, signal } from '@angular/core';

/** Sessione utente. Mock locale finché non arriva Supabase Auth (ADR-003). */
export interface Session {
  email: string;
  name: string;
}

const STORAGE_KEY = 'aph.session';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly state = signal<Session | null>(this.restore());

  readonly session = this.state.asReadonly();
  readonly isAuthenticated = computed(() => this.state() !== null);
  readonly initials = computed(() => {
    const name = this.state()?.name ?? '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  });

  login(email: string): void {
    const local = email.split('@')[0] ?? 'utente';
    const name = local
      .split(/[._-]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    const session = { email, name };
    this.state.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }

  logout(): void {
    this.state.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  private restore(): Session | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
}
