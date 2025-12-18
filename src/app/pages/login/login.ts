import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService, Role } from '../../services/auth.service';
import { MSG, LoginMessageId } from '../../messages';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgIf, HttpClientModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  MSG = MSG;

  constructor(private auth: AuthService, private router: Router) {}

  userId = '';
  password = '';

  role: Role | '' = '';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get isUser(): boolean {
    return this.role === 'user';
  }

  submitting = false;
  loggedIn = false;

  loginErrorId: LoginMessageId | '' = '';

  async onLogin(): Promise<void> {
    this.submitting = true;
    this.loginErrorId = '';

    try {
      const role = await this.auth.login(this.userId, this.password);

      if (!role) {
        this.loginErrorId = 'loginFailed';
        return;
      }

      this.router.navigate(['/home']);
    } catch {
      this.loginErrorId = 'authLookupFailed';
    } finally {
      this.submitting = false;
    }
  }

  logout(): void {
    this.loggedIn = false;
    this.role = '';
    this.loginErrorId = '';
    this.submitting = false;
    this.userId = '';
    this.password = '';

    this.router.navigate(['/login']);
  }
}
