import { Injectable } from '@angular/core';
import { Ticket } from './ticket-store.service';

type CsvColumn = { key: string; header: string; get: (t: Ticket) => string };

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** RFC4180: 値にカンマ/改行/ダブルクォートが含まれる場合は "..." で囲い、" は "" にする */
function csvEscape(v: string): string {
  const s = String(v ?? '');
  const needQuote = /[",\r\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needQuote ? `"${escaped}"` : escaped;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

function downloadText(filename: string, content: string): void {
  // Excel文字化け対策：UTF-8 BOM
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

@Injectable({ providedIn: 'root' })
export class TicketCsvExportService {
  private readonly cols: CsvColumn[] = [
    { key: 'no', header: 'no', get: (t) => String(t.no) },
    { key: 'createdAt', header: 'createdAt', get: (t) => t.createdAt },
    { key: 'subject', header: 'subject', get: (t) => t.subject },
    { key: 'status', header: 'status', get: (t) => t.status },
    { key: 'priority', header: 'priority', get: (t) => t.priority },
    { key: 'assignee', header: 'assignee', get: (t) => (t.assignee ?? '').trim() },
    { key: 'customerName', header: 'customerName', get: (t) => t.customerName },
    { key: 'updatedAt', header: 'updatedAt', get: (t) => t.updatedAt },
  ];

  downloadTickets(tickets: Ticket[], filename?: string): void {
    const name = filename ?? `tickets_${todayYmd()}.csv`;

    const rows: string[][] = [];
    rows.push(this.cols.map((c) => c.header));
    for (const t of tickets) {
      rows.push(this.cols.map((c) => c.get(t)));
    }

    downloadText(name, toCsv(rows));
  }
}
