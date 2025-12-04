
import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { NotificationService } from './services/notification.service';
import { ThemeService } from './services/theme.service';
import { AuthService } from './services/auth.service';
import { Dealer } from './models/app.types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent {
  apiService = inject(ApiService);
  notificationService = inject(NotificationService);
  themeService = inject(ThemeService);
  authService = inject(AuthService); // Injected to access isAuthenticated signal

  dealers = signal<Dealer[]>([]);
  isContextSwitching = signal(false); // UI State for the loading overlay
  targetDealerName = signal('');

  constructor() {
    // Effect to reload dealers when mode changes (Demo <-> Live)
    effect(() => {
      this.apiService.useMockData(); // Trigger dependency
      
      // Only load dealers if authenticated
      if (this.authService.isAuthenticated()) {
        this.loadDealers();
      }
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
    const newCode = select.value;
    const dealerObj = this.dealers().find(d => d.dealerCode === newCode);
    const dealerName = dealerObj ? dealerObj.dealerName : newCode;

    // 1. Activate Loading State
    this.isContextSwitching.set(true);
    this.targetDealerName.set(dealerName);
    
    // 2. Update the Global Signal immediately so data starts fetching in background
    this.apiService.selectedDealerCode.set(newCode);

    // 3. Keep the overlay for at least 800ms to ensure user sees the transition 
    // and data has time to clear/reload in child components
    setTimeout(() => {
      this.isContextSwitching.set(false);
      this.notificationService.show(`Contexto actualizado: ${dealerName}`, 'success');
    }, 800);
  }

  removeNotification(id: string) {
    this.notificationService.remove(id);
  }
}
