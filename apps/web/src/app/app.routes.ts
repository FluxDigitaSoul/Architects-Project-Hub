import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    // Portale del committente: accesso con Magic Link, fuori dall'area dello studio (AFU FR-M1-05).
    path: 'p/:token',
    loadComponent: () => import('./features/portal/portal-shell').then((m) => m.PortalShell),
    children: [
      { path: '', loadComponent: () => import('./features/portal/portal-home').then((m) => m.PortalHome) },
      {
        path: 'tavole/:drawingId',
        loadComponent: () => import('./features/portal/portal-drawing').then((m) => m.PortalDrawing),
      },
    ],
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'commesse',
        loadComponent: () => import('./features/projects/projects-list').then((m) => m.ProjectsList),
      },
      {
        path: 'commesse/:id',
        loadComponent: () =>
          import('./features/projects/project-detail').then((m) => m.ProjectDetail),
      },
      {
        path: 'commesse/:id/rai',
        loadComponent: () => import('./features/rai/rai-editor').then((m) => m.RaiEditor),
      },
      {
        path: 'commesse/:id/tavole/:drawingId',
        loadComponent: () => import('./features/review/drawing-review').then((m) => m.DrawingReview),
      },
      {
        path: 'cantiere',
        loadComponent: () => import('./features/field/field-list').then((m) => m.FieldList),
      },
      {
        path: 'cantiere/:id',
        loadComponent: () => import('./features/field/field-visit').then((m) => m.FieldVisit),
      },
      {
        path: 'impostazioni',
        loadComponent: () => import('./features/settings/branding').then((m) => m.BrandingSettings),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
