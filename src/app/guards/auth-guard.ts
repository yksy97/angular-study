import { inject } from '@angular/core';
import {
  CanActivateFn,
  CanMatchFn,
  Router,
  UrlTree,
  ActivatedRouteSnapshot,
  Route,
  RouterStateSnapshot,
  UrlSegment,
} from '@angular/router';
import { AuthService, Role } from '../services/auth.service';

type GuardDecision = boolean | UrlTree;

function redirectToLogin(router: Router, returnUrl?: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: returnUrl ? { returnUrl } : undefined,
  });
}

function redirectToHome(router: Router): UrlTree {
  return router.createUrlTree(['/home']);
}

function getRequiredRoleFromActivate(route: ActivatedRouteSnapshot): Role | null {
  return (route.data?.['requiredRole'] as Role | undefined) ?? null;
}

function getRequiredRoleFromMatch(route: Route): Role | null {
  return (route.data?.['requiredRole'] as Role | undefined) ?? null;
}

/**
 * ルーティング遷移（canActivate）用
 * - 未ログイン → /login へリダイレクト
 * - role 不一致 → /home へリダイレクト
 */
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): GuardDecision => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loggedIn()) {
    return redirectToLogin(router, state.url);
  }

  const requiredRole = getRequiredRoleFromActivate(route);
  if (requiredRole && auth.role() !== requiredRole) {
    return redirectToHome(router);
  }

  return true;
};

/**
 * lazy route のマッチング段階（canMatch）用
 * - 画面表示の前にルート自体をマッチさせない（より早い段階）
 * - 未ログイン → /login
 * - role 不一致 → /home
 *
 * ※ canMatch を使うなら routes 側で canMatch: [authMatchGuard] を設定
 */
export const authMatchGuard: CanMatchFn = (route: Route, segments: UrlSegment[]): GuardDecision => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loggedIn()) {
    const url = '/' + segments.map((s) => s.path).join('/');
    return redirectToLogin(router, url === '/' ? undefined : url);
  }

  const requiredRole = getRequiredRoleFromMatch(route);
  if (requiredRole && auth.role() !== requiredRole) {
    return redirectToHome(router);
  }

  return true;
};
