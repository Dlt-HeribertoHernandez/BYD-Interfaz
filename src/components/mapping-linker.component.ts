
import { Component, signal, inject, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service';
import { GeminiService } from '../services/gemini.service';
import { ApiService } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { MappingItem } from '../models/app.types';

@Component({
  selector: 'app-mapping-linker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mapping-linker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MappingLinkerComponent {
  public store = inject(StoreService);
  private gemini = inject(GeminiService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  // --- DATA SIGNALS ---
  mappings = this.store.mappings;
  
  // --- UI STATE SIGNALS ---
  // Selection & Editing
  selectedItemId = signal<string | null>(null);
  isEditing = signal(false);
  
  // Filters
  searchQuery = signal('');
  filterSeries = signal<string | null>(null);
  filterCategory = signal<string | null>(null);
  
  // AI State
  isAnalyzing = signal(false);
  enrichmentStats = signal<{processed: number, improved: number} | null>(null);

  // --- FORM GROUP ---
  // Handles both Creation and Editing
  itemForm: FormGroup = this.fb.group({
    id: [null], // Hidden ID for updates
    vehicleSeries: ['', Validators.required],
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor', Validators.required],
    daltonCode: ['MO006', [Validators.required]], 
    description: ['', Validators.required],
    mainCategory: ['General'],
    standardHours: [0, [Validators.min(0)]]
  });

  // --- COMPUTED SIGNALS ---

  // 1. KPIs for the Header
  kpiStats = computed(() => {
    const list = this.mappings();
    const total = list.length;
    const laborCount = list.filter(i => i.bydType === 'Labor').length;
    const repairCount = list.filter(i => i.bydType === 'Repair').length;
    // Calculate "Health" (items with valid categories and descriptions)
    const healthyCount = list.filter(i => i.mainCategory && i.mainCategory !== 'General' && i.description?.length > 5).length;
    const healthScore = total > 0 ? Math.round((healthyCount / total) * 100) : 0;

    return { total, laborCount, repairCount, healthScore };
  });

  // 2. Facets (Unique Lists for Dropdowns)
  facets = computed(() => {
    const list = this.mappings();
    const seriesSet = new Set<string>();
    const catSet = new Set<string>();

    list.forEach(item => {
      if (item.vehicleSeries) seriesSet.add(item.vehicleSeries);
      if (item.mainCategory) catSet.add(item.mainCategory);
    });

    return {
      series: Array.from(seriesSet).sort(),
      categories: Array.from(catSet).sort()
    };
  });

  // 3. Filtered Data Grid
  filteredGridData = computed(() => {
    let data = this.mappings();
    const q = this.searchQuery().toLowerCase();
    const fSeries = this.filterSeries();
    const fCat = this.filterCategory();

    // Apply Text Search
    if (q) {
      data = data.filter(item => 
        item.bydCode.toLowerCase().includes(q) || 
        item.daltonCode.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }

    // Apply Facets
    if (fSeries) data = data.filter(i => i.vehicleSeries === fSeries);
    if (fCat) data = data.filter(i => i.mainCategory === fCat);

    return data;
  });

  // 4. Currently Selected Item Object
  activeItem = computed(() => {
    const id = this.selectedItemId();
    return this.mappings().find(m => m.id === id) || null;
  });

  constructor() {
    // Determine icon based on category (Visual Helper)
    effect(() => {
      // Reactive side effects if needed
    });
  }

  // --- ACTIONS ---

  selectItem(item: MappingItem) {
    if (this.selectedItemId() === item.id) {
      // Deselect if clicking same
      this.resetSelection();
    } else {
      this.selectedItemId.set(item.id);
      this.isEditing.set(true); // Auto-switch to edit mode visual
      
      // Populate Form
      this.itemForm.patchValue({
        id: item.id,
        vehicleSeries: item.vehicleSeries,
        bydCode: item.bydCode,
        bydType: item.bydType,
        daltonCode: item.daltonCode,
        description: item.description,
        mainCategory: item.mainCategory || 'General',
        standardHours: item.standardHours
      });
    }
  }

  createNew() {
    this.resetSelection();
    this.isEditing.set(true); // Show form in "Create" mode
    this.itemForm.reset({
      bydType: 'Labor',
      daltonCode: 'MO006',
      mainCategory: 'General',
      standardHours: 0
    });
  }

  saveItem() {
    if (this.itemForm.invalid) return;

    const formVal = this.itemForm.value;
    
    // Decide: Create or Update?
    if (formVal.id) {
      // Update Logic (In a real app, update via Service ID)
      this.store.removeMapping(formVal.id); // Remove old
      this.store.addMapping({ ...formVal }); // Re-add (Simulating update)
      this.notification.show('Registro actualizado correctamente.', 'success');
    } else {
      // Create Logic
      this.store.addMapping({
        ...formVal,
        vehicleModel: formVal.vehicleSeries // Mirror series to model for simplicity
      });
      this.notification.show('Nuevo código agregado al catálogo.', 'success');
    }
    
    this.resetSelection();
  }

  deleteCurrentItem() {
    const id = this.selectedItemId();
    if (!id) return;

    if (confirm('¿Estás seguro de eliminar este registro del catálogo maestro?')) {
      this.store.removeMapping(id);
      this.notification.show('Registro eliminado.', 'info');
      this.resetSelection();
    }
  }

  resetSelection() {
    this.selectedItemId.set(null);
    this.isEditing.set(false);
    this.itemForm.reset();
  }

  // --- IMPORT / EXPORT ---

  triggerFileInput() {
    document.getElementById('hiddenFileInput')?.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = (e: any) => {
        try {
            const data = JSON.parse(e.target.result);
            if(Array.isArray(data)) {
               const items = data.map((d: any) => ({
                   bydCode: d.bydCode || d.Codigo || '',
                   description: d.description || d.Descripcion || '',
                   vehicleSeries: d.vehicleSeries || d.Modelo || 'GENERICO',
                   mainCategory: d.mainCategory || d.Categoria || 'General',
                   standardHours: d.standardHours || d.Horas || 0,
                   daltonCode: d.daltonCode || 'MO006',
                   bydType: d.bydType || 'Labor'
               }));
               this.store.addBatchMappings(items);
               this.notification.show(`${items.length} registros importados.`, 'success');
            }
        } catch(err) {
            this.notification.show('Error: Archivo JSON inválido.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  }

  // --- AI ENRICHMENT ---

  async runAiNormalization() {
    const items = this.mappings().slice(0, 20); // Limit for demo
    if (items.length === 0) return;

    this.isAnalyzing.set(true);
    try {
      const enriched = await this.gemini.enrichCatalogBatch(items);
      
      // Apply updates locally
      let improvedCount = 0;
      enriched.forEach(e => {
         const original = items.find(i => i.id === e.id);
         if (original) {
           original.description = e.cleanDescription;
           original.mainCategory = e.category;
           improvedCount++;
         }
      });

      this.enrichmentStats.set({ processed: items.length, improved: improvedCount });
      this.notification.show('Catálogo normalizado con Inteligencia Artificial.', 'success');
    } catch (e) {
      this.notification.show('Error conectando con IA.', 'error');
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  getCategoryIcon(cat: string): string {
    const map: Record<string, string> = {
      'Motor': 'fa-cogs',
      'Frenos': 'fa-circle-stop',
      'Suspensión': 'fa-align-justify',
      'Eléctrico': 'fa-bolt',
      'Carrocería': 'fa-car-side',
      'Mantenimiento': 'fa-oil-can',
      'General': 'fa-cube'
    };
    return map[cat] || 'fa-tag';
  }
  
  getCategoryColor(cat: string): string {
    const map: Record<string, string> = {
      'Motor': 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200',
      'Frenos': 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-200',
      'Eléctrico': 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200',
      'Mantenimiento': 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200',
      'General': 'text-gray-600 bg-gray-50 dark:bg-gray-700 border-gray-200'
    };
    return map[cat] || 'text-gray-600 bg-gray-50 dark:bg-gray-700 border-gray-200';
  }
}
