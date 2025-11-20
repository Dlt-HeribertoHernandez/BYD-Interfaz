
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StoreService } from '../../services/store.service';
import { GeminiService } from '../../services/gemini.service';
import { OrderStrategyService } from '../../services/order-strategy.service';
import { BusinessRulesService } from '../../services/business-rules.service';
import { ServiceOrder, ServiceOrderItem, OrderStatus, AiSuggestion, MappingItem, IntegrationLog } from '../../models/app.types';
import { NotificationService } from '../../services/notification.service';
import { forkJoin } from 'rxjs';

// Interfaz auxiliar interna para manejo de puntajes de coincidencia
interface ScoredMapping extends MappingItem {
  matchScore: number;
}

/**
 * Componente de visualización y gestión de Órdenes de Servicio.
 * Es el corazón operativo donde se realiza la vinculación manual asistida por IA.
 */
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

  // --- FILTROS (Vinculados a ngModel) ---
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date().toISOString().split('T')[0];
  selectedOrderType = signal<string>('ALL');
  searchOrderNumber = signal<string>('');

  // --- ESTADO ---
  rawOrders = signal<ServiceOrder[]>([]);
  isLoading = signal(false);
  selectedOrder = signal<ServiceOrder | null>(null);
  isTransmitting = signal(false);

  // --- COMPUTED: Filtrado de Órdenes ---
  // Optimizado con Signals para evitar recalculaciones en cada ciclo de detección
  filteredOrders = computed(() => {
    let list = this.rawOrders();
    const typeFilter = this.selectedOrderType();
    const orderSearch = this.searchOrderNumber().toLowerCase().trim();

    if (typeFilter !== 'ALL') {
      list = list.filter(o => o.docType === typeFilter);
    }

    if (orderSearch) {
      list = list.filter(o => o.orderNumber.toLowerCase().includes(orderSearch));
    }

    return list;
  });

  // --- LÓGICA DE VISTA DETALLADA ---
  
  /**
   * Ítems visibles según la Regla de Negocio Activa.
   * Por ejemplo, oculta refacciones si la regla solo pide "Labor".
   */
  visibleItems = computed(() => {
    const order = this.selectedOrder();
    if (!order) return [];
    return order.items.filter(item => this.rulesService.isItemRelevant(item.code));
  });

  /**
   * Resumen de lo que se está ocultando (Refacciones, Aceites, etc.)
   */
  hiddenItemsSummary = computed(() => {
    const order = this.selectedOrder();
    if (!order) return null;
    
    const hidden = order.items.filter(item => !this.rulesService.isItemRelevant(item.code));
    if (hidden.length === 0) return null;

    const totalHiddenValue = hidden.reduce((acc, curr) => acc + (curr.total || 0), 0);
    
    return {
      count: hidden.length,
      totalValue: totalHiddenValue,
      sampleNames: hidden.slice(0, 2).map(i => i.description).join(', ') + (hidden.length > 2 ? '...' : '')
    };
  });

  // --- MODAL DE VINCULACIÓN INTELIGENTE ---
  itemToLink = signal<ServiceOrderItem | null>(null);
  
  // Contexto "Smart"
  targetBydSeries = signal<string>(''); // Serie BYD seleccionada manualmente o auto-detectada
  searchTerm = signal<string>(''); 
  
  // Series únicas disponibles en el catálogo cargado
  availableBydSeries = computed(() => {
    const mappings = this.store.mappings();
    const series = new Set<string>();
    mappings.forEach(m => {
      if(m.vehicleSeries) series.add(m.vehicleSeries);
      if(m.vehicleModel) series.add(m.vehicleModel);
    });
    return Array.from(series).sort();
  });

  // Estado IA
  isAiAnalyzing = signal(false);
  aiAnalysis = signal<{ translation: string, keywords: string[] } | null>(null);

  // --- LÓGICA DE BÚSQUEDA Y CANDIDATOS ---

  /**
   * Candidatos filtrados por Serie y Término de Búsqueda.
   * Limita a 50 resultados para rendimiento.
   */
  filteredCandidates = computed(() => {
    const series = this.targetBydSeries().toLowerCase();
    const term = this.searchTerm().toLowerCase();
    
    if (!series) return [];

    return this.store.mappings().filter(m => {
      // Coincidencia estricta de serie (evita mostrar piezas de otro coche)
      const s1 = m.vehicleSeries?.toLowerCase() || '';
      const s2 = m.vehicleModel?.toLowerCase() || '';
      const matchSeries = (s1 === series) || (s2 === series);
      
      if (!matchSeries) return false;

      if (!term) return true;
      return (m.description?.toLowerCase().includes(term) || m.bydCode.toLowerCase().includes(term));
    }).slice(0, 50);
  });

  /**
   * Sugerencias de IA (Ranking Algorítmico).
   * Utiliza las keywords extraídas por Gemini para puntuar coincidencias.
   */
  aiSuggestedCandidates = computed(() => {
    const analysis = this.aiAnalysis();
    const series = this.targetBydSeries().toLowerCase();
    
    if (!analysis || !series) return [];
    
    const keywords = analysis.keywords
      .map(k => k.toLowerCase().trim())
      .filter(k => k.length > 2); // Ignorar palabras muy cortas
      
    if (keywords.length === 0) return [];

    const candidates: ScoredMapping[] = [];

    this.store.mappings().forEach(m => {
      const s1 = m.vehicleSeries?.toLowerCase() || '';
      const s2 = m.vehicleModel?.toLowerCase() || '';
      const matchSeries = (s1 === series) || (s2 === series);
      if (!matchSeries) return;

      let score = 0;
      const desc = m.description?.toLowerCase() || '';
      const code = m.bydCode?.toLowerCase() || '';
      const descTokens = desc.split(/[\s-_,.]+/);

      keywords.forEach(kw => {
        // 1. Coincidencia exacta de palabra (Alto valor)
        if (descTokens.includes(kw)) score += 15;
        // 2. Contenencia parcial (Valor medio)
        else if (desc.includes(kw)) score += 8;
        // 3. Coincidencia en código (mnemónicos)
        if (code.includes(kw)) score += 5;
        // 4. Bonus inicio de cadena
        if (kw.length > 4 && desc.startsWith(kw)) score += 5;
      });

      if (score > 0) {
        candidates.push({ ...m, matchScore: score });
      }
    });

    return candidates.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20); 
  });

  selectedCandidate = signal<MappingItem | null>(null);

  constructor() {
    // Efecto: Recargar órdenes si cambia la agencia seleccionada
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

  /**
   * Carga órdenes y logs simultáneamente.
   * Usa `forkJoin` para esperar ambas respuestas antes de procesar.
   */
  fetchOrders() {
    const currentDealer = this.api.selectedDealerCode();
    if (!currentDealer) {
      this.rawOrders.set([]);
      return;
    }

    this.isLoading.set(true);
    this.selectedOrder.set(null);
    
    forkJoin({
      orders: this.api.getOrders(this.startDate, this.endDate, currentDealer),
      logs: this.api.getIntegrationLogs(this.startDate, this.endDate)
    }).subscribe({
      next: ({ orders, logs }) => {
        // Enriquecer las órdenes con el estado real de los logs (Transmitted/Error)
        const mergedOrders = this.mergeOrdersWithLogs(orders, logs);
        this.rawOrders.set(mergedOrders);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.rawOrders.set([]);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Fusiona órdenes con sus logs para determinar el estado real.
   * Si el último log es un error, el estado de la orden pasa a 'Error'.
   */
  mergeOrdersWithLogs(orders: ServiceOrder[], logs: IntegrationLog[]): ServiceOrder[] {
    return orders.map(order => {
      const orderLogs = logs
        .filter(l => l.vchOrdenServicio === order.orderNumber)
        .sort((a, b) => new Date(b.dtmcreated).getTime() - new Date(a.dtmcreated).getTime());

      if (orderLogs.length > 0) {
        const latestLog = orderLogs[0];
        let newStatus = order.status;
        
        if (latestLog.isError) {
          newStatus = 'Error';
        } else {
          newStatus = 'Transmitted';
        }

        return {
          ...order,
          status: newStatus,
          logs: orderLogs.map(l => ({
             timestamp: l.dtmcreated,
             message: l.vchMessage,
             status: l.isError ? 'Error' : 'Transmitted'
          }))
        };
      }
      return order;
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

  // --- LÓGICA DE TRANSMISIÓN ---

  canTransmit(order: ServiceOrder): boolean {
    const hasLinks = order.items.some(i => i.isLinked);
    return hasLinks && order.status !== 'Transmitted';
  }

  transmitOrderToPlant() {
    const order = this.selectedOrder();
    if (!order) return;
    
    // Validación: Los códigos placeholder (obligatorios) deben estar vinculados
    const unlinkedPlaceholders = order.items.filter(i => 
      !i.isLinked && this.rulesService.isPlaceholderCode(i.code)
    );

    if (unlinkedPlaceholders.length > 0) {
       this.notification.show(
         `Faltan vincular ${unlinkedPlaceholders.length} items obligatorios (Ej: ${unlinkedPlaceholders[0].code}).`, 
         'warning'
       );
       return;
    }

    if (!confirm(`¿Transmitir Orden ${order.orderNumber} a Planta BYD?`)) return;

    this.isTransmitting.set(true);
    this.api.transmitOrderToPlant(order).subscribe(success => {
       this.isTransmitting.set(false);
       if (success) {
          this.notification.show('Orden transmitida exitosamente.', 'success');
          this.fetchOrders(); // Refrescar estado
       } else {
          this.notification.show('Error al transmitir. Verifique logs.', 'error');
       }
    });
  }

  // --- LÓGICA DE VINCULACIÓN (MODAL) ---

  openLinkModal(item: ServiceOrderItem) {
    const order = this.selectedOrder();
    if (!order) return;

    const strategy = this.strategyService.getStrategy(order.docType);
    if (!strategy.rules.allowLinking) {
       alert(`Las órdenes de tipo "${strategy.label}" no permiten vinculación manual.`);
       return;
    }

    this.itemToLink.set(item);
    this.selectedCandidate.set(null);
    this.searchTerm.set(''); 
    this.aiAnalysis.set(null);

    // Auto-match de serie del vehículo
    this.tryAutoMatchSeries(order.modelDescRaw || order.modelCodeRaw);
  }

  async analyzeItemWithAi() {
    const item = this.itemToLink();
    if (!item) return;

    this.isAiAnalyzing.set(true);
    try {
      // Llamada a Gemini para traducción y keywords
      const result = await this.gemini.translateToKeywords(item.description);
      this.aiAnalysis.set(result);
      
      if (result.translation) {
        this.searchTerm.set(result.translation);
        this.notification.show('Búsqueda actualizada con traducción al inglés', 'info', 3000);
      }
    } finally {
      this.isAiAnalyzing.set(false);
    }
  }

  /**
   * Intenta adivinar la serie BYD basándose en la descripción del modelo del DMS.
   * Ej: "SONG PLUS 2025" -> "SONG PLUS DMI"
   */
  tryAutoMatchSeries(orderModel: string) {
    if (!orderModel) return;
    const normalized = orderModel.toUpperCase();
    
    const match = this.availableBydSeries().find(s => normalized.includes(s.toUpperCase()));
    if (match) {
      this.targetBydSeries.set(match);
    } else {
      // Fallback parcial
      const partial = this.availableBydSeries().find(s => s.includes(normalized.split(' ')[0]));
      if (partial) this.targetBydSeries.set(partial);
      else this.targetBydSeries.set('');
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

    this.api.linkOrderItem(item.code, candidate.bydCode, candidate.bydType, item.description)
      .subscribe(success => {
        if (success) {
          // Actualización local optimista
          if (order) {
             const updatedItems = order.items.map(i => {
               if (i.code === item.code) {
                 return { 
                   ...i, 
                   isLinked: true, 
                   linkedBydCode: candidate.bydCode,
                   linkedBydDescription: candidate.description 
                 };
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
