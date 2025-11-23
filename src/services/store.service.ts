
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ApiService } from './api.service';
import { MappingItem } from '../models/app.types';

/**
 * StoreService (State Management)
 * -------------------------------
 * Actúa como la "Fuente de la Verdad" (Single Source of Truth) para el dominio de Mappings.
 * Implementa un patrón similar a Redux/NgRx pero simplificado usando Angular Signals.
 * 
 * Responsabilidades:
 * 1. Mantener el estado de la lista de mappings.
 * 2. Proveer estado derivado (estadísticas) vía computed signals.
 * 3. Orquestar operaciones de E/S (lectura de archivos, llamadas a API).
 */
@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private api = inject(ApiService);

  // --- ESTADO (State) ---
  // Señal privada editable solo dentro del servicio (Encapsulamiento)
  private mappingsSignal = signal<MappingItem[]>([]);
  
  // Señal pública de solo lectura para consumo en componentes
  readonly mappings = this.mappingsSignal.asReadonly();
  
  // --- ESTADO DERIVADO (Computed) ---
  // Estadísticas calculadas automáticamente. Se recalculan solo si 'mappingsSignal' cambia.
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
    // Efecto: Sincronización reactiva con el modo de datos (Mock/Live)
    effect(() => {
       this.api.useMockData(); // Dependencia
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
   * Agrega un nuevo mapping al estado y lo persiste.
   */
  addMapping(item: Omit<MappingItem, 'id' | 'status'>) {
    const newItem: MappingItem = {
      ...item,
      id: crypto.randomUUID(),
      status: 'Linked'
    };
    
    this.api.createMapping(newItem).subscribe(() => {
      // Actualización inmutable del estado
      this.mappingsSignal.update(current => [newItem, ...current]);
    });
  }

  /**
   * Procesa la importación de un archivo JSON externo para carga masiva.
   * Parsea, valida y normaliza los datos antes de ingresarlos al estado.
   * @param file Archivo seleccionado por el usuario
   * @returns Promise con la cantidad de registros procesados
   */
  processFileImport(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const rawData = JSON.parse(e.target.result);
          
          if (!Array.isArray(rawData)) {
            throw new Error("El formato JSON debe ser un Array.");
          }

          // Mapeo y Sanitización de datos externos
          const validItems: Omit<MappingItem, 'id' | 'status'>[] = rawData.map((d: any) => ({
             bydCode: d.bydCode || d.Codigo || '',
             description: d.description || d.Descripcion || '',
             vehicleSeries: d.vehicleSeries || d.Modelo || 'GENERICO',
             mainCategory: d.mainCategory || d.Categoria || 'General',
             standardHours: Number(d.standardHours || d.Horas || 0),
             daltonCode: d.daltonCode || 'MO006',
             bydType: (d.bydType === 'Repair' || d.bydType === 'Labor') ? d.bydType : 'Labor'
          })).filter(i => i.bydCode && i.description); // Filtro básico de integridad

          if (validItems.length > 0) {
            this.addBatchMappings(validItems);
            resolve(validItems.length);
          } else {
            reject("No se encontraron registros válidos en el archivo.");
          }
        } catch (err) {
          reject("Error al procesar el archivo JSON. Verifique el formato.");
        }
      };

      reader.onerror = () => reject("Error de lectura de archivo.");
      reader.readAsText(file);
    });
  }

  /**
   * Procesa múltiples mappings (Batch).
   * Idealmente esto iría a un endpoint /batch en la API.
   */
  addBatchMappings(items: Omit<MappingItem, 'id' | 'status'>[]) {
    const newItems: MappingItem[] = items.map(i => ({
      ...i,
      id: crypto.randomUUID(),
      status: 'Linked'
    }));
    
    // Actualizamos el estado local inmediatamente (Optimistic UI)
    // En producción, aquí llamaríamos a this.api.createBatch(...)
    this.mappingsSignal.update(current => [...newItems, ...current]);
  }

  /**
   * Elimina un mapping por ID.
   */
  removeMapping(id: string) {
    this.api.deleteMapping(id).subscribe(() => {
      this.mappingsSignal.update(current => current.filter(i => i.id !== id));
    });
  }

  /**
   * Elimina un lote de mappings por sus IDs.
   * Utiliza Optimistic UI (actualiza estado inmediatamente).
   */
  removeBatchMappings(ids: string[]) {
    this.mappingsSignal.update(current => current.filter(i => !ids.includes(i.id)));
    // TODO: En un escenario real, llamar a un endpoint batch delete como this.api.deleteBatchMappings(ids)
  }

  /**
   * Actualiza la categoría principal para un lote de mappings.
   */
  updateBatchCategory(ids: string[], category: string) {
    this.mappingsSignal.update(current => 
      current.map(i => ids.includes(i.id) ? { ...i, mainCategory: category } : i)
    );
    // TODO: Llamar a endpoint batch update
  }
}
