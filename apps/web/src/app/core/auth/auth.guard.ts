import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { toApiError } from '../api/api';
import { TenantContext } from '../tenant/tenant-context';
import { Auth } from './auth';

/**
 * Area dello studio: serve un utente autenticato (FR-MT-01) e uno studio scelto (FR-MT-03).
 * Senza studi si va all'attivazione (FR-M6-02); con uno studio l'onboarding non serve più.
 */
export const authGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth);
  const tenant = inject(TenantContext);
  const router = inject(Router);
  await auth.init();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  const isOnboarding = route.routeConfig?.path === 'onboarding';
  try {
    const tenants = await tenant.load();
    const first = tenants[0];
    if (!first) return isOnboarding ? true : router.createUrlTree(['/onboarding']);
    if (isOnboarding) return router.createUrlTree(['/']);
    // Più studi e nessuno ricordato: si apre il primo, poi si cambia dal menu (FR-MT-03).
    if (!tenant.isConfigured()) await tenant.select(first.slug);
    return true;
  } catch (e) {
    const err = toApiError(e);
    // Senza rete e senza copia locale dello studio la sessione resta valida: la pagina mostra
    // "Connessione non disponibile" e si riprova al ritorno della rete (FR-M4-14).
    if (err.status === 0 || err.status >= 500) return true;
    // Token scaduto o revocato: si torna al login con uno stato pulito.
    tenant.reset();
    await auth.logout();
    return router.createUrlTree(['/login']);
  }
};

/** Pagine per chi non è autenticato (login e registrazione). */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.init();
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
