
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ApiService } from './api.service';
import { MappingItem } from '../models/app.types';

/**
 * StoreService actúa como la "Fuente de la Verdad" para el estado global de Mappings.
 * Utiliza el patrón de gestión de estado basado en Signals.
 */
@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private api = inject(ApiService);

  // --- ESTADO (State) ---
  // Señal privada editable solo dentro del servicio
  private mappingsSignal = signal<MappingItem[]>([]);
  
  // Señal pública de solo lectura para los componentes
  readonly mappings = this.mappingsSignal.asReadonly();
  
  // --- ESTADO DERIVADO (Computed) ---
  // Estadísticas calculadas automáticamente cuando 'mappings' cambia.
  // Esto optimiza el rendimiento evitando recalculaciones innecesarias.
  readonly stats = computed(() => {
    const list = this.mappingsSignal();
    return {
      total: list.length,
      linked: list.filter(i => i.status === 'Linked').length,
      labor: list.filter(i => i.bydType === 'Labor').length,
      repair: list.filter(i => i.bydType === 'Repair').length,
    };
  });

  constructor() {
    // Efecto secundario: Recargar mappings si cambia el modo (Mock vs Live)
    effect(() => {
       this.api.useMockData(); // Dependencia reactiva
       this.loadMappings();
    });
  }

  /**
   * Carga la lista inicial de mappings desde la API.
   */
  loadMappings() {
    this.api.getMappings().subscribe(data => {
      this.mappingsSignal.set(data);
    });
  }

  /**
   * Agrega un nuevo mapping al estado local y lo persiste vía API.
   * Utiliza actualización optimista (actualiza la UI antes de confirmar, 
   * aunque aquí simplificado a esperar respuesta).
   */
  addMapping(item: Omit<MappingItem, 'id' | 'status'>) {
    const newItem: MappingItem = {
      ...item,
      id: crypto.randomUUID(),
      status: 'Linked'
    };
    
    this.api.createMapping(newItem).subscribe(() => {
      // Actualización inmutable del array
      this.mappingsSignal.update(current => [newItem, ...current]);
    });
  }

  /**
   * Procesa múltiples mappings (Carga Masiva).
   */
  addBatchMappings(items: Omit<MappingItem, 'id' | 'status'>[]) {
    // En un escenario real, esto debería ser un endpoint 'batch' en la API
    // para evitar múltiples llamadas HTTP.
    items.forEach(item => this.addMapping(item));
  }

  /**
   * Elimina un mapping por ID.
   */
  removeMapping(id: string) {
    this.api.deleteMapping(id).subscribe(() => {
      this.mappingsSignal.update(current => current.filter(i => i.id !== id));
    });
  }
}
