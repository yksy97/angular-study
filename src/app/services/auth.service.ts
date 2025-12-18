import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/* =========================
   型定義
   ========================= */
export type Role = 'admin' | 'user';

type User = {
  id: string;
  password: string;
  role: Role;
};

type UsersJson = {
  users: User[];
};

type AuthSnapshot = {
  loggedIn: boolean;
  role: Role | null;
};

/* =========================
   LocalStorage 設定
   ========================= */
const LS_KEY = 'auth.snapshot';

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user';
}

function loadAuthSnapshot(): AuthSnapshot {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { loggedIn: false, role: null };

    const parsed = JSON.parse(raw) as Partial<AuthSnapshot>;

    const loggedIn = parsed.loggedIn === true;
    const role = isRole(parsed.role) ? parsed.role : null;

    // 整合性保証：ログイン中なら role 必須
    if (loggedIn && !role) {
      return { loggedIn: false, role: null };
    }

    return { loggedIn, role };
  } catch {
    return { loggedIn: false, role: null };
  }
}

function saveAuthSnapshot(snapshot: AuthSnapshot): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch {
    // ストレージが使えなくてもアプリを落とさない
  }
}

/* =========================
   AuthService
   ========================= */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _loggedIn = signal(false);
  private readonly _role = signal<Role | null>(null);

  // 公開 Signal（読み取り専用）
  readonly loggedIn = this._loggedIn.asReadonly();
  readonly role = this._role.asReadonly();

  // 派生状態
  readonly isAdmin = computed(() => this._role() === 'admin');
  readonly isUser = computed(() => this._role() === 'user');

  constructor(private http: HttpClient) {
    // アプリ起動時に LocalStorage から復元
    const snapshot = loadAuthSnapshot();
    this._loggedIn.set(snapshot.loggedIn);
    this._role.set(snapshot.role);
  }

  async login(userId: string, password: string): Promise<Role | null> {
    const data = await firstValueFrom(this.http.get<UsersJson>('/assets/users.json'));

    const user = data.users.find((u) => u.id === userId && u.password === password);

    if (!user) {
      this._loggedIn.set(false);
      this._role.set(null);
      saveAuthSnapshot({ loggedIn: false, role: null });
      return null;
    }

    this._loggedIn.set(true);
    this._role.set(user.role);
    saveAuthSnapshot({ loggedIn: true, role: user.role });

    return user.role;
  }

  logout(): void {
    this._loggedIn.set(false);
    this._role.set(null);
    saveAuthSnapshot({ loggedIn: false, role: null });
  }
}
