import { Component, computed, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TicketStore, Priority } from '../../services/ticket-store.service';

@Component({
  selector: 'app-ticket-new',
  standalone: true,
  imports: [NgIf, FormsModule, RouterLink],
  templateUrl: './ticket-new.html',
  styleUrl: './ticket-new.css',
})
export class TicketNew {
  private readonly store = inject(TicketStore);
  private readonly router = inject(Router);

  readonly subject = signal('');
  readonly body = signal('');
  readonly customerName = signal('');
  readonly priority = signal<Priority>('中');

  readonly submitting = signal(false);
  readonly submitError = signal('');

  readonly canSubmit = computed(() => {
    const s = this.subject().trim();
    const b = this.body().trim();
    return s.length > 0 && b.length > 0 && !this.submitting();
  });

  async ngOnInit(): Promise<void> {
    await this.store.initOnce();
  }

  cancel(): void {
    this.router.navigate(['/tickets']);
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.submitError.set('');

    try {
      const created = this.store.add({
        subject: this.subject().trim(),
        body: this.body().trim(),
        customerName: this.customerName().trim(),
        priority: this.priority(),
      });

      this.router.navigate(['/tickets']);
    } catch {
      this.submitError.set('登録に失敗しました');
    } finally {
      this.submitting.set(false);
    }
  }
}
