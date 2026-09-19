import { Injectable, computed, inject, signal } from '@angular/core';
import { type AuthError, AuthClient, type Session as SupabaseSession } from '@supabase/auth-js';
import { environment } from '../../../environments/environment';
import { ApiSession } from '../api/api';

/** Utente dello studio autenticato con Supabase Auth (ADR-003, FR-MT-01/02). */
export interface Session {
  userId: string;
  email: string;
  name: string;
}

/** Messaggi in italiano per gli errori più comuni di Supabase Auth. */
function authMessage(error: AuthError): string {
  const code = error.code ?? '';
  if (code === 'invalid_credentials') return 'Email o password non corretti.';
  if (code === 'email_not_confirmed') return 'Conferma prima l’indirizzo email: ti abbiamo inviato un link.';
  if (code === 'user_already_exists') return 'Esiste già un account con questa email: accedi.';
  if (code === 'weak_password') return 'La password è troppo debole: usa almeno 8 caratteri con lettere e numeri.';
  if (code === 'over_request_rate_limit' || error.status === 429) return 'Troppi tentativi. Riprova tra qualche minuto.';
  return 'Accesso non riuscito. Riprova.';
}

function toSession(s: SupabaseSession | null): Session | null {
  if (!s?.user) return null;
  const email = s.user.email ?? '';
  const meta = s.user.user_metadata as { full_name?: string; first_name?: string; last_name?: string } | undefined;
  const fromMeta = meta?.full_name ?? [meta?.first_name, meta?.last_name].filter(Boolean).join(' ');
  const fromEmail = (email.split('@')[0] ?? 'utente').split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return { userId: s.user.id, email, name: fromMeta || fromEmail };
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(ApiSession);
  /** Solo il client di Auth: il resto di Supabase lo usa l'API, non il browser (bundle iniziale più leggero). */
  private readonly client = new AuthClient({
    url: `${environment.supabaseUrl}/auth/v1`,
    headers: { apikey: environment.supabasePublishableKey, Authorization: `Bearer ${environment.supabasePublishableKey}` },
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'aph.auth',
  });
  private readonly state = signal<Session | null>(null);
  private ready: Promise<void> | null = null;

  readonly session = this.state.asReadonly();
  readonly isAuthenticated = computed(() => this.state() !== null);
  readonly initials = computed(() =>
    (this.state()?.name ?? '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join(''),
  );

  /** Ripristina la sessione salvata e segue i rinnovi del token (una volta sola, all'avvio). */
  init(): Promise<void> {
    this.ready ??= (async () => {
      const { data } = await this.client.getSession();
      this.apply(data.session);
      this.client.onAuthStateChange((_event, session) => this.apply(session));
    })();
    return this.ready;
  }

  private apply(session: SupabaseSession | null): void {
    this.api.accessToken.set(session?.access_token ?? null);
    this.state.set(toSession(session));
  }

  async login(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const { data, error } = await this.client.signInWithPassword({ email, password });
    if (error) return { ok: false, message: authMessage(error) };
    this.apply(data.session);
    return { ok: true };
  }

  /** Registrazione self-service (FR-M6-01). Se Supabase richiede la conferma email, la sessione arriva dopo il click. */
  async signUp(
    email: string, password: string, firstName: string, lastName: string,
  ): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; message: string }> {
    const { data, error } = await this.client.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName }, emailRedirectTo: `${location.origin}/onboarding` },
    });
    if (error) return { ok: false, message: authMessage(error) };
    this.apply(data.session);
    return { ok: true, needsConfirmation: !data.session };
  }

  async resetPassword(email: string): Promise<void> {
    await this.client.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
  }

  async logout(): Promise<void> {
    await this.client.signOut();
    this.apply(null);
  }
}
