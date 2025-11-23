
import { Component, signal, inject, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service.ts';
import { GeminiService } from '../services/gemini.service';
import { NotificationService } from '../services/notification.service';
import { MappingItem } from '../models/app.types';

/**
 * MappingLinkerComponent
 * ----------------------
 * Componente principal para la gestión del "Diccionario Maestro" (Mapping).
 * Sigue el patrón Master-Detail con un panel de inspección lateral.
 */
@Component({
  selector: 'app-mapping-linker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mapping-linker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MappingLinkerComponent {
  // Inyección de Dependencias (Angular 16+ style)
  public store = inject(StoreService);
  public gemini = inject(GeminiService);
  private notification = inject(NotificationService);
  private fb: FormBuilder = inject(FormBuilder);

  // --- SIGNALS DE ESTADO ---
  // Data proviene del Store (Read-only)
  mappings = this.store.mappings;
  
  // Wrapper computado para el estado de la IA (corrige error en template)
  isAiReady = computed(() => this.gemini.isAvailable());

  // Estado UI local (Mutable)
  selectedItemId = signal<string | null>(null);
  selectedIds = signal<Set<string>>(new Set()); // Para selección múltiple (Bulk)
  
  isEditing = signal(false);
  activeInspectorTab = signal<'detail' | 'history'>('detail');
  
  // Filtros
  searchQuery = signal('');
  filterSeries = signal<string | null>(null);
  filterCategory = signal<string | null>(null);
  
  // Estado AI
  isAnalyzing = signal(false);
  enrichmentStats = signal<{processed: number, improved: number} | null>(null);

  // Contexto de Datos (Mock para historial de uso)
  usageHistory = signal<{date: string, ro: string, vin: string}[]>([]);

  // --- FORMULARIO REACTIVO ---
  itemForm: FormGroup = this.fb.group({
    id: [null],
    vehicleSeries: ['', Validators.required],
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor', Validators.required],
    daltonCode: ['MO006', [Validators.required]], 
    description: ['', Validators.required],
    mainCategory: ['General'],
    standardHours: [0, [Validators.min(0)]]
  });

  // --- COMPUTED SIGNALS (Estado Derivado) ---

  // 1. KPIs del Dashboard Superior
  kpiStats = computed(() => {
    const list = this.mappings();
    const total = list.length;
    const laborCount = list.filter(i => i.bydType === 'Labor').length;
    const repairCount = list.filter(i => i.bydType === 'Repair').length;
    
    // Score de Salud: Ítems con data completa
    const healthyCount = list.filter(i => i.mainCategory && i.mainCategory !== 'General' && i.description?.length > 5).length;
    const healthScore = total > 0 ? Math.round((healthyCount / total) * 100) : 0;

    return { total, laborCount, repairCount, healthScore };
  });

  // 2. Facetas para Filtros (Listas únicas)
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

  // 3. Grid de Datos Filtrado
  filteredGridData = computed(() => {
    let data = this.mappings();
    const q = this.searchQuery().toLowerCase();
    const fSeries = this.filterSeries();
    const fCat = this.filterCategory();

    // Filtro de Texto
    if (q) {
      data = data.filter(item => 
        item.bydCode.toLowerCase().includes(q) || 
        item.daltonCode.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }

    // Filtros de Faceta
    if (fSeries) data = data.filter(i => i.vehicleSeries === fSeries);
    if (fCat) data = data.filter(i => i.mainCategory === fCat);

    return data;
  });

  // 3.1 Estado de "Seleccionar Todos"
  isAllSelected = computed(() => {
    const visible = this.filteredGridData();
    if (visible.length === 0) return false;
    return visible.every(item => this.selectedIds().has(item.id));
  });

  // 4. Detección de Calidad de Datos (Auditoría)
  dataQualityIssues = computed(() => {
    const item = this.mappings().find(m => m.id === this.selectedItemId());
    if (!item) return [];
    
    const issues = [];
    if (!item.standardHours || item.standardHours === 0) issues.push('Faltan Horas Estándar');
    if (item.mainCategory === 'General' || !item.mainCategory) issues.push('Categoría Genérica');
    if (item.description.length < 10) issues.push('Descripción muy corta');
    
    return issues;
  });

  constructor() {
    // Efecto secundario para cargar historial simulado al seleccionar un ítem
    effect(() => {
       const id = this.selectedItemId();
       if (id) {
         // Mock fetching history
         this.usageHistory.set([
            { date: '2024-11-01', ro: 'XCL00410', vin: '...S510596' },
            { date: '2024-10-15', ro: 'XCL00388', vin: '...S001793' }
         ]);
       } else {
         this.usageHistory.set([]);
       }
    });
  }

  // --- ACCIONES DE SELECCIÓN ---

  selectItem(item: MappingItem) {
    // Si hago clic en la fila, solo la selecciono para edición (Inspector)
    // No afecta la selección múltiple (checkboxes)
    if (this.selectedItemId() === item.id) {
      this.resetSelection();
    } else {
      this.selectedItemId.set(item.id);
      this.isEditing.set(true);
      this.activeInspectorTab.set('detail');
      
      // Carga de datos al formulario
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

  // --- SELECCIÓN MÚLTIPLE (BULK) ---

  toggleSelection(id: string, event: Event) {
    event.stopPropagation(); // Evitar que se abra el inspector
    const current = new Set(this.selectedIds());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.selectedIds.set(current);
  }

  toggleSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const visible = this.filteredGridData();
    
    if (checked) {
      const newSet = new Set(this.selectedIds());
      visible.forEach(i => newSet.add(i.id));
      this.selectedIds.set(newSet);
    } else {
      const newSet = new Set(this.selectedIds());
      visible.forEach(i => newSet.delete(i.id));
      this.selectedIds.set(newSet);
    }
  }

  clearBulkSelection() {
    this.selectedIds.set(new Set());
  }

  // --- ACCIONES MASIVAS ---

  bulkDelete() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    if (confirm(`¿Estás seguro de eliminar ${ids.length} registros seleccionados? Esta acción es irreversible.`)) {
      this.store.removeBatchMappings(ids);
      
      // Si el ítem abierto en el inspector fue eliminado, limpiarlo
      if (this.selectedItemId() && ids.includes(this.selectedItemId()!)) {
        this.resetSelection();
      }

      this.selectedIds.set(new Set());
      this.notification.show(`${ids.length} registros eliminados correctamente.`, 'info');
    }
  }

  bulkUpdateCategory(category: string) {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0 || !category) return;

    this.store.updateBatchCategory(ids, category);
    this.selectedIds.set(new Set());
    this.notification.show(`Categoría actualizada a "${category}" para ${ids.length} registros.`, 'success');
  }

  // --- GESTIÓN INDIVIDUAL ---

  createNew() {
    this.resetSelection();
    this.isEditing.set(true);
    this.itemForm.reset({
      bydType: 'Labor',
      daltonCode: 'MO006',
      mainCategory: 'General',
      standardHours: 0
    });
  }

  resetSelection() {
    this.selectedItemId.set(null);
    this.isEditing.set(false);
    this.itemForm.reset();
  }

  // --- PERSISTENCIA ---

  saveItem() {
    if (this.itemForm.invalid) return;
    const formVal = this.itemForm.value;
    
    if (formVal.id) {
      // Update (Simulado eliminando y agregando)
      this.store.removeMapping(formVal.id);
      this.store.addMapping({ ...formVal });
      this.notification.show('Registro actualizado correctamente.', 'success');
    } else {
      // Create
      this.store.addMapping({ ...formVal });
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

  // --- IMPORTACIÓN / EXPORTACIÓN ---

  triggerFileInput() {
    document.getElementById('hiddenFileInput')?.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    
    // Delegar la lógica sucia de parsing al Store Service
    this.store.processFileImport(file)
      .then(count => {
        this.notification.show(`${count} registros importados exitosamente.`, 'success');
      })
      .catch(err => {
        this.notification.show(err, 'error');
      })
      .finally(() => {
        input.value = ''; // Reset input
      });
  }

  // --- FUNCIONES AI ---

  async runAiNormalization() {
    const items = this.mappings().slice(0, 20); // Límite demo
    if (items.length === 0) return;

    this.isAnalyzing.set(true);
    try {
      const enriched = await this.gemini.enrichCatalogBatch(items);
      
      if (enriched.length === 0) {
         // Si retorna vacío, el servicio ya mostró la notificación de error
         this.isAnalyzing.set(false);
         return;
      }

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

  // --- HELPERS VISUALES ---

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
