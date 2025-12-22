// src/app/services/ticket-store.service.ts
import { Injectable, computed, inject, signal } from '@angular/core';
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
  assignee?: string;
  createdAt: string; // YYYY-MM-DD
  updatedAt: string; // YYYY-MM-DD
};

export type TicketInput = {
  subject: string;
  body: string;
  customerName: string;
  priority: Priority;
  assignee?: string;
};

type TicketsJson = { tickets: Ticket[] };

const LS_KEY = 'tickets.v1';
const ASSETS_URL = '/assets/tickets.json';

// ====== utils（pure） ======
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeStatus(v: unknown): Status {
  if (v === '受付' || v === '対応中' || v === '完了') return v;
  return '受付';
}

function normalizePriority(v: unknown): Priority {
  if (v === '高' || v === '中' || v === '低') return v;
  return '中';
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

  const priority = normalizePriority(input.priority);
  const status = normalizeStatus(input.status);

  const createdAt = String(input.createdAt ?? '').trim() || today();
  const updatedAt = String(input.updatedAt ?? '').trim() || createdAt;

  const assignee = String(input.assignee ?? '').trim();

  return {
    no,
    subject,
    body,
    customerName,
    status,
    priority,
    assignee,
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

function nextNoFrom(list: Ticket[]): number {
  return list.reduce((max, t) => Math.max(max, t.no), 0) + 1;
}

// ====== Signal Store（state + selectors + actions） ======
type TicketState = {
  tickets: Ticket[];
  initialized: boolean;
};

const initialState: TicketState = {
  tickets: [],
  initialized: false,
};

@Injectable({ providedIn: 'root' })
export class TicketStore {
  private readonly http = inject(HttpClient);

  // --- state（1本化） ---
  private readonly state = signal<TicketState>(initialState);

  // --- selectors（読み取り専用） ---
  private readonly _tickets = computed(() => this.state().tickets);

  /** 既存互換：component側は store.tickets() で読める */
  readonly tickets = computed(() => this._tickets());

  readonly count = computed(() => this._tickets().length);

  /** 既存互換：find(no) */
  find(no: number): Ticket | null {
    return this._tickets().find((t) => t.no === no) ?? null;
  }

  /** 初回起動で1回だけ呼ぶ（一覧のngOnInitなどでOK） */
  async initOnce(): Promise<void> {
    if (this.state().initialized) return;

    // 1) localStorage
    const fromLSRaw = safeParse(localStorage.getItem(LS_KEY));
    const fromLS = coerceTicketArray(fromLSRaw);
    if (fromLS) {
      this.patchState({ tickets: fromLS, initialized: true });
      saveToLS(fromLS); // 正規化後で保存し直す
      return;
    }

    // 2) assets seed
    const data = await firstValueFrom(this.http.get<TicketsJson>(ASSETS_URL));
    const seedRaw = (data?.tickets ?? []) as unknown;
    const seed = coerceTicketArray(seedRaw) ?? [];

    this.patchState({ tickets: seed, initialized: true });
    saveToLS(seed);
  }

  // --- actions（更新系はここに集約） ---
  add(input: TicketInput): Ticket {
    const now = today();
    const current = this._tickets();
    const no = nextNoFrom(current);

    const created: Ticket = {
      no,
      subject: input.subject.trim(),
      body: input.body.trim(),
      customerName: input.customerName.trim(),
      status: '受付',
      priority: input.priority,
      assignee: (input.assignee ?? '').trim(),
      createdAt: now,
      updatedAt: now,
    };

    const next = [created, ...current];
    this.setTickets(next);
    return created;
  }

  /** CSV取込用：一括追加（全件OKのinputsのみ来る想定） */
  bulkAdd(inputs: TicketInput[]): number {
    if (!inputs.length) return 0;

    const now = today();
    const current = this._tickets();

    let no = nextNoFrom(current);

    const createdList: Ticket[] = inputs.map((x) => ({
      no: no++,
      subject: x.subject.trim(),
      body: x.body.trim(),
      customerName: x.customerName.trim(),
      status: '受付',
      priority: x.priority,
      assignee: (x.assignee ?? '').trim(),
      createdAt: now,
      updatedAt: now,
    }));

    // 取り込み分を先頭に（CSVの先頭行が上に来るよう reverse して積む）
    const next = [...createdList.reverse(), ...current];
    this.setTickets(next);

    return createdList.length;
  }

  updateStatus(no: number, status: Status): void {
    this.update(no, { status });
  }

  /** 詳細画面で利用：status / assignee をまとめて更新 */
  update(no: number, patch: { status?: Status; assignee?: string }): void {
    const now = today();
    const next = this._tickets().map((t) => {
      if (t.no !== no) return t;

      const status = patch.status !== undefined ? normalizeStatus(patch.status) : t.status;
      const assignee =
        patch.assignee !== undefined ? patch.assignee.trim() : (t.assignee ?? '').trim();

      return { ...t, status, assignee, updatedAt: now };
    });

    this.setTickets(next);
  }

  /** 便利：全消し（学習用・デバッグ用） */
  clearAll(): void {
    this.setTickets([]);
  }

  // --- internal helpers ---
  private patchState(patch: Partial<TicketState>): void {
    this.state.update((s) => ({ ...s, ...patch }));
  }

  private setTickets(tickets: Ticket[]): void {
    this.patchState({ tickets });
    saveToLS(tickets);
  }
}
