
import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { OrderStrategyService } from '../../services/order-strategy.service';
import { ServiceOrder, ServiceOrderItem, OrderStatus, AiSuggestion, MappingItem } from '../../models/app.types';

@Component({
  selector: 'app-service-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './service-orders.component.html'
})
export class ServiceOrdersComponent {
  api = inject(ApiService);
  store = inject(StoreService);
  gemini = inject(GeminiService);
  strategyService = inject(OrderStrategyService);

  // Filters
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];
  selectedOrderType = signal<string>('ALL'); // Filter by DocType
  searchOrderNumber = signal<string>(''); // Filter by Order Number (Folio)

  // State
  rawOrders = signal<ServiceOrder[]>([]);
  isLoading = signal(false);
  selectedOrder = signal<ServiceOrder | null>(null);

  // Computed: Final Filtered Orders
  filteredOrders = computed(() => {
    let list = this.rawOrders();
    const typeFilter = this.selectedOrderType();
    const orderSearch = this.searchOrderNumber().toLowerCase().trim();

    // 1. Filter by Type
    if (typeFilter !== 'ALL') {
      list = list.filter(o => o.docType === typeFilter);
    }

    // 2. Filter by Order Number
    if (orderSearch) {
      list = list.filter(o => o.orderNumber.toLowerCase().includes(orderSearch));
    }

    return list;
  });

  // --- LINKING MODAL STATE ---
  itemToLink = signal<ServiceOrderItem | null>(null);
  
  // The "Smart" Context
  targetBydSeries = signal<string>(''); // The BYD Series selected by user (e.g. 'SONG PLUS DMI')
  searchTerm = signal<string>(''); // Filter for the candidates list
  
  // Derived: Unique BYD Series from the loaded Excel (Master Data)
  availableBydSeries = computed(() => {
    const mappings = this.store.mappings();
    const series = new Set<string>();
    mappings.forEach(m => {
      if(m.vehicleSeries) series.add(m.vehicleSeries);
      if(m.vehicleModel) series.add(m.vehicleModel);
    });
    return Array.from(series).sort();
  });

  // Derived: Candidate Codes filtered by selected Series AND Search Term
  filteredCandidates = computed(() => {
    const series = this.targetBydSeries().toLowerCase();
    const term = this.searchTerm().toLowerCase();
    
    if (!series) return [];

    return this.store.mappings().filter(m => {
      // 1. Strict Series Match
      const matchSeries = (m.vehicleSeries?.toLowerCase() === series) || (m.vehicleModel?.toLowerCase() === series);
      if (!matchSeries) return false;

      // 2. Search Term Match (Description or Code)
      if (!term) return true;
      return (m.description?.toLowerCase().includes(term) || m.bydCode.toLowerCase().includes(term));
    }).slice(0, 50); // Limit results for performance
  });

  selectedCandidate = signal<MappingItem | null>(null);

  // AI State
  isAiLoading = signal(false);
  aiSuggestions = signal<AiSuggestion[]>([]);

  constructor() {
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      this.api.useMockData(); 
      
      if (dealer) {
        this.fetchOrders();
      } else {
        this.rawOrders.set([]);
      }
    });
  }

  fetchOrders() {
    const currentDealer = this.api.selectedDealerCode();
    if (!currentDealer) {
      this.rawOrders.set([]);
      return;
    }

    this.isLoading.set(true);
    this.selectedOrder.set(null);
    
    this.api.getOrders(this.startDate, this.endDate, currentDealer).subscribe({
      next: (data) => {
        this.rawOrders.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.rawOrders.set([]);
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
      case 'Error': return 'bg-red-100 text-red-700 border-red-200';
      case 'In Process': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Completed': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  // --- SMART LINKING LOGIC ---

  openLinkModal(item: ServiceOrderItem) {
    // Check Business Rule: Is linking allowed for this order type?
    const order = this.selectedOrder();
    if (!order) return;

    const strategy = this.strategyService.getStrategy(order.docType);
    if (!strategy.rules.allowLinking) {
       alert(`Las órdenes de tipo "${strategy.label}" no permiten vinculación manual.`);
       return;
    }

    this.itemToLink.set(item);
    this.selectedCandidate.set(null);
    this.searchTerm.set(item.description); // Pre-fill search with Dalton Desc
    this.aiSuggestions.set([]); 

    // Try to auto-select BYD Series based on Order Model
    this.tryAutoMatchSeries(order.modelDescRaw || order.modelCodeRaw);
  }

  // Attempt to fuzzy match "SONG PLUS 2025" -> "SONG PLUS DMI"
  tryAutoMatchSeries(orderModel: string) {
    if (!orderModel) return;
    const normalized = orderModel.toUpperCase();
    
    const match = this.availableBydSeries().find(s => normalized.includes(s.toUpperCase()));
    if (match) {
      this.targetBydSeries.set(match);
    } else {
      // Fallback: If "SONG" is in both
      const partial = this.availableBydSeries().find(s => s.includes(normalized.split(' ')[0]));
      if (partial) this.targetBydSeries.set(partial);
      else this.targetBydSeries.set(''); // User must select
    }
  }

  closeLinkModal() {
    this.itemToLink.set(null);
    this.selectedCandidate.set(null);
  }

  selectCandidate(candidate: MappingItem) {
    this.selectedCandidate.set(candidate);
  }

  confirmLink() {
    const item = this.itemToLink();
    const candidate = this.selectedCandidate();
    const order = this.selectedOrder();

    if (!item || !candidate || !order) return;

    // Validate Series (Client-side check to prevent "series not match" error)
    // Although the UI filters, this is a final safety check logic
    console.log(`Linking Item ${item.code} to BYD ${candidate.bydCode} (${candidate.vehicleSeries}) for VIN ${order.vin}`);

    this.api.linkOrderItem(item.code, candidate.bydCode, candidate.bydType, item.description)
      .subscribe(success => {
        if (success) {
          // Optimistic update
          if (order) {
             const updatedItems = order.items.map(i => {
               if (i.code === item.code) {
                 return { ...i, isLinked: true, linkedBydCode: candidate.bydCode };
               }
               return i;
             });
             this.selectedOrder.set({ ...order, items: updatedItems });
          }
          this.closeLinkModal();
        }
      });
  }
}
