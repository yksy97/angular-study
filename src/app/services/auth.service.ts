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
    const data = await firstValueFrom(this.http.get<UsersJson>('assets/users.json'));

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

    /**
     * 認証結果の返却
     * ・ユーザが見つかった場合：role（user/admin） を返す
     * ・見つからなかった場合：null を返す
     *
     * → UI 側は戻り値が null かどうかで
     *    「ログイン成功 / 失敗」を判断する
     */
    return user ? user.role : null;
  }
}
