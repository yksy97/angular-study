import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common'; /* NgIf = 条件によって DOM を作る／消す（構造ディレクティブ）*/
import { HttpClientModule } from '@angular/common/http'; // Service側で HttpClient を使うため、アプリに提供する

// HTTP/認証ロジックを Service に切り出す
//  - Component は「UI専用」に近づける
//  - users.json の存在、HTTP取得、照合ロジックは Service に隠蔽する
import { AuthService, Role } from '../../services/auth.service'; //

@Component({
  selector: 'app-login',
  standalone: true /* standalone = Component が自立する宣言（Module不要）*/,
  imports: [FormsModule, NgIf, HttpClientModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  /**
   * DI（依存性注入）
   * - HttpClient は Service（AuthService）側に閉じ込める
   * - Component は AuthService を注入して「認証を依頼」するだけにする
   *
   * 目的：
   * - Component を UI状態管理に専念させる（実務構成に近づける）
   */
  constructor(private auth: AuthService) {}

  /**
   * ログイン画面の状態（UI状態管理）
   * - 入力値（テンプレと双方向バインディング）
   * - 認証結果（ログイン済みか／ユーザ種別）
   * - 表示制御に使うフラグ（submitting など）
   */

  /** 入力パラメータ（テンプレと双方向バインディング） */
  userId = '';
  password = '';

  /** ログイン中のユーザ種別（admin / user）。ログアウトで空に戻す */
  // Role 型（Serviceで定義）を利用して、UIに必要な最小情報だけを保持する
  role: Role | '' = '';

  /** UI状態管理（今の画面の状態） */
  submitting = false; // ログイン処理中か
  loginError = ''; // エラーメッセージ
  loggedIn = false; // ログイン成功フラグ

  async onLogin(): Promise<void> {
    // UI状態管理（処理開始時）
    this.submitting = true;
    this.loginError = '';
    this.loggedIn = false;

    try {
      /**
       * - Component は認証処理を Service に委譲する
       * - Component が知るのは「成功/失敗」と「role」だけ
       *
       * await
       * - async関数（onLogin）の続きを「待たせる」
       * - UI（画面）は止まらない
       *
       * Promise
       * - 将来の処理結果を1回だけ受け取る「箱」
       * - 成功（resolve）なら値が返り、失敗（reject）なら catch に進む
       * - users.json の場所・形式、HTTP取得、find() の照合ロジックは AuthService に隠蔽する
       */
      const role = await this.auth.login(this.userId, this.password);

      if (!role) {
        // ログインに失敗した場合
        this.loginError = 'ユーザIDまたはパスワードが違います';
        return;
      }

      // ユーザ種別を保持（admin / user）
      this.role = role;

      // ログインに成功した場合
      this.loggedIn = true;
    } catch {
      // Service 内での HTTP 失敗なども含めて、ここで UI 表示用に握りつぶす
      this.loginError = 'ユーザ情報の照合に失敗しました';
    } finally {
      // UI状態管理（処理終了時）
      this.submitting = false;
    }
  }

  // UI状態管理（ログアウト時）
  logout(): void {
    this.loggedIn = false;
    this.role = '';
    this.loginError = '';
    this.submitting = false;
    this.userId = '';
    this.password = '';
  }
}
