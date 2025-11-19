
import { Component, signal, inject, ElementRef, ViewChild, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service';
import { GeminiService } from '../services/gemini.service';
import { ApiService } from '../services/api.service';
import { EndpointConfigService, BydModelSqlRow } from '../services/endpoint-config.service';
import { NotificationService } from '../services/notification.service';
import { MappingItem, ServiceOrderItem } from '../models/app.types';

declare const XLSX: any;

@Component({
  selector: 'app-mapping-linker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mapping-linker.component.html'
})
export class MappingLinkerComponent {
  private store = inject(StoreService);
  private api = inject(ApiService);
  private gemini = inject(GeminiService);
  public endpointConfig = inject(EndpointConfigService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  // Raw data from store
  mappings = this.store.mappings;
  stats = this.store.stats;

  // --- STRUCTURED VIEW STATE ---
  selectedSeries = signal<string | null>(null); // The active "Folder" (Vehicle Series)
  selectedCategory = signal<string | null>(null); // The active "Tag" (Main Category)
  searchTerm = signal<string>('');

  // Computed: Grouped Series List for Sidebar
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

  // Computed: Categories available within the selected Series
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

  // Computed: Final Filtered Table Data
  filteredMappings = computed(() => {
    let list = this.mappings();
    const series = this.selectedSeries();
    const cat = this.selectedCategory();
    const term = this.searchTerm().toLowerCase();

    // 1. Series Filter (Strict)
    if (series) {
      list = list.filter(m => (m.vehicleSeries || 'GENERICO') === series);
    }

    // 2. Category Filter
    if (cat) {
      list = list.filter(m => m.mainCategory === cat);
    }

    // 3. Search Term
    if (term) {
      list = list.filter(m => 
        m.description?.toLowerCase().includes(term) || 
        m.bydCode.toLowerCase().includes(term) ||
        m.daltonCode.toLowerCase().includes(term)
      );
    }

    return list;
  });

  // --- UPLOAD & INSERTION STATE ---
  previewMappings = signal<Omit<MappingItem, 'id' | 'status'>[]>([]);
  previewHeaders = signal<string[]>([]);
  previewData = signal<any[]>([]);
  showPreviewModal = signal(false);
  showInsertionModal = signal(false);
  insertionData = signal<BydModelSqlRow[]>([]);
  
  // UI State
  isUploading = signal(false);
  aiAnalysisResult = signal<string | null>(null);
  isAnalyzing = signal(false);

  // --- REVERSE LINKING MODAL STATE ---
  showLinkToOrderModal = signal(false);
  selectedMappingForLink = signal<MappingItem | null>(null);
  pendingOrderItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  filteredPendingItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  itemSearchTerm = signal('');
  selectedOrderItemsToLink = signal<Set<string>>(new Set());
  isProcessingLink = signal(false);

  // Form (Updated with Series Selection)
  linkForm: FormGroup = this.fb.group({
    vehicleSeries: ['', Validators.required], // CRITICAL: Force Series Selection
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor', Validators.required],
    daltonCode: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    mainCategory: ['']
  });

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    // Auto-select first series if none selected but data exists
    effect(() => {
      const groups = this.seriesGroups();
      if (groups.length > 0 && !this.selectedSeries()) {
        this.selectedSeries.set(groups[0].name);
      }
    });
  }

  selectSeries(name: string) {
    this.selectedSeries.set(name);
    this.selectedCategory.set(null); // Reset category when changing series
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
      
      // Ensure Vehicle Model matches Series for consistency unless user specifies otherwise (simplified)
      const newItem = {
        ...formVal,
        vehicleModel: formVal.vehicleSeries 
      };

      this.store.addMapping(newItem);
      
      // Reset but keep the series selected for rapid entry
      this.linkForm.reset({ 
        bydType: 'Labor', 
        vehicleSeries: formVal.vehicleSeries,
        mainCategory: formVal.mainCategory 
      });
      
      this.notification.show('Mapeo manual agregado correctamente.', 'success');
    }
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  processFile(file: File) {
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
           const firstRow = jsonData[0] as any;
           this.previewHeaders.set(Object.keys(firstRow));
           this.previewData.set(jsonData);
        }

        const newMappings: Omit<MappingItem, 'id' | 'status'>[] = [];
        
        jsonData.forEach((row: any) => {
          const bydCode = row['Repair item code']; 
          
          if (bydCode) {
            const desc = row['Repair item name'];
            const dalton = row['Claim labor hour code'] || bydCode;
            
            const catName = String(row['Main category name'] || '').toLowerCase();
            const isBattery = String(row['Battery pack repair or not']).toLowerCase() === 'yes';

            let type: 'Labor' | 'Repair' = 'Labor';
            if (isBattery || catName.includes('repair') || desc.toLowerCase().includes('repair')) {
              type = 'Repair';
            }

            // Clean Strings
            const clean = (s: any) => s ? String(s).trim() : '';

            const item: Omit<MappingItem, 'id' | 'status'> = {
              bydCode: clean(bydCode),
              bydType: type,
              daltonCode: clean(dalton),
              description: clean(desc),
              
              vehicleModel: clean(row['Vehicle code']),
              vehicleSeries: clean(row['Name of project Vehicle Series']),
              mainCategory: clean(row['Main category name']),
              subCategory: clean(row['Secondary classification name']),
              standardHours: row['Standard labor hours'] ? parseFloat(row['Standard labor hours']) : 0,
              dispatchHours: row['Dispatch labor hours'] ? parseFloat(row['Dispatch labor hours']) : 0,
              isBatteryRepair: isBattery,
              modelYear: '2025' 
            };

            newMappings.push(item);
          }
        });

        if (newMappings.length > 0) {
          this.previewMappings.set(newMappings);
          this.showPreviewModal.set(true); 
        } else {
          this.notification.show('No se encontraron columnas válidas (Repair item code).', 'warning');
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
    
    // Async Notification
    this.notification.show(`Iniciando carga masiva de ${count} registros en segundo plano...`, 'info', 4000);

    this.api.executeDynamicInsert(payload).subscribe({
      next: (success) => {
        if (success) {
           this.store.addBatchMappings(items);
           this.notification.show(`Carga completada: ${count} registros procesados.`, 'success', 6000);
        } else {
           this.notification.show("La carga finalizó con advertencias del servidor.", 'warning');
        }
      },
      error: (err) => {
        console.error(err);
        this.notification.show("Error de conexión durante la carga masiva.", 'error');
      }
    });
  }

  resetUploadState() {
    this.previewMappings.set([]);
    this.previewData.set([]);
    this.previewHeaders.set([]);
    this.insertionData.set([]);
    this.showInsertionModal.set(false);
    this.showPreviewModal.set(false); // Fixed: Properly close the Preview Modal
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  discardUpload() {
    this.resetUploadState();
  }

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

  // --- REVERSE LINKING LOGIC ---
  openLinkToOrdersModal(mapping: MappingItem) {
    this.selectedMappingForLink.set(mapping);
    this.showLinkToOrderModal.set(true);
    this.selectedOrderItemsToLink.set(new Set());
    this.itemSearchTerm.set('');
    this.loadPendingOrderItems();
  }

  closeLinkModal() {
    this.showLinkToOrderModal.set(false);
    this.selectedMappingForLink.set(null);
  }

  loadPendingOrderItems() {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setDate(start.getDate() - 60);
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
              customerRef: order.customerRef
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
