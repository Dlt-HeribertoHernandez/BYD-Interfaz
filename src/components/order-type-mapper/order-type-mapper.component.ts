
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../services/notification.service';
import { DaltonDocType, PlantDocType, OrderTypeMapping } from '../../models/app.types';

/**
 * OrderTypeMapperComponent
 * ------------------------
 * Interfaz gráfica para vincular los "Tipos de Orden Dalton" (DMS) 
 * con los "Tipos de Orden Planta" (BYD).
 * Ahora incluye gestión (CRUD) de los catálogos mismos.
 */
@Component({
  selector: 'app-order-type-mapper',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-type-mapper.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTypeMapperComponent {
  private api = inject(ApiService);
  private notification = inject(NotificationService);

  // Data Signals
  daltonTypes = signal<DaltonDocType[]>([]);
  plantTypes = signal<PlantDocType[]>([]);
  currentMappings = signal<OrderTypeMapping[]>([]);
  
  isLoading = signal(false);
  isSaving = signal(false);

  // UI State
  activeTab = signal<'mapping' | 'dalton' | 'plant'>('mapping');

  // Form Signals
  newDaltonCode = signal('');
  newDaltonDesc = signal('');
  
  newPlantCode = signal('');
  newPlantDesc = signal('');

  // Computed: Combined view model for the UI
  // Crea una lista combinada que muestra el tipo Dalton y su asignación actual (si existe)
  viewModel = computed(() => {
    const dTypes = this.daltonTypes();
    const mappings = this.currentMappings();
    
    return dTypes.map(dt => {
      const found = mappings.find(m => m.daltonCode === dt.code);
      return {
         dalton: dt,
         assignedPlantCode: found ? found.plantCode : ''
      };
    });
  });

  constructor() {
    // Recargar datos cuando cambia la agencia seleccionada
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      // También dependemos de si es mock data
      this.api.useMockData(); 
      
      if (dealer) {
        this.loadData(dealer);
      } else {
        this.daltonTypes.set([]);
        this.currentMappings.set([]);
      }
    });
  }

  loadData(dealerCode: string) {
    this.isLoading.set(true);
    
    // Cargar los 3 recursos necesarios en paralelo (forkJoin sería ideal, pero usaremos suscripciones anidadas simples por ahora)
    this.api.getDaltonDocTypes(dealerCode).subscribe(dtypes => {
       this.daltonTypes.set(dtypes);
       
       this.api.getPlantDocTypes().subscribe(ptypes => {
          this.plantTypes.set(ptypes);
          
          this.api.getOrderTypeMappings(dealerCode).subscribe(mappings => {
             this.currentMappings.set(mappings);
             this.isLoading.set(false);
          });
       });
    });
  }

  /**
   * Actualiza el modelo local cuando el usuario cambia un dropdown.
   */
  updateMapping(daltonCode: string, plantCode: string) {
    const dealer = this.api.selectedDealerCode();
    if (!dealer) return;

    const currentList = [...this.currentMappings()];
    const index = currentList.findIndex(m => m.daltonCode === daltonCode);

    if (plantCode) {
       const newMapping: OrderTypeMapping = { daltonCode, plantCode, dealerCode: dealer };
       if (index >= 0) {
          currentList[index] = newMapping;
       } else {
          currentList.push(newMapping);
       }
    } else {
       // Si seleccionó vacío, eliminamos el mapeo
       if (index >= 0) currentList.splice(index, 1);
    }
    
    this.currentMappings.set(currentList);
  }

  /**
   * Envía la configuración completa al servidor.
   */
  saveChanges() {
    const dealer = this.api.selectedDealerCode();
    if (!dealer) return;

    this.isSaving.set(true);
    this.api.saveOrderTypeMappings(dealer, this.currentMappings()).subscribe({
       next: (success) => {
          if (success) {
             this.notification.show('Configuración de tipos guardada correctamente.', 'success');
          } else {
             this.notification.show('Error al guardar configuración.', 'error');
          }
          this.isSaving.set(false);
       },
       error: () => {
          this.notification.show('Error de conexión.', 'error');
          this.isSaving.set(false);
       }
    });
  }

  // --- CATALOG MANAGEMENT METHODS ---

  createDaltonType() {
    const code = this.newDaltonCode().toUpperCase().trim();
    const desc = this.newDaltonDesc().trim();
    const dealer = this.api.selectedDealerCode();

    if (!code || !desc || !dealer) {
       this.notification.show('Complete el código y descripción.', 'warning');
       return;
    }

    if (this.daltonTypes().some(t => t.code === code)) {
       this.notification.show('El código Dalton ya existe.', 'warning');
       return;
    }

    this.isSaving.set(true);
    const newItem: DaltonDocType = { code, description: desc, dealerCode: dealer };
    
    this.api.createDaltonDocType(newItem).subscribe(success => {
       if (success) {
          this.notification.show('Nuevo Folio Dalton creado.', 'success');
          this.newDaltonCode.set('');
          this.newDaltonDesc.set('');
          this.loadData(dealer); // Refresh
       } else {
          this.notification.show('Error al crear tipo Dalton.', 'error');
       }
       this.isSaving.set(false);
    });
  }

  createPlantType() {
    const code = this.newPlantCode().toUpperCase().trim();
    const desc = this.newPlantDesc().trim();

    if (!code || !desc) {
       this.notification.show('Complete el código y descripción.', 'warning');
       return;
    }

    if (this.plantTypes().some(t => t.code === code)) {
       this.notification.show('El código Planta ya existe.', 'warning');
       return;
    }

    this.isSaving.set(true);
    const newItem: PlantDocType = { code, description: desc };
    
    this.api.createPlantDocType(newItem).subscribe(success => {
       if (success) {
          this.notification.show('Nuevo Tipo Planta creado.', 'success');
          this.newPlantCode.set('');
          this.newPlantDesc.set('');
          // Refresh lists
          const dealer = this.api.selectedDealerCode();
          if (dealer) this.loadData(dealer); 
       } else {
          this.notification.show('Error al crear tipo Planta.', 'error');
       }
       this.isSaving.set(false);
    });
  }
  
  // Helper para obtener color de badge según código planta
  getPlantBadgeColor(code: string): string {
     const map: Record<string, string> = {
        'OR': 'bg-blue-100 text-blue-700 border-blue-200',
        'WAR': 'bg-green-100 text-green-700 border-green-200',
        'PDI': 'bg-purple-100 text-purple-700 border-purple-200',
        'INT': 'bg-gray-100 text-gray-700 border-gray-200'
     };
     return map[code] || 'bg-gray-50 text-gray-600 border-gray-200';
  }
}
