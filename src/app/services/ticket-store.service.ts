import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Status = '受付' | '対応中' | '完了';
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

const LS_KEY = 'tickets.v1';

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 旧ステータスや不正値は「受付」に寄せる（運用ラク＆壊れない） */
function normalizeStatus(v: unknown): Status {
  if (v === '受付' || v === '対応中' || v === '完了') return v;
  // 旧: 未着手/保留/差戻し など、または null/undefined/その他
  return '受付';
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function saveToLS(tickets: Ticket[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tickets));
  } catch {
    // localStorageが使えない環境でも落とさない
  }
}

/** 取り込み時に、最低限の形にして壊れないようにする */
function coerceTicket(input: any): Ticket | null {
  if (!input || typeof input !== 'object') return null;

  const no = Number(input.no);
  if (!Number.isFinite(no)) return null;

  const subject = String(input.subject ?? '').trim();
  const customerName = String(input.customerName ?? '').trim();
  const body = String(input.body ?? '').trim();

  // priority は壊れてても中に寄せる（運用ラク）
  const p = input.priority;
  const priority: Priority = p === '高' || p === '低' || p === '中' ? p : '中';

  const createdAt = String(input.createdAt ?? '').trim() || today();
  const updatedAt = String(input.updatedAt ?? '').trim() || createdAt;

  const status: Status = normalizeStatus(input.status);

  return {
    no,
    subject,
    body,
    customerName,
    status,
    priority,
    createdAt,
    updatedAt,
  };
}

function coerceTicketArray(raw: unknown): Ticket[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Ticket[] = [];
  for (const x of raw) {
    const t = coerceTicket(x);
    if (t) out.push(t);
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class TicketStore {
  private http = inject(HttpClient);

  private readonly _tickets = signal<Ticket[]>([]);
  readonly tickets = this._tickets.asReadonly();

  readonly count = computed(() => this._tickets().length);

  /** 初回起動で1回だけ呼ぶ（一覧のngOnInitなどでOK） */
  async initOnce(): Promise<void> {
    if (this._tickets().length > 0) return;

    // 1) localStorage があればそれを採用（status正規化込み）
    const fromLSRaw = safeParse(localStorage.getItem(LS_KEY));
    const fromLS = coerceTicketArray(fromLSRaw);
    if (fromLS) {
      this._tickets.set(fromLS);
      // 念のため正規化後で保存し直す（旧ステータスが残らない）
      saveToLS(fromLS);
      return;
    }

    // 2) 無ければ assets を seed として読み込む（status正規化込み）
    const data = await firstValueFrom(this.http.get<TicketsJson>('/assets/tickets.json'));
    const seedRaw = (data?.tickets ?? []) as unknown;
    const seed = coerceTicketArray(seedRaw) ?? [];

    this._tickets.set(seed);
    saveToLS(seed);
  }

  add(input: { subject: string; body: string; customerName: string; priority: Priority }): Ticket {
    const now = today();
    const current = this._tickets();

    const nextNo = current.reduce((max, t) => Math.max(max, t.no), 0) + 1;

    const created: Ticket = {
      no: nextNo,
      subject: input.subject,
      body: input.body,
      customerName: input.customerName,
      status: '受付', // ★ ここが変更点（未着手→受付）
      priority: input.priority,
      createdAt: now,
      updatedAt: now,
    };

    const next = [created, ...current];
    this._tickets.set(next);
    saveToLS(next);

    return created;
  }

  find(no: number): Ticket | null {
    return this._tickets().find((t) => t.no === no) ?? null;
  }

  updateStatus(no: number, status: Status): void {
    const now = today();
    const normalized = normalizeStatus(status);

    const next = this._tickets().map((t) =>
      t.no === no ? { ...t, status: normalized, updatedAt: now } : t
    );

    this._tickets.set(next);
    saveToLS(next);
  }
}
