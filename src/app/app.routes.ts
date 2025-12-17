import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Admin } from './pages/admin/admin';
import { authChildGuard } from './guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // 誰でも入れる：ログイン画面
  { path: 'login', component: Login },

  // ログイン後の画面群：まとめてアクセス制御する
  {
    path: '',
    canActivateChild: [authChildGuard],
    children: [
      { path: 'home', component: Home },
      {
        path: 'admin',
        component: Admin,
        data: { requiredRoles: ['admin'] },
      },
    ],
  },
];
