import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * ユーザ種別
 * UI側（Component）に返す情報は roleだけ
 * → 認証結果としてUI側が知るべき情報のみを型として定義
 */
export type Role = 'admin' | 'user';

/**
 * JSON上のユーザ情報1件分の構造
 * → UI側（Component）には直接渡さない
 */
type User = {
  id: string;
  password: string;
  role: Role;
};

/**
 * users.json 全体の構造
 * {
 *   "users": [
 *     { "id": "...", "password": "...", "role": "..." }
 *   ]
 * }
 * の形をそのまま型として表現している。
 */
type UsersJson = {
  users: User[];
};

/**
 * 認証用 Service
 * 【この Service の責務】
 * ・HTTP通信（users.json の取得）
 * ・認証ロジック（ユーザID / パスワード照合）
 *
 * 【この Service がやらないこと】
 * ・UI状態管理（ログイン中、エラー表示など）
 * ・画面表示制御
 *
 * → Component を「UI専用」にするための分離
 */
@Injectable({
  providedIn: 'root', // アプリ全体で1インスタンスを共有
})
export class AuthService {
  /**
   * HttpClient を DI（依存性注入）で受け取る
   * ・new しない
   * ・Angular が管理する HttpClient を利用
   */
  constructor(private http: HttpClient) {}

  /**
   * 認証状態（Service側で保持する状態）
   *
   * なぜ Service に持たせるのか：
   * 以前は LoginComponent が
   * 「Service から返ってきた結果」を元に
   * loggedIn / role を判断していた。
   *
   * しかしその構造では、
   * ・LoginComponent の外（Home / Admin / Guard）から
   *   「いまログイン中か？」を判断できない
   * ・画面をまたいで認証状態を共有できない
   *
   * そのため、
   * 認証の成否・ユーザ種別という
   * 「アプリ全体で一意であるべき事実（真実の情報源）」を
   * Service に集約する。
   *
   * → Component は UI状態のみを持ち、
   * → 認証状態は Service が保証する、という責務分離。
   */
  private loggedIn = false;
  private currentRole: Role | null = null;

  /**
   * ログイン処理
   * @param userId 入力されたユーザID
   * @param password 入力されたパスワード
   *
   * @returns
   *   ・成功：ユーザ種別（admin / user）
   *   ・失敗：null
   *
   * ※ UI 側は「成功か失敗か」「どの role か」だけを知ればよいため、
   *    ユーザオブジェクト全体は返さない。
   */
  async login(userId: string, password: string): Promise<Role | null> {
    /**
     * Observable → Promise 変換
     * ・HttpClient.get() は Observable を返す
     * ・Observable は「値が流れ続ける可能性がある仕組み」
     * ・今回の認証処理では「1回の結果」だけで十分
     *
     * firstValueFrom：
     * ・Observable から最初に流れてきた値を1回だけ受け取る
     * ・受け取った時点で自動的に unsubscribe される
     * ・Promise として await できる
     *
     * → Service 内で RxJS の詳細を隠蔽し、
     *    Component 側では async / await だけで扱えるようにする
     */
    // 注意：users.json は public/ に置いているため、取得パスは /users.json（assets/ ではない）
    const data = await firstValueFrom(this.http.get<UsersJson>('/users.json'));

    /**
     * 入力された userId / password と一致するユーザを検索
     *
     * find():
     * ・条件に一致する最初の要素を返す
     * ・見つからなければ undefined
     *
     * (u) => ... :
     * ・users 配列の各要素（User）を u という仮名で受け取る
     * ・=== による厳密比較で照合
     */
    const user = data.users.find((u) => u.id === userId && u.password === password);

    if (user) {
      /*  【認証成功時の状態確定】
    ここで role を返すだけでなく、
    Service 自身の状態（loggedIn / currentRole）を確定させる。

    理由：
    ・Component 単体で判断すると、
    アプリ全体で認証状態を共有できないため
    ・Guard / Router / 他Component から
    同じ「真実の状態」を参照できるようにする
      ============================================ */
      this.loggedIn = true;
      this.currentRole = user.role;
      return user.role;
    }

    /*  【認証失敗時】
     状態は未ログインのままにする
    ============================================ */
    this.loggedIn = false;
    this.currentRole = null;
    return null;
  }

  /**
   * ログイン済みかどうかを返す
   *
   * 用途：
   * ・Route Guard でのアクセス制御
   * ・画面初期化時の状態判定
   */
  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  /**
   * 現在ログインしているユーザの role を返す
   *
   * 用途：
   * ・admin 専用画面へのアクセス制御
   * ・UI分岐（必要最小限）
   */
  getRole(): Role | null {
    return this.currentRole;
  }

  /**
   * ログアウト処理
   *
   * 役割：
   * ・認証状態を完全に初期化する
   * ・トークン認証に移行した場合も、この責務は Service に残る
   */
  logout(): void {
    this.loggedIn = false;
    this.currentRole = null;
  }
}
