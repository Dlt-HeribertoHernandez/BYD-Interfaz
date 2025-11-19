
import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { Dealer } from './models/app.types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent {
  apiService = inject(ApiService);

  dealers = signal<Dealer[]>([]);

  constructor() {
    // Effect to reload dealers when mode changes (Demo <-> Live)
    effect(() => {
      this.apiService.useMockData(); // Trigger dependency
      this.loadDealers();
    });
  }

  loadDealers() {
    this.apiService.getDealers().subscribe(data => {
      this.dealers.set(data);
      
      // Auto-select first dealer if none selected or current selection invalid
      const current = this.apiService.selectedDealerCode();
      const exists = data.find(d => d.dealerCode === current);

      if (data.length > 0 && !exists) {
        this.apiService.selectedDealerCode.set(data[0].dealerCode);
      } else if (data.length === 0) {
        this.apiService.selectedDealerCode.set('');
      }
    });
  }

  onDealerChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.apiService.selectedDealerCode.set(select.value);
  }
}
