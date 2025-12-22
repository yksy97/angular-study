// src/app/pages/tickets/tickets.ts
import { Component, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketStore, type Ticket } from '../../services/ticket-store.service';
import { TicketsListStore } from './tickets-list.store';
import { TicketPdfService } from '../../services/ticket-pdf.service';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, RouterLink],
  templateUrl: './tickets.html',
  styleUrl: './tickets.css',
  providers: [TicketsListStore],
})
export class Tickets {
  /** 永続データ（Signal Store） */
  private readonly store = inject(TicketStore);

  /** PDF出力専用サービス */
  private readonly pdf = inject(TicketPdfService);

  /** 一覧画面用の ViewModel（フィルタ・選択状態を保持） */
  readonly vm = inject(TicketsListStore);

  /** 画面制御用フラグ */
  readonly loading = signal(false);
  readonly loadError = signal('');

  /**
   * 一覧初期化
   * - TicketStore は initOnce() により多重ロードを防止
   * - 失敗時は画面上にエラー文言を表示
   */
  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      await this.store.initOnce();
    } catch (e: unknown) {
      this.loadError.set(e instanceof Error ? e.message : '一覧データの取得に失敗しました');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * 出力用の並び順を統一するためのヘルパー
   *
   * - No 昇順（若い番号が上）
   * - Array.prototype.sort は破壊的なので必ずコピーしてから実行
   * - 画面表示の並び順には影響させない
   */
  private sortByNoAsc(rows: Ticket[]): Ticket[] {
    return [...rows].sort((a, b) => a.no - b.no);
  }

  /**
   * CSVエクスポート
   *
   * - 現在の一覧条件（フィルタ後）をそのまま出力
   * - 並び順は PDF と揃えるため No 昇順に固定
   * - Excel互換のため UTF-8 BOM を付与
   */
  exportCsv(): void {
    const rows = this.sortByNoAsc(this.vm.sorted());

    const header = [
      'no',
      'subject',
      'customerName',
      'assignee',
      'status',
      'priority',
      'createdAt',
      'updatedAt',
    ];
    const bom = '\uFEFF';

    const escape = (v: unknown): string => {
      const s = String(v ?? '');
      // RFC4180 準拠（カンマ・改行・ダブルクォートを含む場合はエスケープ）
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [
      header.join(','),
      ...rows.map((t) =>
        [
          t.no,
          t.subject,
          t.customerName ?? '',
          t.assignee ?? '',
          t.status,
          t.priority,
          t.createdAt,
          t.updatedAt,
        ]
          .map(escape)
          .join(',')
      ),
    ];

    const csv = bom + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * PDFエクスポート（全件）
   *
   * - 一覧画面で表示されている条件の全件を対象
   * - No 昇順で固定
   * - 管理者向けの「提出用一覧」想定
   */
  async exportPdfAll(): Promise<void> {
    const rows = this.sortByNoAsc(this.vm.sorted());
    if (!rows.length) return;

    try {
      await this.pdf.downloadTicketsPdf(rows, {
        appTitle: 'angular-study',
        layout: 'list',
      });
    } catch (e: unknown) {
      this.loadError.set(e instanceof Error ? e.message : 'PDF出力に失敗しました');
    }
  }

  /**
   * PDFエクスポート（選択行のみ）
   *
   * - チェックされた行のみを対象
   * - 並び順は No 昇順に正規化
   * - 実務では「一部抜粋提出」用途を想定
   */
  async exportPdfSelected(): Promise<void> {
    const rows = this.vm.selectedTickets();
    if (!rows.length) return;

    try {
      // ✅ 選択出力は “常に” 詳細（= 1件1ページの帳票）
      // 並び順も統一する（若いNoが先）
      const sorted = this.sortByNoAsc(rows);

      await this.pdf.downloadTicketsPdf(sorted, {
        appTitle: 'angular-study',
        layout: 'detail',
      });
    } catch (e: unknown) {
      this.loadError.set(e instanceof Error ? e.message : 'PDF出力に失敗しました');
    }
  }
}
