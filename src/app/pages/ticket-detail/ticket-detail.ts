// src/app/pages/ticket-detail/ticket-detail.ts
import { Component, computed, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TicketStore, Status } from '../../services/ticket-store.service';
import { TicketPdfService } from '../../services/ticket-pdf.service';

@Component({
  standalone: true,
  selector: 'app-ticket-detail',
  imports: [NgIf, FormsModule, RouterLink],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.css',
})
export class TicketDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(TicketStore);
  private readonly pdf = inject(TicketPdfService);

  readonly loading = signal(true);
  readonly loadError = signal('');

  readonly no = computed(() => Number(this.route.snapshot.paramMap.get('id')));

  readonly status = signal<Status>('受付');
  readonly assignee = signal('');

  readonly ticket = computed(() => {
    const n = this.no();
    if (!Number.isFinite(n)) return null;
    return this.store.find(n);
  });

  /** 未保存の変更があるか */
  readonly hasChanges = computed(() => {
    const t = this.ticket();
    if (!t) return false;
    return t.status !== this.status() || (t.assignee ?? '') !== this.assignee().trim();
  });

  /** 保存可能か */
  readonly canSave = computed(() => this.hasChanges() && !this.loading());

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      await this.store.initOnce();

      const t = this.ticket();
      if (!t) {
        this.loadError.set('問い合わせが見つかりませんでした');
        return;
      }

      this.status.set(t.status);
      this.assignee.set((t.assignee ?? '').trim());
    } catch (e: unknown) {
      this.loadError.set(e instanceof Error ? e.message : '詳細データの取得に失敗しました');
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/tickets']);
  }

  save(): void {
    const t = this.ticket();
    if (!t) return;

    this.store.update(t.no, {
      status: this.status(),
      assignee: this.assignee().trim(),
    });

    this.router.navigate(['/tickets']);
  }

  async downloadPdf(): Promise<void> {
    const t = this.ticket();
    if (!t) return;

    try {
      // ✅ 詳細画面のPDFは「単帳票（detail）」で固定
      await this.pdf.downloadTicketPdf(
        { ...t, status: this.status(), assignee: this.assignee().trim() },
        { appTitle: 'angular-study' }
      );
    } catch (e: unknown) {
      this.loadError.set(e instanceof Error ? e.message : 'PDF出力に失敗しました');
    }
  }
}
