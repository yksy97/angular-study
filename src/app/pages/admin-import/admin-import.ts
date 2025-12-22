import { Component, inject, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TicketCsvImportService, ImportError } from '../../services/ticket-csv-import.service';
import { TicketStore, Ticket } from '../../services/ticket-store.service';
import { TicketPdfService } from '../../services/ticket-pdf.service';

@Component({
  standalone: true,
  selector: 'app-admin-import',
  imports: [NgIf, NgFor, RouterLink],
  templateUrl: './admin-import.html',
  styleUrl: './admin-import.css',
})
export class AdminImport {
  private readonly importer = inject(TicketCsvImportService);
  private readonly store = inject(TicketStore);
  private readonly pdf = inject(TicketPdfService);

  readonly selectedFileName = signal('');
  readonly busy = signal(false);
  readonly exporting = signal(false);

  readonly successMessage = signal('');
  readonly errors = signal<ImportError[]>([]);

  /** 今回取り込んだ分だけ（PDF対象） */
  readonly importedTickets = signal<Ticket[]>([]);

  private selectedFile: File | null = null;

  async ngOnInit(): Promise<void> {
    await this.store.initOnce();
  }

  clearFile(): void {
    if (this.busy()) return;

    this.selectedFile = null;
    this.selectedFileName.set('');
    this.successMessage.set('');
    this.errors.set([]);
    this.importedTickets.set([]);
  }

  onFileChange(ev: Event): void {
    this.successMessage.set('');
    this.errors.set([]);
    this.importedTickets.set([]);

    const input = ev.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    this.selectedFileName.set(this.selectedFile?.name ?? '');
  }

  get canImport(): boolean {
    return !!this.selectedFile && !this.busy();
  }

  async runImport(): Promise<void> {
    if (!this.selectedFile || this.busy()) return;

    this.busy.set(true);
    this.successMessage.set('');
    this.errors.set([]);
    this.importedTickets.set([]);

    try {
      await this.store.initOnce();

      const beforeNos = new Set(this.store.tickets().map((t) => t.no));

      const res = await this.importer.importCsv(this.selectedFile);

      if (!res.ok) {
        this.errors.set(this.sanitizeErrors(res.errors));
        return;
      }

      const addedCount = this.store.bulkAdd(res.inputs);

      const after = this.store.tickets();
      const newlyAdded = after.filter((t) => !beforeNos.has(t.no));
      this.importedTickets.set(newlyAdded);

      this.successMessage.set(`追加: ${addedCount}件（今回取り込んだ分だけPDF出力できます）`);
    } catch {
      this.errors.set([
        { line: 0, message: '取り込み処理に失敗しました。CSVの形式をご確認ください。' },
      ]);
    } finally {
      this.busy.set(false);
    }
  }

  async downloadAllPdf(): Promise<void> {
    const tickets = this.importedTickets();
    if (tickets.length === 0 || this.exporting()) return;

    this.exporting.set(true);
    try {
      await this.pdf.downloadTicketsPdf(tickets, { appTitle: 'angular-study' });
    } finally {
      this.exporting.set(false);
    }
  }

  private sanitizeErrors(list: ImportError[]): ImportError[] {
    return list.map((e) => ({
      line: e.line,
      message: this.sanitizeMessage(e.message),
    }));
  }

  private sanitizeMessage(raw: string): string {
    const s = (raw ?? '').toString();

    // 物理名っぽい単語や内部表現が混ざっていても、ユーザー向けに丸める
    // （実装依存の文字列は画面に出さない）
    const lowered = s.toLowerCase();
    const looksLikeColumn =
      lowered.includes('subject') ||
      lowered.includes('body') ||
      lowered.includes('customername') ||
      lowered.includes('priority') ||
      lowered.includes('assignee') ||
      lowered.includes('header') ||
      lowered.includes('column');

    if (looksLikeColumn)
      return '列名（見出し）または並び順が正しくありません。サンプルに合わせてください。';

    if (lowered.includes('utf') || lowered.includes('encoding'))
      return '文字コードが正しくありません。UTF-8 のCSVをご利用ください。';

    if (lowered.includes('quote') || lowered.includes('rfc') || lowered.includes('csv'))
      return 'CSVの形式が正しくありません。値にカンマ/改行がある場合は引用符で囲んでください。';

    // そのまま出しても問題なさそうな文言だけ軽く整形
    return s.replace(/\s+/g, ' ').trim() || 'CSVの形式をご確認ください。';
  }
}
