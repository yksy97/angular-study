import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'app-ticket-detail',
  imports: [FormsModule],
  templateUrl: './ticket-detail.html',
})
export class TicketDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  id = this.route.snapshot.paramMap.get('id');
  status = '未着手';

  save(): void {
    console.log('update status', this.id, this.status);
    this.router.navigate(['/tickets']);
  }
}
