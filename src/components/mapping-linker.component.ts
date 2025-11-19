
import { Component, signal, inject, ElementRef, ViewChild, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service';
import { GeminiService } from '../services/gemini.service';
import { ApiService } from '../services/api.service';
import { EndpointConfigService, BydModelSqlRow } from '../services/endpoint-config.service';
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
  public endpointConfig = inject(EndpointConfigService); // Public for template usage if needed
  private fb = inject(FormBuilder);

  // Raw data from store
  mappings = this.store.mappings;
  stats = this.store.stats;

  // Upload Preview State (Step 1: Raw Excel)
  previewMappings = signal<Omit<MappingItem, 'id' | 'status'>[]>([]);
  previewHeaders = signal<string[]>([]);
  previewData = signal<any[]>([]);
  showPreviewModal = signal(false);

  // Insertion Preview State (Step 2: SQL Table)
  showInsertionModal = signal(false);
  insertionData = signal<BydModelSqlRow[]>([]); // Typed strictly to SQL Row

  // JSON Config & Animation State
  showJsonPreview = signal(false);
  jsonPayloadPreview = signal('');
  isSending = signal(false);

  // Filter State
  filterModel = signal<string>('');
  filterSeries = signal<string>('');
  filterYear = signal<string>('');

  // Computed: Derived filters options
  uniqueModels = computed(() => {
    const models = new Set<string>();
    this.mappings().forEach(m => {
      if (m.vehicleModel) models.add(m.vehicleModel);
    });
    return Array.from(models).sort();
  });

  uniqueSeries = computed(() => {
    const series = new Set<string>();
    this.mappings().forEach(m => {
      if (m.vehicleSeries) series.add(m.vehicleSeries);
    });
    return Array.from(series).sort();
  });

  // Computed: Filtered List
  filteredMappings = computed(() => {
    let list = this.mappings();
    const model = this.filterModel();
    const ser = this.filterSeries();
    const year = this.filterYear();

    if (model) {
      list = list.filter(m => m.vehicleModel === model);
    }
    if (ser) {
      list = list.filter(m => m.vehicleSeries === ser);
    }
    if (year) {
      list = list.filter(m => m.modelYear?.includes(year));
    }
    return list;
  });

  // UI State
  isUploading = signal(false);
  aiAnalysisResult = signal<string | null>(null);
  isAnalyzing = signal(false);

  // --- Reverse Linking Modal State ---
  showLinkToOrderModal = signal(false);
  selectedMappingForLink = signal<MappingItem | null>(null);
  pendingOrderItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  filteredPendingItems = signal<(ServiceOrderItem & { orderRef: string, customerRef: string })[]>([]);
  itemSearchTerm = signal('');
  selectedOrderItemsToLink = signal<Set<string>>(new Set());
  isProcessingLink = signal(false);

  // Form
  linkForm: FormGroup = this.fb.group({
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor', Validators.required],
    daltonCode: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  onSubmitManual() {
    if (this.linkForm.valid) {
      this.store.addMapping(this.linkForm.value);
      this.linkForm.reset({ bydType: 'Labor' });
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

        // Capture Raw Data for Preview
        if (jsonData.length > 0) {
           const firstRow = jsonData[0] as any;
           this.previewHeaders.set(Object.keys(firstRow));
           this.previewData.set(jsonData);
        }

        const newMappings: Omit<MappingItem, 'id' | 'status'>[] = [];
        
        jsonData.forEach((row: any) => {
          // Map exact columns from user request
          const bydCode = row['Repair item code']; 
          
          if (bydCode) {
            const desc = row['Repair item name'];
            // Dalton code is 'Claim labor hour code' or fallbacks
            const dalton = row['Claim labor hour code'] || bydCode;
            
            // Determine type
            const catName = String(row['Main category name'] || '').toLowerCase();
            const isBattery = String(row['Battery pack repair or not']).toLowerCase() === 'yes';

            let type: 'Labor' | 'Repair' = 'Labor';
            if (isBattery || catName.includes('repair') || desc.toLowerCase().includes('repair')) {
              type = 'Repair';
            }

            const item: Omit<MappingItem, 'id' | 'status'> = {
              bydCode: String(bydCode).trim(),
              bydType: type,
              daltonCode: String(dalton).trim(),
              description: desc ? String(desc).trim() : '',
              
              // Extended fields
              vehicleModel: row['Vehicle code'],
              vehicleSeries: row['Name of project Vehicle Series'],
              mainCategory: row['Main category name'],
              subCategory: row['Secondary classification name'],
              standardHours: row['Standard labor hours'] ? parseFloat(row['Standard labor hours']) : 0,
              dispatchHours: row['Dispatch labor hours'] ? parseFloat(row['Dispatch labor hours']) : 0,
              isBatteryRepair: isBattery,
              modelYear: '2024' // Defaulting as it wasn't in sample headers but requested in filters
            };

            newMappings.push(item);
          }
        });

        if (newMappings.length > 0) {
          this.previewMappings.set(newMappings);
          this.showPreviewModal.set(true); // Open modal on success
        } else {
          alert('No se encontraron columnas válidas (Repair item code, etc).');
        }
        
        this.isUploading.set(false);
        
      } catch (error) {
        console.error("Error parsing Excel:", error);
        this.isUploading.set(false);
        alert('Error al leer el archivo.');
      }
    };

    reader.readAsBinaryString(file);
  }

  // --- STEP 2: Proceed to DB Insertion Preview ---
  proceedToInsertion() {
    const items = this.previewMappings();
    
    // DELEGATE to EndpointConfigService:
    // The service knows the SQL structure ([IdModeloVehiculo], etc)
    const sqlRows = this.endpointConfig.transformToSqlStructure(items);

    this.insertionData.set(sqlRows);
    this.showPreviewModal.set(false); // Close raw preview
    this.showInsertionModal.set(true); // Open DB preview
  }

  cancelInsertion() {
    this.showInsertionModal.set(false);
    this.showPreviewModal.set(true); // Go back to Step 1
  }

  // --- JSON PREVIEW LOGIC ---
  generateJsonPreview() {
    const sqlRows = this.insertionData();
    // DELEGATE to EndpointConfigService:
    // The service knows how to wrap the data for the endpoint
    const payload = this.endpointConfig.buildInsertPayload(sqlRows);
    
    this.jsonPayloadPreview.set(JSON.stringify(payload, null, 2));
    this.showJsonPreview.set(true);
  }

  closeJsonPreview() {
    this.showJsonPreview.set(false);
  }

  // --- STEP 3: Final Commit ---
  confirmFinalInsertion() {
    const sqlRows = this.insertionData();
    if (sqlRows.length === 0) return;

    // Build Payload via Config Module
    const payload = this.endpointConfig.buildInsertPayload(sqlRows);

    // Start Animation
    this.isSending.set(true);
    this.showInsertionModal.set(false); 

    // Execute API
    this.api.executeDynamicInsert(payload).subscribe({
      next: (success) => {
        this.isSending.set(false);

        if (success) {
           const items = this.previewMappings();
           this.store.addBatchMappings(items);
           const count = items.length;
           this.resetUploadState();
           alert(`Transacción Exitosa: Se procesaron ${count} registros en [dbo].[BYDModelosDMS].`);
        } else {
           this.showInsertionModal.set(true);
           alert("Hubo un error al enviar los datos.");
        }
      },
      error: () => {
        this.isSending.set(false);
        this.showInsertionModal.set(true);
        alert("Error de comunicación con el servidor.");
      }
    });
  }

  resetUploadState() {
    this.previewMappings.set([]);
    this.previewData.set([]);
    this.previewHeaders.set([]);
    this.insertionData.set([]);
    this.showInsertionModal.set(false);
    this.showJsonPreview.set(false);
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
    
    let processedCount = 0;
    
    selectedCodes.forEach(daltonCode => {
      const itemInfo = this.pendingOrderItems().find(p => p.code === daltonCode);
      const desc = itemInfo ? itemInfo.description : 'Vinculación Manual Masiva';

      this.api.linkOrderItem(daltonCode, mapping.bydCode, mapping.bydType, desc).subscribe(() => {
        processedCount++;
        if (processedCount === selectedCodes.length) {
          this.isProcessingLink.set(false);
          this.closeLinkModal();
          alert(`Se vincularon ${processedCount} ítems a la operación ${mapping.bydCode}`);
        }
      });
    });
  }
}
