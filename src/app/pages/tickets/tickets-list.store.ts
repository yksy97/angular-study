// src/app/pages/tickets/tickets-list.store.ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TicketStore, Ticket, Status, Priority } from '../../services/ticket-store.service';

type SortKey =
  | 'no'
  | 'subject'
  | 'customerName'
  | 'assignee'
  | 'status'
  | 'priority'
  | 'createdAt'
  | 'updatedAt';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

function normalizeText(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

function toTime(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

@Injectable()
export class TicketsListStore {
  private readonly store = inject(TicketStore);

  // 元データ
  readonly tickets = this.store.tickets;

  // フィルタ
  readonly keyword = signal('');
  readonly status = signal<Status | ''>('');
  readonly priority = signal<Priority | ''>('');

  // ページング
  readonly page = signal(1);

  // ソート（デフォルト：作成日 desc）
  readonly sortKey = signal<SortKey>('createdAt');
  readonly sortDir = signal<SortDir>('desc');

  // ✅ 選択状態（Noの集合）
  readonly selectedNos = signal<Set<number>>(new Set());

  // フィルタ/ソート変更で1ページ目＆選択クリア（実務だと事故防止でこの方が多い）
  private readonly _reset = effect(() => {
    this.keyword();
    this.status();
    this.priority();
    this.sortKey();
    this.sortDir();
    this.page.set(1);
    this.selectedNos.set(new Set());
  });

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortKey.set(key);
    if (key === 'createdAt' || key === 'updatedAt') this.sortDir.set('desc');
    else if (key === 'no') this.sortDir.set('asc');
    else this.sortDir.set('asc');
  }

  private compareBy(key: SortKey, dir: SortDir, a: Ticket, b: Ticket): number {
    const m = dir === 'asc' ? 1 : -1;

    if (key === 'no') return (a.no - b.no) * m;
    if (key === 'createdAt') return (toTime(a.createdAt) - toTime(b.createdAt)) * m;
    if (key === 'updatedAt') return (toTime(a.updatedAt) - toTime(b.updatedAt)) * m;

    const av = normalizeText((a as any)[key]);
    const bv = normalizeText((b as any)[key]);
    if (av < bv) return -1 * m;
    if (av > bv) return 1 * m;
    return 0;
  }

  readonly filtered = computed(() => {
    const kw = normalizeText(this.keyword());
    const st = this.status();
    const pr = this.priority();

    return this.tickets().filter((t) => {
      const hitKw =
        !kw ||
        normalizeText(t.subject).includes(kw) ||
        normalizeText(t.customerName).includes(kw) ||
        normalizeText(t.assignee).includes(kw) ||
        String(t.no).includes(kw);

      const hitSt = !st || t.status === st;
      const hitPr = !pr || t.priority === pr;

      return hitKw && hitSt && hitPr;
    });
  });

  readonly sorted = computed(() => {
    const rows = [...this.filtered()];
    const key = this.sortKey();
    const dir = this.sortDir();

    rows.sort((a, b) => {
      let r = this.compareBy(key, dir, a, b);
      if (r !== 0) return r;

      r = this.compareBy('createdAt', 'desc', a, b);
      if (r !== 0) return r;

      r = this.compareBy('updatedAt', 'desc', a, b);
      if (r !== 0) return r;

      return this.compareBy('no', 'asc', a, b);
    });

    return rows;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));

  readonly paged = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  prev(): void {
    this.page.set(Math.max(1, this.page() - 1));
  }

  next(): void {
    this.page.set(Math.min(this.totalPages(), this.page() + 1));
  }

  // =========================
  // ✅ selection API
  // =========================
  isSelected(no: number): boolean {
    return this.selectedNos().has(no);
  }

  toggleSelect(no: number): void {
    const next = new Set(this.selectedNos());
    if (next.has(no)) next.delete(no);
    else next.add(no);
    this.selectedNos.set(next);
  }

  readonly selectedCount = computed(() => this.selectedNos().size);

  readonly selectedTickets = computed(() => {
    const set = this.selectedNos();
    if (set.size === 0) return [];
    // 現在の一覧条件で見えてなくても「選択していたもの」は出したいので、tickets() から引く
    return this.tickets().filter((t) => set.has(t.no));
  });

  readonly allSelectedOnPage = computed(() => {
    const set = this.selectedNos();
    const pageRows = this.paged();
    return pageRows.length > 0 && pageRows.every((t) => set.has(t.no));
  });

  readonly someSelectedOnPage = computed(() => {
    const set = this.selectedNos();
    const pageRows = this.paged();
    const any = pageRows.some((t) => set.has(t.no));
    return any && !this.allSelectedOnPage();
  });

  toggleSelectAllOnPage(): void {
    const pageRows = this.paged();
    const next = new Set(this.selectedNos());

    if (this.allSelectedOnPage()) {
      // ページ内を解除
      for (const t of pageRows) next.delete(t.no);
    } else {
      // ページ内を選択
      for (const t of pageRows) next.add(t.no);
    }
    this.selectedNos.set(next);
  }
}
