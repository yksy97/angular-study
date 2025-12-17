import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router, UrlTree } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';

/**
 * Guard（認証・認可）
 * - 遷移の入口で「入ってよいか」を判定する
 * - UI を直接触らない（表示は Component の責務）
 *
 * 設計：
 * - 認証状態の真実の情報源は AuthService
 * - routes 側は data.requiredRoles に要件を宣言し、Guard は解釈だけを行う
 */
type GuardRoute = { data?: Record<string, unknown> };

/**
 * routes の data.requiredRoles は「宣言（いつ、どの処理を呼ぶか）」であり、
 * Guard はそれを解釈して認可判定するだけに徹する。
 *
 * 注意：data は unknown で入ってくるため、ここで型安全に絞り込む。
 */
const readRequiredRoles = (route: GuardRoute): Role[] | null => {
  const v = route.data?.['requiredRoles'];
  if (!v) return null;
  if (!Array.isArray(v)) return null;
  // 文字列配列かつ Role として扱えるかを確認（学習用途として最低限）
  if (!v.every((x) => typeof x === 'string')) return null;
  return v as Role[];
};

const authorize = (auth: AuthService, router: Router, route: GuardRoute): boolean | UrlTree => {
  // Guard が「実際に呼ばれているか」を確実に確認するためのログ
  // - まずはこのログが出ることを最優先の確認ポイントにする
  // - Extension のエラー（chrome-extension://...）とは別枠なので混同しない
  console.info('[auth-guard] authorize() called', {
    loggedIn: auth.isLoggedIn(),
    role: auth.getRole(),
    requiredRoles: readRequiredRoles(route) ?? route.data?.['requiredRoles'],
  });
  // 1) 認証：未ログインなら login へ
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }

  // 2) 認可：requiredRoles が未指定（または形式不正）なら「ログイン済みならOK」
  // ※ 形式不正を厳密に弾きたい場合は true ではなく /home に飛ばす設計もあり得る
  const requiredRoles = readRequiredRoles(route);
  if (!requiredRoles) {
    return true;
  }

  // requiredRoles が配列で、現在 role を含むか判定する
  const role = auth.getRole();
  console.info('[auth-guard] authorize() role check', {
    role,
    requiredRoles,
    loggedIn: auth.isLoggedIn(),
  });
  if (!role || !requiredRoles.includes(role)) {
    return router.parseUrl('/home');
  }

  return true;
};

export const authGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  console.info('[auth-guard] authGuard (CanActivate) invoked', {
    url: state.url,
    requiredRoles: readRequiredRoles(route) ?? route.data?.['requiredRoles'],
  });
  const auth = inject(AuthService);
  const router = inject(Router);
  return authorize(auth, router, route);
};

export const authChildGuard: CanActivateChildFn = (childRoute, state): boolean | UrlTree => {
  console.info('[auth-guard] authChildGuard (CanActivateChild) invoked', {
    url: state.url,
    requiredRoles: readRequiredRoles(childRoute) ?? childRoute.data?.['requiredRoles'],
  });
  const auth = inject(AuthService);
  const router = inject(Router);
  return authorize(auth, router, childRoute);
};
