
import { Component, signal, inject, ElementRef, ViewChild, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service';
import { GeminiService } from '../services/gemini.service';
import { ApiService } from '../services/api.service';
import { EndpointConfigService, BydModelSqlRow } from '../services/endpoint-config.service';
import { NotificationService } from '../services/notification.service';
import { BusinessRulesService } from '../services/business-rules.service';
import { MappingItem, ServiceOrderItem } from '../models/app.types';

declare const XLSX: any;

/**
 * Componente principal para la gestión de la vinculación (Mapping).
 * Permite:
 * 1. Cargar Excel masivo.
 * 2. Visualizar y filtrar el catálogo BYD.
 * 3. Vincular códigos manualmente.
 * 4. Ver historial de uso de códigos.
 */
@Component({
  selector: 'app-mapping-linker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mapping-linker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush // MEJORA RENDIMIENTO: Solo actualiza si cambian los Inputs o Signals
})
export class MappingLinkerComponent {
  // Inyecciones de dependencias
  private store = inject(StoreService);
  private api = inject(ApiService);
  private gemini = inject(GeminiService);
  public endpointConfig = inject(EndpointConfigService);
  private notification = inject(NotificationService);
  public rulesService = inject(BusinessRulesService);
  private fb = inject(FormBuilder);

  // --- ESTADO REACTIVO (Signals) ---
  // Datos crudos del store
  mappings = this.store.mappings;
  stats = this.store.stats;

  // Estado de filtros de vista
  selectedSeries = signal<string | null>(null); // Serie de vehículo activa (Carpeta)
  selectedCategory = signal<string | null>(null); // Categoría principal activa
  searchTerm = signal<string>('');
  showLinkedOnly = signal(false);

  // --- COMPUTED: Lógica de Agrupación y Filtrado ---
  // Estas computaciones se cachean y solo se re-ejecutan si sus dependencias cambian.

  // Agrupar por Serie de Vehículo
  seriesGroups = computed(() => {
    const groups = new Map<string, number>();
    this.mappings().forEach(m => {
      const s = m.vehicleSeries || 'GENERICO';
      groups.set(s, (groups.get(s) || 0) + 1);
    });
    
    return Array.from(groups.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // Categorías disponibles dentro de la serie seleccionada
  availableCategories = computed(() => {
    const currentSeries = this.selectedSeries();
    if (!currentSeries) return [];
    
    const cats = new Set<string>();
    this.mappings()
      .filter(m => (m.vehicleSeries || 'GENERICO') === currentSeries)
      .forEach(m => {
        if (m.mainCategory) cats.add(m.mainCategory);
      });
    
    return Array.from(cats).sort();
  });

  // Lista filtrada final para la tabla
  filteredMappings = computed(() => {
    let list = this.mappings();
    const series = this.selectedSeries();
    const cat = this.selectedCategory();
    const term = this.searchTerm().toLowerCase();
    const linkedOnly = this.showLinkedOnly();

    // 1. Filtro por Serie (Estricto)
    if (series) {
      list = list.filter(m => (m.vehicleSeries || 'GENERICO') === series);
    }

    // 2. Filtro por Categoría
    if (cat) {
      list = list.filter(m => m.mainCategory === cat);
    }

    // 3. Filtro "Solo Vinculados"
    if (linkedOnly) {
      list = list.filter(m => m.status === 'Linked' || m.daltonCode !== m.bydCode);
    }

    // 4. Filtro de Texto (Búsqueda global)
    if (term) {
      list = list.filter(m => 
        m.description?.toLowerCase().includes(term) || 
        m.bydCode.toLowerCase().includes(term) ||
        m.daltonCode.toLowerCase().includes(term)
      );
    }

    return list;
  });

  // --- ESTADO DE CARGA MASIVA (Upload) ---
  isUploading = signal(false);
  previewMappings = signal<Omit<MappingItem, 'id' | 'status'>[]>([]);
  previewHeaders = signal<string[]>([]);
  showPreviewModal = signal(false);
  previewData = signal<any[]>([]); 

  // Estado de Inserción SQL
  showInsertionModal = signal(false);
  insertionData = signal<BydModelSqlRow[]>([]);
  
  aiAnalysisResult = signal<string | null>(null);
  isAnalyzing = signal(false);

  // --- ESTADO DE VINCULACIÓN INVERSA (Reverse Linking) ---
  showLinkToOrderModal = signal(false);
  selectedMappingForLink = signal<MappingItem | null>(null);
  
  // Pestañas del modal
  activeLinkModalTab = signal<'pending' | 'history'>('pending');
  
  // Listas para vinculación
  pendingOrderItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  filteredPendingItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  itemSearchTerm = signal('');
  selectedOrderItemsToLink = signal<Set<string>>(new Set());
  isProcessingLink = signal(false);

  // Historial
  usageHistory = signal<{orderRef: string, date: string, description: string, vin: string}[]>([]);
  isLoadingHistory = signal(false);

  // Formulario de registro manual
  linkForm: FormGroup = this.fb.group({
    vehicleSeries: ['', Validators.required],
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor'],
    daltonCode: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    standardHours: [0],
    mainCategory: ['']
  });

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    // Efecto para auto-seleccionar la primera serie disponible si no hay selección
    effect(() => {
      const groups = this.seriesGroups();
      if (groups.length > 0 && !this.selectedSeries()) {
        this.selectedSeries.set(groups[0].name);
      }
    });
  }

  // --- ACCIONES DE UI ---

  selectSeries(name: string) {
    this.selectedSeries.set(name);
    this.selectedCategory.set(null); // Reset category on series change
  }

  toggleCategory(cat: string) {
    if (this.selectedCategory() === cat) {
      this.selectedCategory.set(null);
    } else {
      this.selectedCategory.set(cat);
    }
  }

  onSubmitManual() {
    if (this.linkForm.valid) {
      const formVal = this.linkForm.value;
      
      const newItem = {
        ...formVal,
        bydType: 'Labor',
        vehicleModel: formVal.vehicleSeries // Asumimos modelo = serie por defecto
      };

      this.store.addMapping(newItem);
      
      // Reset parcial para facilitar entrada rápida consecutiva
      this.linkForm.reset({ 
        bydType: 'Labor', 
        vehicleSeries: formVal.vehicleSeries,
        mainCategory: formVal.mainCategory,
        standardHours: 0
      });
      
      this.notification.show('Mapeo manual agregado correctamente.', 'success');
    }
  }

  // --- LÓGICA DE EXCEL (Parsing) ---

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.readExcelAndProcess(file);
    }
  }

  /**
   * Lee el archivo Excel y lo convierte a JSON.
   * NOTA: Usa la librería SheetJS (XLSX) de forma síncrona. 
   * Para archivos muy grandes (>10MB), considerar mover esto a un Web Worker.
   */
  readExcelAndProcess(file: File) {
    this.isUploading.set(true);
    const reader = new FileReader();
    
    reader.onload = (e: any) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length > 0) {
           const headers = Object.keys(jsonData[0] as object);
           this.processWithActiveRule(jsonData, headers);
        } else {
           this.notification.show('El archivo Excel parece estar vacío.', 'warning');
        }
        this.isUploading.set(false);
      } catch (error) {
        console.error("Error parsing Excel:", error);
        this.isUploading.set(false);
        this.notification.show('Error al leer el archivo Excel.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  /**
   * Procesa los datos crudos del Excel aplicando la Regla de Negocio Activa.
   * Detecta inteligentemente qué columna corresponde a qué campo (Heurística).
   */
  processWithActiveRule(rows: any[], headers: string[]) {
    const activeRule = this.rulesService.activeRule();
    if (!activeRule) {
      this.notification.show('No hay una regla de negocio activa.', 'error');
      return;
    }

    const newMappings: Omit<MappingItem, 'id' | 'status'>[] = [];
    const clean = (s: any) => s ? String(s).trim() : '';

    // --- DETECCIÓN HEURÍSTICA DE COLUMNAS ---
    const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

    const isForbiddenForCode = (h: string) => {
       const n = norm(h);
       return n.includes('vehicle') || n.includes('series') || n.includes('modelo') || n.includes('serie') || n.includes('project');
    };

    // Candidatos para Labor Code
    const codeCandidates = ['repairitemcode', 'laborcode', 'labourcode', 'operationcode', 'codigolabor', 'codigojo', 'itemcode', 'codigo'];
    let colBydCode = headers.find(h => !isForbiddenForCode(h) && codeCandidates.includes(norm(h)));
    
    if (!colBydCode) colBydCode = headers.find(h => !isForbiddenForCode(h) && codeCandidates.some(c => norm(h).includes(c)));
    if (!colBydCode) colBydCode = headers.find(h => !isForbiddenForCode(h) && norm(h).includes('code'));

    // Candidatos para Descripción
    const descCandidates = ['repairitemname', 'laborname', 'labourname', 'operationname', 'descripcion', 'description', 'nombre', 'name', 'desc'];
    let colDesc = headers.find(h => h !== colBydCode && descCandidates.includes(norm(h)));
    if (!colDesc) colDesc = headers.find(h => h !== colBydCode && descCandidates.some(c => norm(h).includes(c)));

    // Fallback: Si detectamos código pero no descripción, usar columna siguiente
    if (!colDesc && colBydCode) {
        const codeIdx = headers.indexOf(colBydCode);
        if (codeIdx + 1 < headers.length) colDesc = headers[codeIdx + 1];
    }

    // Otras columnas
    const seriesCandidates = ['projectvehicleseries', 'vehicleseries', 'series', 'serie', 'carline'];
    let colSeries = headers.find(h => seriesCandidates.some(c => norm(h).includes(c)));

    const modelCandidates = ['vehiclecode', 'vehiclemodel', 'modelo', 'model'];
    let colModel = headers.find(h => modelCandidates.some(c => norm(h).includes(c)));

    const hoursCandidates = ['standardlaborhours', 'laborhours', 'labourhours', 'horas', 'hours', 'time', 'amount'];
    let colHours = headers.find(h => hoursCandidates.some(c => norm(h).includes(c)));

    if (!colBydCode) {
       this.notification.show('No se pudo identificar la columna "Labour Code".', 'error');
       return;
    }

    // Transformación de filas
    rows.forEach((row: any) => {
      const bydCode = clean(row[colBydCode]);
      
      if (bydCode && bydCode.length > 1) {
        const daltonCode = this.rulesService.calculateDaltonCode(bydCode, activeRule);
        let desc = colDesc ? clean(row[colDesc]) : '';
        if (!desc) desc = bydCode; 

        const series = colSeries ? clean(row[colSeries]) : 'GENERICO';
        const model = colModel ? clean(row[colModel]) : series;

        let hours = 0;
        if (colHours && row[colHours]) {
           const hStr = String(row[colHours]).replace(',', '.');
           hours = parseFloat(hStr) || 0;
        }

        newMappings.push({
          bydCode: bydCode,
          bydType: 'Labor',
          daltonCode: daltonCode,
          description: desc,
          vehicleModel: model,
          vehicleSeries: series,
          standardHours: hours,
          isBatteryRepair: false,
          modelYear: '2025'
        });
      }
    });

    if (newMappings.length > 0) {
      this.previewMappings.set(newMappings);
      this.previewHeaders.set(['bydCode', 'daltonCode', 'description', 'vehicleSeries', 'standardHours']);
      this.previewData.set(newMappings);
      this.showPreviewModal.set(true);
      this.notification.show(`Columnas detectadas: Código=[${colBydCode}]`, 'info', 5000);
    } else {
      this.notification.show('No se encontraron registros válidos.', 'warning');
    }
  }

  // --- FLUJO DE INSERCIÓN ---

  proceedToInsertion() {
    const items = this.previewMappings();
    const sqlRows = this.endpointConfig.transformToSqlStructure(items);
    this.insertionData.set(sqlRows);
    this.showPreviewModal.set(false);
    this.showInsertionModal.set(true);
  }

  cancelInsertion() {
    this.showInsertionModal.set(false);
    this.showPreviewModal.set(true);
  }

  confirmFinalInsertion() {
    const sqlRows = this.insertionData();
    const items = this.previewMappings();
    const count = items.length;

    if (sqlRows.length === 0) return;

    const payload = this.endpointConfig.buildInsertPayload(sqlRows);

    this.resetUploadState();
    this.notification.show(`Iniciando carga masiva de ${count} registros...`, 'info', 4000);

    this.api.executeDynamicInsert(payload).subscribe({
      next: (success) => {
        if (success) {
           this.store.addBatchMappings(items);
           this.notification.show(`Carga completada: ${count} registros.`, 'success', 6000);
        } else {
           this.notification.show("La carga finalizó con advertencias.", 'warning');
        }
      },
      error: (err) => {
        console.error(err);
        this.notification.show("Error de conexión durante la carga.", 'error');
      }
    });
  }

  resetUploadState() {
    this.previewMappings.set([]);
    this.previewData.set([]);
    this.previewHeaders.set([]);
    this.insertionData.set([]);
    this.showInsertionModal.set(false);
    this.showPreviewModal.set(false); 
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  discardUpload() {
    this.resetUploadState();
  }

  // --- GEMINI AI ---

  async analyzeWithGemini() {
    if (this.mappings().length === 0) return;
    this.isAnalyzing.set(true);
    this.aiAnalysisResult.set(null);
    try {
      const result = await this.gemini.analyzeDataIntegrity(this.mappings());
      this.aiAnalysisResult.set(result);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  deleteItem(id: string) {
    this.store.removeMapping(id);
    this.notification.show('Registro eliminado.', 'info', 2000);
  }

  // --- VINCULACIÓN INVERSA (Desde Catálogo hacia Órdenes) ---

  openLinkToOrdersModal(mapping: MappingItem) {
    this.selectedMappingForLink.set(mapping);
    this.showLinkToOrderModal.set(true);
    this.activeLinkModalTab.set('pending'); 
    this.selectedOrderItemsToLink.set(new Set());
    this.itemSearchTerm.set('');
    this.loadPendingOrderItems();
    this.loadHistory(mapping.bydCode);
  }

  closeLinkModal() {
    this.showLinkToOrderModal.set(false);
    this.selectedMappingForLink.set(null);
    this.usageHistory.set([]);
  }

  loadHistory(bydCode: string) {
    this.isLoadingHistory.set(true);
    this.api.getBydCodeUsageHistory(bydCode).subscribe(history => {
      this.usageHistory.set(history);
      this.isLoadingHistory.set(false);
    });
  }

  loadPendingOrderItems() {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setDate(start.getDate() - 60); // Últimos 60 días
    const startStr = start.toISOString().split('T')[0];

    this.isProcessingLink.set(true); 
    this.api.getOrders(startStr, end).subscribe(orders => {
      const pending: (ServiceOrderItem & { orderRef: string, customerRef: string })[] = [];
      
      orders.forEach(order => {
        if (order.status === 'Rejected' || order.status === 'Completed') return;
        order.items.forEach(item => {
          if (!item.isLinked) {
            pending.push({
              ...item,
              orderRef: order.orderNumber,
              customerRef: order.customerName
            });
          }
        });
      });
      this.pendingOrderItems.set(pending);
      this.filterPendingItems();
      this.isProcessingLink.set(false);
    });
  }

  filterPendingItems() {
    const term = this.itemSearchTerm().toLowerCase();
    const all = this.pendingOrderItems();
    if (!term) {
      this.filteredPendingItems.set(all);
      return;
    }
    this.filteredPendingItems.set(all.filter(i => 
      i.description.toLowerCase().includes(term) || 
      i.code.toLowerCase().includes(term) ||
      i.orderRef.toLowerCase().includes(term)
    ));
  }

  updateSearch(term: string) {
    this.itemSearchTerm.set(term);
    this.filterPendingItems();
  }

  toggleOrderItemSelection(itemCode: string, event: any) {
    const checked = event.target.checked;
    const currentSet = new Set(this.selectedOrderItemsToLink());
    if (checked) {
      currentSet.add(itemCode);
    } else {
      currentSet.delete(itemCode);
    }
    this.selectedOrderItemsToLink.set(currentSet);
  }

  confirmBulkLink() {
    const mapping = this.selectedMappingForLink();
    const selectedCodes = Array.from(this.selectedOrderItemsToLink());
    if (!mapping || selectedCodes.length === 0) return;

    this.isProcessingLink.set(true); 
    this.closeLinkModal();
    this.notification.show(`Vinculando ${selectedCodes.length} ítems en segundo plano...`, 'info');
    
    let processedCount = 0;
    // Procesamiento paralelo
    selectedCodes.forEach(daltonCode => {
      const itemInfo = this.pendingOrderItems().find(p => p.code === daltonCode);
      const desc = itemInfo ? itemInfo.description : 'Vinculación Manual';

      this.api.linkOrderItem(daltonCode, mapping.bydCode, mapping.bydType, desc).subscribe(() => {
        processedCount++;
        if (processedCount === selectedCodes.length) {
           this.notification.show(`Vinculación masiva completada (${processedCount} items).`, 'success');
        }
      });
    });
    this.isProcessingLink.set(false);
  }
}
