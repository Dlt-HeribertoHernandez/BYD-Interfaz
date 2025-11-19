
import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { ServiceOrder, ServiceOrderItem, OrderStatus, AiSuggestion } from '../../models/app.types';

@Component({
  selector: 'app-service-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './service-orders.component.html'
})
export class ServiceOrdersComponent {
  api = inject(ApiService);
  store = inject(StoreService); // Injected to access historical mappings for AI context
  gemini = inject(GeminiService);

  // Filters
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];

  // State
  orders = signal<ServiceOrder[]>([]);
  isLoading = signal(false);
  selectedOrder = signal<ServiceOrder | null>(null);

  // Linking Modal State
  itemToLink = signal<ServiceOrderItem | null>(null);
  newLinkBydCode = '';
  newLinkType: 'Labor' | 'Repair' = 'Labor';

  // AI State
  isAiLoading = signal(false);
  aiSuggestions = signal<AiSuggestion[]>([]);

  constructor() {
    // Automatically fetch orders when the selected dealer OR mode changes
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      this.api.useMockData(); // Dependency to trigger reload on switch
      
      if (dealer) {
        this.fetchOrders();
      } else {
        // If no dealer selected (e.g. Live mode empty list), clear orders
        this.orders.set([]);
      }
    });
  }

  fetchOrders() {
    const currentDealer = this.api.selectedDealerCode();
    
    // Guard: Ensure we have a dealer context before fetching
    if (!currentDealer) {
      this.orders.set([]);
      return;
    }

    this.isLoading.set(true);
    this.selectedOrder.set(null);
    
    // Explicitly pass the dealer code to the API
    this.api.getOrders(this.startDate, this.endDate, currentDealer).subscribe({
      next: (data) => {
        this.orders.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.orders.set([]); // Clear on error
        this.isLoading.set(false);
      }
    });
  }

  selectOrder(order: ServiceOrder) {
    this.selectedOrder.set(order);
  }

  closeDetail() {
    this.selectedOrder.set(null);
  }

  getStatusClass(status: OrderStatus): string {
    switch(status) {
      case 'Transmitted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'In Process': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Completed': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  // Linking Logic
  openLinkModal(item: ServiceOrderItem) {
    this.itemToLink.set(item);
    this.newLinkBydCode = '';
    this.newLinkType = 'Labor';
    this.aiSuggestions.set([]); // Clear previous suggestions
    
    // Auto-trigger AI analysis
    this.getAiSuggestions(item);
  }

  closeLinkModal() {
    this.itemToLink.set(null);
    this.aiSuggestions.set([]);
  }

  async getAiSuggestions(item: ServiceOrderItem) {
    this.isAiLoading.set(true);
    try {
      // Pass current known mappings as "Experience/History" context
      const history = this.store.mappings(); 
      const suggestions = await this.gemini.suggestMapping(item.description, item.code, history);
      this.aiSuggestions.set(suggestions);
    } catch (e) {
      console.error("AI Failed", e);
    } finally {
      this.isAiLoading.set(false);
    }
  }

  applySuggestion(sug: AiSuggestion) {
    this.newLinkBydCode = sug.code;
    this.newLinkType = sug.type;
  }

  confirmLink() {
    const item = this.itemToLink();
    if (!item || !this.newLinkBydCode) return;

    this.api.linkOrderItem(item.code, this.newLinkBydCode, this.newLinkType, item.description)
      .subscribe(success => {
        if (success) {
          // Optimistic update of the UI
          const currentOrder = this.selectedOrder();
          if (currentOrder) {
             const updatedItems = currentOrder.items.map(i => {
               if (i.code === item.code) {
                 return { ...i, isLinked: true, linkedBydCode: this.newLinkBydCode };
               }
               return i;
             });
             this.selectedOrder.set({ ...currentOrder, items: updatedItems });
          }
          this.closeLinkModal();
        }
      });
  }
}
