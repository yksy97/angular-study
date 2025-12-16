import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common'; /* NgIf = 条件によって DOM を作る／消す（構造ディレクティブ）*/
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
   * - HttpClient は new しない
   * - Angular が用意したインスタンスを受け取って使う
   */
  constructor(private http: HttpClient) {}

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
  role: 'admin' | 'user' | '' = '';

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
       * 静的JSONをHTTP GETで取得する
       *
       * await
       * - async関数（onLogin）の続きを「待たせる」
       * - UI（画面）は止まらない
       *
       * Promise
       * - 将来の処理結果を1回だけ受け取る「箱」
       * - 成功（resolve）なら値が返り、失敗（reject）なら catch に進む
       */
      const data = await this.http
        .get<{ users: { id: string; password: string; role: 'admin' | 'user' }[] }>(
          'assets/users.json'
        )
        .toPromise();

      /**
       * 入力値とJSONのユーザ情報を照合
       * some()
       * - 「認証できたか？」を（Yes/No）で返す
       *
       * find()
       * - 「誰としてログインしたか（ユーザ情報）」を1件返す
       *
       * (u) => ...
       * - アロー関数：配列要素（ユーザ1件）を u という仮名で受け取る
       *
       * data?.users
       * - オプショナルチェイニング：data が null/undefined なら users を読まず undefined を返す（null安全）
       */
      const user = data?.users.find((u) => u.id === this.userId && u.password === this.password);

      if (!user) {
        // ログインに失敗した場合
        this.loginError = 'ユーザIDまたはパスワードが違います';
        return;
      }

      // ユーザ種別を保持（admin / user）
      this.role = user.role;

      // ログインに成功した場合
      this.loggedIn = true;
    } catch {
      // JSONの取得が失敗（例外）
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
