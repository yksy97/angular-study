// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Tickets } from './pages/tickets/tickets';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },

  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'home', component: Home },

      // 問い合わせ
      { path: 'tickets', component: Tickets },
      {
        path: 'tickets/new',
        loadComponent: () => import('./pages/ticket-new/ticket-new').then((m) => m.TicketNew),
      },
      {
        path: 'tickets/:id',
        loadComponent: () =>
          import('./pages/ticket-detail/ticket-detail').then((m) => m.TicketDetail),
      },

      // 管理者（直リンクでCSV取り込みへ）
      {
        path: 'admin/import',
        loadComponent: () => import('./pages/admin-import/admin-import').then((m) => m.AdminImport),
        data: { requiredRole: 'admin' },
      },
    ],
  },
];
