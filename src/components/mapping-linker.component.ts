import { Component, signal, inject, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { StoreService } from '../services/store.service';
import { GeminiService } from '../services/gemini.service';
import { ApiService } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { MappingItem, ServiceOrderItem } from '../models/app.types';

/**
 * Componente: Catálogo Maestro de Labour Codes (BYD).
 * REFACTORIZADO: Se eliminó la carga de Excel. Ahora actúa como visor y gestor
 * de la tabla maestra que ya reside en base de datos.
 */
@Component({
  selector: 'app-mapping-linker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mapping-linker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MappingLinkerComponent {
  public store = inject(StoreService);
  private api = inject(ApiService);
  private gemini = inject(GeminiService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  // --- ESTADO REACTIVO (Signals) ---
  mappings = this.store.mappings;
  stats = this.store.stats;

  // Filtros de vista
  selectedSeries = signal<string | null>(null);
  selectedCategory = signal<string | null>(null);
  searchTerm = signal<string>('');
  
  // Estado IA
  isAnalyzing = signal(false);
  enrichedItemsIds = signal<Set<string>>(new Set());
  enrichmentSummary = signal<{count: number, categories: number} | null>(null);

  // --- COMPUTED: Lógica de Agrupación y Filtrado ---

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

  filteredMappings = computed(() => {
    let list = this.mappings();
    const series = this.selectedSeries();
    const cat = this.selectedCategory();
    const term = this.searchTerm().toLowerCase();

    if (series) {
      list = list.filter(m => (m.vehicleSeries || 'GENERICO') === series);
    }

    if (cat) {
      list = list.filter(m => m.mainCategory === cat);
    }

    if (term) {
      list = list.filter(m => 
        m.description?.toLowerCase().includes(term) || 
        m.bydCode.toLowerCase().includes(term)
      );
    }

    return list;
  });

  // Formulario de registro manual (Para correcciones rápidas)
  linkForm: FormGroup = this.fb.group({
    vehicleSeries: ['', Validators.required],
    bydCode: ['', [Validators.required, Validators.minLength(3)]],
    bydType: ['Labor'],
    daltonCode: ['MO006', [Validators.required]], // Default al genérico
    description: [''],
    standardHours: [0],
    mainCategory: ['']
  });

  constructor() {
    effect(() => {
      const groups = this.seriesGroups();
      if (groups.length > 0 && !this.selectedSeries()) {
        this.selectedSeries.set(groups[0].name);
      }
    });
  }

  selectSeries(name: string) {
    this.selectedSeries.set(name);
    this.selectedCategory.set(null);
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
        vehicleModel: formVal.vehicleSeries 
      };

      this.store.addMapping(newItem);
      
      this.linkForm.reset({ 
        bydType: 'Labor', 
        daltonCode: 'MO006',
        vehicleSeries: formVal.vehicleSeries,
        mainCategory: formVal.mainCategory,
        standardHours: 0
      });
      
      this.notification.show('Código agregado al catálogo maestro.', 'success');
    }
  }

  deleteItem(id: string) {
    if(confirm('¿Eliminar este código del catálogo maestro?')) {
        this.store.removeMapping(id);
        this.notification.show('Registro eliminado.', 'info', 2000);
    }
  }

  // --- IMPORTACIÓN MASIVA (JSON) ---
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = (e: any) => {
        try {
            // Intento de parseo JSON
            const data = JSON.parse(e.target.result);
            if(Array.isArray(data)) {
               // Normalizar campos mínimos
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
               this.notification.show(`Importación exitosa: ${items.length} registros procesados.`, 'success');
            } else {
               this.notification.show('El formato del archivo no es una lista válida (Array JSON).', 'warning');
            }
        } catch(err) {
            console.error(err);
            this.notification.show('Error al leer el archivo. Verifique que sea un JSON válido.', 'error');
        }
    };
    
    reader.onerror = () => {
       this.notification.show('Error de lectura de archivo.', 'error');
    };

    reader.readAsText(file);
    
    // Reset input
    event.target.value = '';
  }

  // --- IA Features ---

  async enrichCatalog() {
    const itemsToProcess = this.filteredMappings().slice(0, 20);
    
    if (itemsToProcess.length === 0) {
      this.notification.show('No hay items visibles para procesar.', 'warning');
      return;
    }

    this.isAnalyzing.set(true);
    this.enrichmentSummary.set(null);

    try {
      const enrichedData = await this.gemini.enrichCatalogBatch(itemsToProcess);
      
      if (enrichedData.length === 0) {
        this.notification.show('La IA no pudo procesar los datos.', 'error');
        return;
      }

      const updatedIds = new Set<string>();
      let categoriesAssigned = 0;

      enrichedData.forEach(newItem => {
         updatedIds.add(newItem.id);
         if (newItem.category) categoriesAssigned++;
         
         const original = itemsToProcess.find(i => i.id === newItem.id);
         if(original) {
             original.description = newItem.cleanDescription;
             original.mainCategory = newItem.category;
         }
      });
      
      this.enrichedItemsIds.set(updatedIds);
      this.enrichmentSummary.set({ count: enrichedData.length, categories: categoriesAssigned });
      this.notification.show(`Catálogo actualizado: ${enrichedData.length} descripciones mejoradas.`, 'success');

    } catch (e) {
       console.error(e);
       this.notification.show('Error en servicio de IA.', 'error');
    } finally {
      this.isAnalyzing.set(false);
    }
  }
}