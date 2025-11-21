
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { OrderStrategyService } from '../../services/order-strategy.service';
import { BusinessRulesService } from '../../services/business-rules.service';
import { ServiceOrder, ServiceOrderItem, MappingItem, TransmissionPayload } from '../../models/app.types';
import { NotificationService } from '../../services/notification.service';

/**
 * ModelGroup: Estructura interna para agrupar órdenes en el modo "Batch".
 * Clave para la eficiencia de la UI al renderizar miles de items.
 */
interface ModelGroup {
  groupId: string; // Llave compuesta: MODELO + AÑO (ej. "SONG PLUS|2025")
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
  rawOrders = signal<ServiceOrder[]>([]);
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

  /**
   * LÓGICA CENTRAL DE AGRUPAMIENTO (BATCH ENGINE)
   * ---------------------------------------------
   * Transforma una lista plana de órdenes en grupos jerárquicos basados en Modelo y Año.
   * Esto permite al usuario procesar "Todos los Song Plus 2025" de una sola vez.
   * 
   * Arquitectura (Strategy Pattern implícito):
   * 1. Filtrado Previo: Se ignoran órdenes ya transmitidas.
   * 2. Normalización: Extrae y limpia nombres de modelo para agrupar variaciones.
   * 3. Whitelist (Reglas de Negocio): Filtra items irrelevantes (ej. items administrativos)
   *    usando BusinessRulesService.
   */
  pendingItemsByModel = computed<ModelGroup[]>(() => {
    const groups = new Map<string, ModelGroup>();
    
    this.rawOrders().forEach(order => {
      if (order.status === 'Transmitted' || order.status === 'Completed') return;

      // Normalización: Extraer nombre base del modelo
      // Ej: "SONG PLUS 2025 BC DM-I..." -> "SONG PLUS"
      const modelName = (order.modelDescRaw || order.modelCodeRaw || 'GENERICO').split(' ')[0] + ' ' + ((order.modelDescRaw || '').split(' ')[1] || ''); 
      const year = order.year || 'N/A';
      
      // Generar ID único de grupo
      const groupId = `${modelName.trim()}|${year}`;

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

      // Agregar items pendientes que pasen las reglas de negocio (whitelist)
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

    // Convertir Map a Array y ordenar alfabéticamente
    return Array.from(groups.values())
      .filter(g => g.count > 0)
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
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
    // Recargar órdenes si cambia la agencia seleccionada
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
          // Actualización optimista del estado local
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
          
          // Si el grupo queda vacío, deseleccionar
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
           this.fetchOrders(); // Recargar estado
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
