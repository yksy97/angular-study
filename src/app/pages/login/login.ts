import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common'; /* NgIf = 条件によって DOM を作る／消す（構造ディレクティブ）*/
import { HttpClientModule } from '@angular/common/http'; // Service側で HttpClient を使うため、アプリに提供する
import { Router } from '@angular/router';

// HTTP/認証ロジックを Service に切り出す
//  - Component は「UI専用」に近づける
//  - users.json の存在、HTTP取得、照合ロジックは Service に隠蔽する
import { AuthService, Role } from '../../services/auth.service'; //

/*  【Component（画面の最小単位）】
 役割：
 - UI（テンプレート）と状態（TypeScript）を1セットで持つ
 - ユーザ操作のイベントを受け、UI状態を更新する

 今回の責務分担：
 - Component：UI状態管理（入力値、表示フラグ、role など）
 - Service   ：HTTP取得・認証ロジック（データ取得と判定）

 実務での狙い：
 - Component が肥大化すると、画面と業務ロジックが混ざる
 - Service に切り出すことで保守性・テスト容易性を上げる
============================================ */

@Component({
  selector: 'app-login',

  /*  【standalone Component】
   standalone: true
   - NgModule を作らずに Component 単体で完結させる宣言
   - この Component が使う機能（FormsModule/NgIfなど）を imports に列挙する

   実務補足：
   - Angular の新しめの推奨スタイル（プロジェクト方針により混在もある）
   - 「依存が見える」ため、画面ごとの責務が明確になる
  ============================================ */
  standalone: true /* standalone = Component が自立する宣言（Module不要）*/,

  /*  【imports（テンプレートで使う機能の宣言）】
   FormsModule：
   - ngModel / ngForm（テンプレート駆動フォーム）を使うために必要

   NgIf：
   - *ngIf を使うために必要（構造ディレクティブ）

   HttpClientModule：
   - HttpClient を DI できるようにする Module
   - Component 自体は HttpClient を使わないが、Service（AuthService）が使う
   - standalone では「このコンポーネントの依存として列挙」しておく
  ============================================ */
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

  /*  【constructor と DI（依存性注入）】
   constructor(private auth: AuthService)

   何が起きているか：
   - auth は「プロパティ名」（このクラス内で this.auth として使う）
   - AuthService は「型」（注入される依存の種類）
   - private を付けることで
     1) コンストラクタ引数
     2) クラスのフィールド定義
     を同時に行う（TypeScript の省略記法：parameter properties）

   なぜ new しないか：
   - Angular が AuthService のインスタンス生成・管理を行う
   - 依存を差し替えやすくし、テストもしやすくする

   実務補足：
   - 認証処理や通信処理は Service に閉じ込める
   - Component は「画面がどう振る舞うか」に集中する
  ============================================ */
  constructor(private auth: AuthService, private router: Router) {
    /*  Routerの注入（画面遷移）
     目的：
     - これまでは loggedIn / role をテンプレート内の *ngIf で分岐していた
     - これからは ログイン成功をトリガに Router で画面遷移する（URLで画面を分ける）

     実務補足：
     - UI状態は引き続き Component が保持するが、「表示の切替」は routes に移していく
    ============================================ */
  }

  /**
   * ログイン画面の状態（UI状態管理）
   * - 入力値（テンプレと双方向バインディング）
   * - 認証結果（ログイン済みか／ユーザ種別）
   * - 表示制御に使うフラグ（submitting など）
   */

  /** 入力パラメータ（テンプレと双方向バインディング） */

  /*【userId / password（UI状態：入力値）】
   役割：
   - テンプレートの [(ngModel)] と同期する入力状態
   - フォーム送信時に「値を読む」のではなく、
     常に Component が「現在値」を保持している

   実務補足：
   - Reactive Forms を使う場合は FormControl に移るが、
     「UI状態をオブジェクトで保持する」思想は同じ
  ============================================ */
  userId = '';
  password = '';

  /** ログイン中のユーザ種別（admin / user）。ログアウトで空に戻す */
  // Role 型（Serviceで定義）を利用して、UIに必要な最小情報だけを保持する

  /*  【role（UI状態：認証結果の最小情報）】
   Role は Service 側で定義した型：
   - 'admin' | 'user'

   Component 側で保持する理由：
   - UI の表示分岐に必要な最小情報だから
   - users.json の構造（User型）を UI に漏らさないため

   '' を許容する理由：
   - 未ログイン／ログアウト後の「状態」を表現するため
   - role が空 = 認証結果が無い状態

   実務補足：
   - 状態を boolean だけで表すと増えたとき破綻しやすい
   - 「状態を表現する型」を持つのが安定する
  ============================================ */
  role: Role | '' = ''; // '' は未ログイン（またはログアウト後）

  /** role表示制御用 */

  /*  【getter（テンプレート簡略化）】
   テンプレートで role === 'admin' を直接書くことも可能だが、
   getter にするとテンプレートが読みやすくなる。

   注意：
   - getter は「表示に使うための派生状態」
   - 元データ（source of truth）は role

   実務補足：
   - 複雑になった場合は、表示用VM（ViewModel）として整理することもある
  ============================================ */
  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get isUser(): boolean {
    return this.role === 'user';
  }

  /** UI状態管理（今の画面の状態） */

  /*  【UI状態フラグ群】
   submitting：
   - ログイン処理中か（ボタン無効 / 文言切替に使う）

   loginError：
   - 画面に表示するエラーメッセージ
   - 例外の詳細は出さず、UI向けメッセージに落とす

   loggedIn：
   - ログイン済みか（ログイン前フォーム / ログイン後画面の切替キー）

   実務補足：
   - 「画面表示の切替は Router で行う」場合もある
   - ただし Router 導入前に UI状態管理で理解するのは有効
  ============================================ */
  submitting = false; // ログイン処理中か
  loginError = ''; // エラーメッセージ
  loggedIn = false; // ログイン成功フラグ

  /*  【onLogin（イベントハンドラ）】
   (ngSubmit)="onLogin()" から呼ばれる。
   - HTMLフォームの submit がトリガー
   - Enterキーでも発火する

   async / Promise<void>：
   - 認証処理（Service）が非同期なので await する
   - 戻り値は UI更新のみで、呼び出し側（テンプレ）に値を返さないため void
  ============================================ */
  async onLogin(): Promise<void> {
    // UI状態管理（処理開始時）

    /*  【開始時に UI状態をリセットする理由】
     - 二重送信防止：submitting=true
     - 前回エラーのクリア：loginError=''
     - 前回ログイン状態のリセット：loggedIn=false

     実務補足：
     - UIは「状態の集合」なので、開始時に状態を確定させるのが重要
    ============================================ */
    this.submitting = true;
    this.loginError = '';
    this.loggedIn = false;

    try {
      /*  【Serviceに委譲した結果だけを受け取る】
       this.auth.login(userId, password) の戻り：
       - 成功：role（'admin' | 'user'）
       - 失敗：null

       重要：
       - Component は「ユーザ配列」や「User構造」を知らない
       - 認証の内部構造（JSON/HTTP/find）は Service に閉じる
      ============================================ */
      const role = await this.auth.login(this.userId, this.password);

      if (!role) {
        // ログインに失敗した場合

        /*  【失敗時のUI制御】
         - loginError にUI表示メッセージを設定
         - submitting は finally で false に戻る
         - return で以降の成功処理に進まない

         実務補足：
         - 失敗理由（パスワード違い/ユーザ不存在など）を分けるかは要件次第
        ============================================ */
        this.loginError = 'ユーザIDまたはパスワードが違います';
        return;
      }

      /*  【成功時の状態確定】
       role：
       - ログイン後UIの分岐キー

       loggedIn：
       - 画面ブロック（ログイン前/後）切替キー

       UI状態管理の基本：
       - 「成功した」事実を、状態として保存し、テンプレートがそれに追随する
      ============================================ */
      this.role = role;

      // ログインに成功した場合
      this.loggedIn = true;

      /* ログイン成功後の画面遷移
       目的：
       - 成功後UIを同一テンプレートの *ngIf で切り替えるのではなく
         URL（routes）として分離し、Router で遷移する

       ルール（A案：安全でシンプル）：
       - ログイン成功直後は必ず /home に遷移する
       - admin であっても直後に /admin へは遷移しない
         （/admin への遷移は Home 側の導線から行う）

       実務補足：
       - ここでの遷移先は「画面設計（routes）」に依存するため、後で変更され得る
       - Guard 導入後は、未ログインアクセスを /login に戻すのが基本になる
      ============================================ */
      // ログイン直後は role に関係なく /home に統一する
      this.router.navigate(['/home']);
    } catch {
      // Service 内での HTTP 失敗なども含めて、ここで UI 表示用に握りつぶす

      /*  【catch の役割（例外→UIメッセージ変換）】
       想定例：
       - assets/users.json が存在しない
       - JSON が壊れている
       - HTTP 取得が失敗する

       方針：
       - 例外の詳細は UI に直接出さない
       - 利用者向けのメッセージへ変換する

       実務補足：
       - ログ（console / 監視）には詳細を残す設計もある
      ============================================ */
      this.loginError = 'ユーザ情報の照合に失敗しました';
    } finally {
      // UI状態管理（処理終了時）

      /*  【finally の役割（終了処理の保証）】
       submitting は成功/失敗どちらでも必ず false に戻す。
       - ボタン無効解除
       - 「ログイン中…」表示解除

       実務補足：
       - 非同期UIでは finally で状態を閉じるのが基本
      ============================================ */
      this.submitting = false;
    }
  }

  // UI状態管理（ログアウト時）

  /*  【logout（状態初期化）】
   役割：
   - UI状態を「未ログイン」に戻す
   - 入力値もクリアして、次回ログインの前提を揃える

   実務補足：
   - Router 導入後は、ここで /login に navigate する
   - さらに Guard と組み合わせて未ログインアクセスを遮断する
  ============================================ */
  logout(): void {
    this.loggedIn = false;
    this.role = '';
    this.loginError = '';
    this.submitting = false;
    this.userId = '';
    this.password = '';

    /*  ログアウト後の遷移
     目的：
     - UI状態の初期化に加えて、URLとしても未ログイン状態に戻す

     実務補足：
     - Guard 導入後は、ログアウト時にトークン/セッション破棄もここ（または Service）で行う
    ============================================ */
    this.router.navigate(['/login']);
  }
}
