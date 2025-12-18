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
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly isAdmin = this.auth.isAdmin; // ← signal(computed)をそのまま渡す（templateでは isAdmin()）

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
