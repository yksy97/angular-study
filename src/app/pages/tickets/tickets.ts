// src/app/pages/tickets/tickets.ts
import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketStore, Ticket, Status, Priority } from '../../services/ticket-store.service';

type SortKey =
  | 'no'
  | 'subject'
  | 'customerName'
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

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, RouterLink],
  templateUrl: './tickets.html',
  styleUrl: './tickets.css',
})
export class Tickets {
  private readonly store = inject(TicketStore);

  // storeから参照（登録・更新が即反映される）
  readonly tickets = this.store.tickets;

  readonly loading = signal(false);
  readonly loadError = signal('');

  // フィルタ
  readonly keyword = signal('');
  readonly status = signal<Status | ''>('');
  readonly priority = signal<Priority | ''>('');

  // ページング
  readonly page = signal(1);

  // ソート（デフォルト：作成日 desc）
  readonly sortKey = signal<SortKey>('createdAt');
  readonly sortDir = signal<SortDir>('desc');

  // フィルタ/ソート変更で1ページ目に戻す
  private readonly _resetPage = effect(() => {
    this.keyword();
    this.status();
    this.priority();
    this.sortKey();
    this.sortDir();
    this.page.set(1);
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      await this.store.initOnce();
    } catch {
      this.loadError.set('一覧データの取得に失敗しました');
    } finally {
      this.loading.set(false);
    }
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortKey.set(key);

    // 初期方向（自然な方）
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

  // フィルタ
  readonly filtered = computed(() => {
    const kw = normalizeText(this.keyword());
    const st = this.status();
    const pr = this.priority();

    return this.tickets().filter((t) => {
      const hitKw =
        !kw ||
        normalizeText(t.subject).includes(kw) ||
        normalizeText(t.customerName).includes(kw) ||
        String(t.no).includes(kw);

      const hitSt = !st || t.status === st;
      const hitPr = !pr || t.priority === pr;

      return hitKw && hitSt && hitPr;
    });
  });

  // ソート（主キー + 既定の多段ソートで安定化）
  readonly sorted = computed(() => {
    const rows = [...this.filtered()];
    const key = this.sortKey();
    const dir = this.sortDir();

    rows.sort((a, b) => {
      // 1) クリック列を主キー
      let r = this.compareBy(key, dir, a, b);
      if (r !== 0) return r;

      // 2) 既定の多段ソート：作成日 desc → 更新日 desc → No asc
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
}
