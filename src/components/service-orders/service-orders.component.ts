
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { OrderStrategyService } from '../../services/order-strategy.service';
import { BusinessRulesService } from '../../services/business-rules.service';
import { ServiceOrder, ServiceOrderItem, MappingItem, TransmissionPayload, ModelGroup } from '../../models/app.types';
import { NotificationService } from '../../services/notification.service';

/**
 * ServiceOrdersComponent
 * ----------------------
 * Componente complejo que maneja dos vistas principales:
 * 1. Batch View: Agrupación inteligente para asignación masiva de códigos.
 * 2. List View: Detalle tradicional orden por orden.
 */
@Component({
  selector: 'app-service-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './service-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceOrdersComponent {
  // Dependencias
  api = inject(ApiService);
  store = inject(StoreService);
  gemini = inject(GeminiService);
  strategyService = inject(OrderStrategyService);
  rulesService = inject(BusinessRulesService);
  notification = inject(NotificationService);

  // --- ESTADO DE VISTA ---
  viewMode = signal<'list' | 'batch'>('batch');
  
  // --- FILTROS ---
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];
  searchOrderNumber = signal<string>('');

  // --- ESTADO DE DATOS ---
  rawOrders = signal<ServiceOrder[]>([]); // Solo para modo lista
  pendingItemsByModel = signal<ModelGroup[]>([]); // Solo para modo batch (Traido de endpoint)
  
  isLoading = signal(false);
  selectedOrder = signal<ServiceOrder | null>(null);
  
  // --- ESTADO BATCH (ASIGNACIÓN MASIVA) ---
  selectedBatchModelGroup = signal<string | null>(null);
  batchCatalogSearch = signal('');
  selectedBatchItems = signal<Set<string>>(new Set()); // Set<"OrderId_ItemCode">
  selectedBatchTargetCode = signal<MappingItem | null>(null);
  isBatchProcessing = signal(false);
  
  // --- ESTADO TRANSMISIÓN ---
  showTransmitModal = signal(false);
  transmissionPayload = signal<TransmissionPayload | null>(null);

  // --- ESTADO VINCULACIÓN INDIVIDUAL ---
  itemToLink = signal<ServiceOrderItem | null>(null);
  targetBydSeries = signal<string>(''); 
  searchTerm = signal<string>(''); 
  selectedCandidate = signal<MappingItem | null>(null);

  // --- COMPUTED SIGNALS ---

  // Filtro simple para la vista de Lista
  filteredOrders = computed(() => {
    let list = this.rawOrders();
    const term = this.searchOrderNumber().toLowerCase();
    if (term) {
      list = list.filter(o => o.orderNumber.toLowerCase().includes(term));
    }
    return list;
  });

  // Búsqueda inteligente en el catálogo compatible con el grupo seleccionado
  batchCompatibleCatalog = computed(() => {
    const activeGroupId = this.selectedBatchModelGroup();
    const term = this.batchCatalogSearch().toLowerCase();
    
    if (!activeGroupId) return [];
    
    // Extraer modelo base del ID del grupo
    const modelBaseName = activeGroupId.split('|')[0].trim().toUpperCase();

    return this.store.mappings().filter(m => {
      const s1 = (m.vehicleSeries || '').toUpperCase();
      // Fuzzy Match: Catálogo vs Grupo
      const matchesModel = s1.includes(modelBaseName) || modelBaseName.includes(s1);
      
      if (!matchesModel) return false;

      if (term) {
        return m.description?.toLowerCase().includes(term) || m.bydCode.toLowerCase().includes(term);
      }
      return true;
    }).slice(0, 100); // Paginación virtual simple
  });

  // Candidatos para vinculación individual
  filteredCandidates = computed(() => {
     const term = this.searchTerm().toLowerCase();
     const series = this.targetBydSeries().toUpperCase();
     
     return this.store.mappings().filter(m => {
        if(series && !m.vehicleSeries?.toUpperCase().includes(series)) return false;
        if(term && !m.description?.toLowerCase().includes(term) && !m.bydCode.toLowerCase().includes(term)) return false;
        return true;
     }).slice(0, 50);
  });

  constructor() {
    console.log('ServiceOrdersComponent: Initialized');
    
    // Recargar datos si cambia la agencia seleccionada o el modo de vista
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      const mode = this.viewMode(); // Dependencia
      console.log('ServiceOrdersComponent: Context Changed ->', { dealer, mode });
      if (dealer) {
        this.loadDashboardData();
      }
    });
  }

  /**
   * Carga centralizada de datos. 
   * Decide qué endpoint llamar basándose en la vista activa (List vs Batch).
   */
  loadDashboardData() {
    const currentDealer = this.api.selectedDealerCode();
    if (!currentDealer) return;

    this.isLoading.set(true);

    if (this.viewMode() === 'batch') {
       // Modo Batch: Cargar grupos pendientes
       console.log('Fetching Pending Groups for Batch View');
       this.api.getPendingModelGroups(currentDealer).subscribe({
          next: (groups) => {
             this.pendingItemsByModel.set(groups);
             this.isLoading.set(false);
          },
          error: (e) => {
             console.error('Error loading pending groups', e);
             this.pendingItemsByModel.set([]);
             this.isLoading.set(false);
          }
       });
    } else {
       // Modo Lista: Cargar órdenes completas
       console.log('Fetching Full Orders for List View');
       this.api.getOrders(this.startDate, this.endDate, currentDealer).subscribe({
          next: (orders) => {
            this.rawOrders.set(orders);
            this.isLoading.set(false);
          },
          error: (err) => {
            console.error('Error loading orders', err);
            this.rawOrders.set([]);
            this.isLoading.set(false);
          }
       });
    }
  }

  // Alias para el botón de UI
  fetchOrders() {
     this.loadDashboardData();
  }

  // --- ACCIONES UI ---

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

  // Checkbox Individual
  toggleBatchItem(key: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const checked = target.checked;
    
    const current = new Set(this.selectedBatchItems());
    if (checked) current.add(key);
    else current.delete(key);
    
    this.selectedBatchItems.set(current);
  }

  // Checkbox "Seleccionar Todos"
  toggleBatchSelectAll(event: Event) {
    const target = event.target as HTMLInputElement;
    const checked = target.checked;
    
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
          this.notification.show(`¡${itemsToLink.length} ítems vinculados exitosamente!`, 'success');
          this.selectedBatchItems.set(new Set());
          this.selectedBatchTargetCode.set(null);
          
          // Recargar los grupos para reflejar los cambios
          this.loadDashboardData();

          if(this.getActiveGroupItems().length === 0) {
             this.selectedBatchModelGroup.set(null);
          }
       } else {
          this.notification.show('Error al vincular lote.', 'error');
       }
       this.isBatchProcessing.set(false);
    });
  }

  // --- ACCIONES INDIVIDUALES ---

  openLinkModal(item: ServiceOrderItem) {
     this.itemToLink.set(item);
     const order = this.selectedOrder();
     if(order) {
        // Contexto para filtro automático de serie
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
              // Actualizar orden seleccionada y lista global
              this.selectedOrder.set({...order, items: newItems});
              this.rawOrders.update(list => list.map(o => o.id === order.id ? {...o, items: newItems} : o));
           }
           this.closeLinkModal();
           this.notification.show('Vinculado correctamente', 'success');
        }
     });
  }

  // --- TRANSMISIÓN ---

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
           this.loadDashboardData(); // Recargar estado
        } else {
           this.notification.show('Error en transmisión', 'error');
        }
     });
  }
  
  // Helper para template: items visibles en modo lista (aplicando reglas)
  visibleItems() {
     const order = this.selectedOrder();
     return order ? order.items.filter(i => this.rulesService.isItemRelevant(i.code)) : [];
  }
}
