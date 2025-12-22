import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Status = '未着手' | '対応中' | '完了' | '保留' | '差戻し';
export type Priority = '高' | '中' | '低';

export type Ticket = {
  no: number;
  subject: string;
  body: string;
  customerName: string;
  status: Status;
  priority: Priority;
  createdAt: string; // YYYY-MM-DD
  updatedAt: string; // YYYY-MM-DD
};

type TicketsJson = { tickets: Ticket[] };

const LS_KEY = 'tickets.snapshot.v1';
const ASSETS_URL = '/assets/tickets.json';

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function loadFromLS(): Ticket[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as Ticket[];
  } catch {
    return null;
  }
}

function saveToLS(list: Ticket[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // 使えない環境でも落とさない
  }
}

@Injectable({ providedIn: 'root' })
export class TicketsStore {
  private readonly _tickets = signal<Ticket[]>([]);
  readonly tickets = this._tickets.asReadonly();

  constructor(private http: HttpClient) {}

  async init(): Promise<void> {
    // 既に初期化済みなら何もしない
    if (this._tickets().length > 0) return;

    const ls = loadFromLS();
    if (ls) {
      this._tickets.set(ls);
      return;
    }

    // 初回だけ assets を seed として読む
    try {
      const data = await firstValueFrom(this.http.get<TicketsJson>(ASSETS_URL));
      const list = (data.tickets ?? []).map((t) => ({
        ...t,
        body: (t as any).body ?? '', // assets側に無い場合でも壊さない
      }));
      this._tickets.set(list);
      saveToLS(list);
    } catch {
      this._tickets.set([]);
    }
  }

  add(input: { subject: string; body: string; customerName: string; priority: Priority }): Ticket {
    const now = today();
    const current = this._tickets();
    const nextNo = current.length ? Math.max(...current.map((t) => t.no)) + 1 : 1;

    const ticket: Ticket = {
      no: nextNo,
      subject: input.subject,
      body: input.body,
      customerName: input.customerName,
      status: '未着手',
      priority: input.priority,
      createdAt: now,
      updatedAt: now,
    };

    const next = [ticket, ...current];
    this._tickets.set(next);
    saveToLS(next);
    return ticket;
  }

  byNo(no: number): Ticket | undefined {
    return this._tickets().find((t) => t.no === no);
  }

  updateStatus(no: number, status: Status): void {
    const now = today();
    const next = this._tickets().map((t) => (t.no === no ? { ...t, status, updatedAt: now } : t));
    this._tickets.set(next);
    saveToLS(next);
  }
}
