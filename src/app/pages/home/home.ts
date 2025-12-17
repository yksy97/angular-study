import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  imports: [NgIf, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /**
   * 認証状態は Service を真実の情報源（Source of Truth）として参照する。
   * Home は UI 表示の責務のみを持ち、role 判定は AuthService を読む。
   */
  private auth = inject(AuthService);
  private router = inject(Router);

  /** admin のみ管理者メニューを表示する */
  get isAdmin(): boolean {
    return this.auth.getRole() === 'admin';
  }

  /**
   * ログアウト処理
   * - 認証状態を Service 側で初期化する
   * - 未ログイン状態として /login に遷移する
   *
   * Guard と組み合わせることで、
   * ログアウト後に保護画面へ戻れないことを保証する。
   */
  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
