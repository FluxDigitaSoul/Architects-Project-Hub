import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    // Magic Link del committente: si scambia con la sessione e si passa a /portale (AFU FR-M1-05).
    path: 'p/:token',
    loadComponent: () => import('./features/portal/portal-entry').then((m) => m.PortalEntry),
  },
  {
    // Portale del committente, fuori dall'area dello studio (sessione con cookie, BR-25).
    path: 'portale',
    loadComponent: () => import('./features/portal/portal-shell').then((m) => m.PortalShell),
    children: [
      { path: '', loadComponent: () => import('./features/portal/portal-home').then((m) => m.PortalHome) },
      {
        path: 'tavole/:versionId',
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
        path: 'commesse/:id/sopralluoghi/:visitId',
        loadComponent: () => import('./features/field/field-visit').then((m) => m.FieldVisit),
      },
      {
        path: 'documenti',
        loadComponent: () => import('./features/documents/documents-page').then((m) => m.DocumentsPage),
      },
      {
        path: 'impostazioni',
        loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
