import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { TenantContext } from '../tenant/tenant-context';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(Auth);
  const tenant = inject(TenantContext);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  const isOnboarding = route.routeConfig?.path === 'onboarding';
  if (!tenant.isConfigured() && !isOnboarding) return router.createUrlTree(['/onboarding']);
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
