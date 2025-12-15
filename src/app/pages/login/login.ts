import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * 【Angular】
 * コンポーネントとは「画面単位の処理と表示をまとめたもの」
 * HTML（テンプレート） + CSS + TypeScript が１セット
 * 画面の表示とユーザー操作に対する処理を担当
 */

/**
 * 【Java（Spring MVC）】
 * Controller + ViewModel に近い役割
 * ※ AngularではHTTP処理はServiceに分離するのが基本
 */

@Component({
  selector: 'app-login', // このコンポーネントを表すHTMLタグ名
  imports: [FormsModule], // この画面で他コンポーネントを使用する場合は指定
  templateUrl: './login.html', // HTMLのテンプレート
  styleUrl: './login.css', // この画面専用のCSS
})
export class Login {
  /**
   * ログインボタン押下時のイベント処理
   */
  // 入力フォームから受け取ったパラメータを保持するプロパティ
  userId: string = '';
  password: string = '';

  onLogin(): void {
    console.log('ユーザID:', this.userId);
    console.log('パスワード:', this.password);
  }
}
