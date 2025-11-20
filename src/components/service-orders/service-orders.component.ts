import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { OrderStrategyService } from '../../services/order-strategy.service';
import { BusinessRulesService } from '../../services/business-rules.service';
import { ServiceOrder, ServiceOrderItem, OrderStatus, MappingItem, TransmissionPayload } from '../../models/app.types';
import { NotificationService } from '../../services/notification.service';
import { forkJoin } from 'rxjs';

interface ModelGroup {
  groupId: string; // Unique Key: Model + Year
  modelName: string;
  year: string;
  count: number;
  items: {
    orderId: string;
    orderNumber: string;
    vin: string;
    item: ServiceOrderItem;
  }[];
}

@Component({
  selector: 'app-service-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './service-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceOrdersComponent {
  api = inject(ApiService);
  store = inject(StoreService);
  gemini = inject(GeminiService);
  strategyService = inject(OrderStrategyService);
  rulesService = inject(BusinessRulesService);
  notification = inject(NotificationService);

  // --- VIEW STATE ---
  viewMode = signal<'list' | 'batch'>('batch'); // Default to Batch
  
  // --- FILTERS ---
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];
  searchOrderNumber = signal<string>('');

  // --- DATA STATE ---
  rawOrders = signal<ServiceOrder[]>([]);
  isLoading = signal(false);
  selectedOrder = signal<ServiceOrder | null>(null);
  
  // --- BATCH LINKER STATE ---
  selectedBatchModelGroup = signal<string | null>(null);
  batchCatalogSearch = signal('');
  selectedBatchItems = signal<Set<string>>(new Set());
  selectedBatchTargetCode = signal<MappingItem | null>(null);
  isBatchProcessing = signal(false);
  
  // --- TRANSMISSION STATE ---
  showTransmitModal = signal(false);
  transmissionPayload = signal<TransmissionPayload | null>(null);
  isTransmitting = signal(false);

  // --- INDIVIDUAL LINK STATE ---
  itemToLink = signal<ServiceOrderItem | null>(null);
  targetBydSeries = signal<string>(''); 
  searchTerm = signal<string>(''); 
  selectedCandidate = signal<MappingItem | null>(null);

  // --- COMPUTED: Filtered Orders (List Mode) ---
  filteredOrders = computed(() => {
    let list = this.rawOrders();
    const term = this.searchOrderNumber().toLowerCase();
    if (term) {
      list = list.filter(o => o.orderNumber.toLowerCase().includes(term));
    }
    return list;
  });

  // --- COMPUTED: BATCH LOGIC (Grouping by Model + Year) ---
  pendingItemsByModel = computed(() => {
    const groups = new Map<string, ModelGroup>();
    
    this.rawOrders().forEach(order => {
      if (order.status === 'Transmitted' || order.status === 'Completed') return;

      // Normalización estricta: Usar Modelo Raw + Año
      const modelName = (order.modelDescRaw || order.modelCodeRaw || 'GENERICO').split(' ')[0] + ' ' + (order.modelDescRaw || '').split(' ')[1]; 
      const year = order.year || 'N/A';
      const groupId = `${modelName}|${year}`;

      if (!groups.has(groupId)) {
        groups.set(groupId, { 
            groupId, 
            modelName: modelName.trim(), 
            year, 
            count: 0, 
            items: [] 
        });
      }

      const group = groups.get(groupId)!;

      order.items.forEach(item => {
        if (!item.isLinked && this.rulesService.isItemRelevant(item.code)) {
           group.items.push({
             orderId: order.id,
             orderNumber: order.orderNumber,
             vin: order.vin,
             item: item
           });
           group.count++;
        }
      });
    });

    return Array.from(groups.values())
      .filter(g => g.count > 0)
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
  });

  batchCompatibleCatalog = computed(() => {
    const activeGroupId = this.selectedBatchModelGroup();
    const term = this.batchCatalogSearch().toLowerCase();
    
    if (!activeGroupId) return [];
    
    // Extract base model name from group ID (e.g., "SONG PLUS")
    const modelBaseName = activeGroupId.split('|')[0].trim().toUpperCase();

    return this.store.mappings().filter(m => {
      const s1 = (m.vehicleSeries || '').toUpperCase();
      // Fuzzy match: Catalog "SONG PLUS DMI" matches Group "SONG PLUS"
      const matchesModel = s1.includes(modelBaseName) || modelBaseName.includes(s1);
      
      if (!matchesModel) return false;

      if (term) {
        return m.description?.toLowerCase().includes(term) || m.bydCode.toLowerCase().includes(term);
      }
      return true;
    }).slice(0, 100);
  });

  filteredCandidates = computed(() => {
     // For Individual Link Modal
     const term = this.searchTerm().toLowerCase();
     const series = this.targetBydSeries().toUpperCase(); // Should be set from order context
     
     return this.store.mappings().filter(m => {
        // Basic filtering for individual modal
        if(series && !m.vehicleSeries?.toUpperCase().includes(series)) return false;
        if(term && !m.description?.toLowerCase().includes(term) && !m.bydCode.toLowerCase().includes(term)) return false;
        return true;
     }).slice(0, 50);
  });


  constructor() {
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      if (dealer) this.fetchOrders();
    });
  }

  fetchOrders() {
    const currentDealer = this.api.selectedDealerCode();
    if (!currentDealer) return;

    this.isLoading.set(true);
    this.api.getOrders(this.startDate, this.endDate, currentDealer).subscribe({
      next: (orders) => {
        this.rawOrders.set(orders);
        this.isLoading.set(false);
      },
      error: () => {
        this.rawOrders.set([]);
        this.isLoading.set(false);
      }
    });
  }

  // --- LIST VIEW ACTIONS ---

  selectOrder(order: ServiceOrder) {
    this.selectedOrder.set(order);
  }

  canTransmit(order: ServiceOrder): boolean {
    return order.items.some(i => i.isLinked) && order.status !== 'Transmitted';
  }

  // --- BATCH ACTIONS ---

  selectBatchModel(groupId: string) {
    this.selectedBatchModelGroup.set(groupId);
    this.selectedBatchItems.set(new Set());
    this.selectedBatchTargetCode.set(null);
  }

  getActiveGroupItems() {
     const gid = this.selectedBatchModelGroup();
     return this.pendingItemsByModel().find(g => g.groupId === gid)?.items || [];
  }

  toggleBatchItem(key: string, event: any) {
    const checked = event.target.checked;
    const current = new Set(this.selectedBatchItems());
    if (checked) current.add(key);
    else current.delete(key);
    this.selectedBatchItems.set(current);
  }

  toggleBatchSelectAll(event: any) {
    const checked = event.target.checked;
    const items = this.getActiveGroupItems();
    const current = new Set(this.selectedBatchItems());
    
    items.forEach(i => {
       const key = `${i.orderNumber}_${i.item.code}`;
       if(checked) current.add(key);
       else current.delete(key);
    });
    this.selectedBatchItems.set(current);
  }

  selectBatchTarget(mapping: MappingItem) {
    this.selectedBatchTargetCode.set(mapping);
  }

  confirmBatchLink() {
    const mapping = this.selectedBatchTargetCode();
    const selection = this.selectedBatchItems();
    const itemsData = this.getActiveGroupItems();

    if (!mapping || selection.size === 0) return;

    this.isBatchProcessing.set(true);

    const itemsToLink = itemsData
      .filter(d => selection.has(`${d.orderNumber}_${d.item.code}`))
      .map(d => ({ daltonCode: d.item.code, description: d.item.description }));

    this.api.linkOrderItemsBatch(itemsToLink, mapping.bydCode, mapping.bydType).subscribe(success => {
       if(success) {
          // Update Local State
          this.rawOrders.update(orders => orders.map(o => {
             const updatedItems = o.items.map(i => {
                if(itemsToLink.some(link => link.daltonCode === i.code)) {
                   return { ...i, isLinked: true, linkedBydCode: mapping.bydCode };
                }
                return i;
             });
             return { ...o, items: updatedItems };
          }));
          
          this.notification.show(`¡${itemsToLink.length} ítems vinculados exitosamente!`, 'success');
          this.selectedBatchItems.set(new Set());
          this.selectedBatchTargetCode.set(null);
          
          // Auto-advance if group empty
          if(this.getActiveGroupItems().length === 0) {
             this.selectedBatchModelGroup.set(null);
          }
       } else {
          this.notification.show('Error al vincular lote.', 'error');
       }
       this.isBatchProcessing.set(false);
    });
  }

  // --- INDIVIDUAL ACTIONS ---

  openLinkModal(item: ServiceOrderItem) {
     this.itemToLink.set(item);
     // Attempt to set series context from selected order
     const order = this.selectedOrder();
     if(order) {
        const series = (order.modelDescRaw || '').split(' ')[0];
        this.targetBydSeries.set(series); 
     }
  }

  closeLinkModal() {
     this.itemToLink.set(null);
     this.selectedCandidate.set(null);
  }

  selectCandidate(c: MappingItem) {
     this.selectedCandidate.set(c);
  }

  confirmLink() {
     const item = this.itemToLink();
     const cand = this.selectedCandidate();
     if(!item || !cand) return;

     this.api.linkOrderItem(item.code, cand.bydCode, cand.bydType, item.description).subscribe(success => {
        if(success) {
           const order = this.selectedOrder();
           if(order) {
              const newItems = order.items.map(i => i.code === item.code ? {...i, isLinked: true, linkedBydCode: cand.bydCode} : i);
              this.selectedOrder.set({...order, items: newItems});
              // Update global list too
              this.rawOrders.update(list => list.map(o => o.id === order.id ? {...o, items: newItems} : o));
           }
           this.closeLinkModal();
           this.notification.show('Vinculado correctamente', 'success');
        }
     });
  }

  // --- TRANSMISSION ---

  initiateTransmission() {
     const order = this.selectedOrder();
     if(order) {
        this.transmissionPayload.set(this.api.buildTransmissionPayload(order));
        this.showTransmitModal.set(true);
     }
  }

  closeTransmitModal() {
     this.showTransmitModal.set(false);
  }

  confirmTransmission() {
     const payload = this.transmissionPayload();
     if(!payload) return;
     
     this.api.transmitOrderToPlant(payload).subscribe(success => {
        if(success) {
           this.notification.show('Orden transmitida', 'success');
           this.closeTransmitModal();
           this.fetchOrders(); // Refresh status
        } else {
           this.notification.show('Error en transmisión', 'error');
        }
     });
  }
  
  // Helper for template visible items in List Mode
  visibleItems() {
     const order = this.selectedOrder();
     return order ? order.items.filter(i => this.rulesService.isItemRelevant(i.code)) : [];
  }
}
