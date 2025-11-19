
import { Injectable, signal, inject, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import { MappingItem, EndpointConfiguration } from '../models/app.types';
import { ApiService } from './api.service';

// Definición estricta de la estructura de la tabla SQL solicitada (Legacy support for hardcoded demo)
export interface BydModelSqlRow {
  IdModeloVehiculo: number; // [IdModeloVehiculo]
  Nombre: string;           // [Nombre]
  Codigo: string;           // [Codigo]
  Descripcion: string;      // [Descripcion]
}

@Injectable({
  providedIn: 'root'
})
export class EndpointConfigService {
  private http = inject(HttpClient);
  private api = inject(ApiService); // To check Mock vs Live mode
  
  // Backend URL for configuration persistence
  private readonly CONFIG_API_URL = 'https://api.daltonsoft-integration.com/api/configurations'; 

  // --- CONFIGURATION STATE MANAGEMENT ---
  
  // Initial Mock Data for configurations including the NEW Dealers Endpoint
  private initialConfigs: EndpointConfiguration[] = [
    {
      id: '1',
      name: 'Carga Catálogo BYD',
      description: 'Inserta modelos y labor codes en la tabla maestra.',
      url: 'https://api.daltonsoft-integration.com/api/dynamic-insert',
      method: 'POST',
      targetTable: '[dbo].[BYDModelosDMS]',
      apiKey: 'sk_prod_9988776655',
      headers: '{\n  "Content-Type": "application/json",\n  "X-Tenant-ID": "BYD-MEX"\n}',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: JSON.stringify({
        configuration: {
          process: "INSERT_BYD_MODELS",
          target: "[dbo].[BYDModelosDMS]",
          timestamp: "{{TIMESTAMP}}",
          schema: ["IdModeloVehiculo", "Nombre", "Codigo", "Descripcion"]
        },
        data: ["{{ARRAY_DATA}}"]
      }, null, 2)
    },
    {
      id: '2',
      name: 'Vincular Orden Servicio',
      description: 'Envía la vinculación de un item de orden a un código BYD.',
      url: 'https://api.daltonsoft-integration.com/api/mappings/link-from-order',
      method: 'POST',
      targetTable: 'N/A',
      apiKey: '',
      headers: '{\n  "Content-Type": "application/json"\n}',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: JSON.stringify({
        daltonCode: "{{STRING}}",
        bydCode: "{{STRING}}",
        bydType: "Labor|Repair",
        dealerCode: "{{CONTEXT_DEALER}}"
      }, null, 2)
    },
    {
      id: '3',
      name: 'Obtener Agencias (Dealers)',
      description: 'Obtiene el listado de agencias configuradas en el sistema.',
      url: 'http://localhost:5013/api/Dealers',
      method: 'GET',
      targetTable: 'N/A', // Read-only
      apiKey: '',
      headers: '{\n  "Accept": "application/json"\n}',
      isActive: true,
      lastModified: new Date().toISOString(),
      // GET requests don't have a body, but we document the response format here or leave empty
      jsonStructure: '// Este servicio es GET, no requiere body.\n// Respuesta esperada:\n// [\n//   { "dealerCode": "MEX...", "dealerName": "..." }\n// ]'
    }
  ];

  // Signals for State
  private configsSignal = signal<EndpointConfiguration[]>([]);
  readonly configurations = this.configsSignal.asReadonly();

  constructor() {
    // Effect to reload configurations when mode changes (Demo <-> Live)
    effect(() => {
      const isMock = this.api.useMockData();
      this.loadConfigurations(isMock);
    });
  }

  private loadConfigurations(isMock: boolean) {
    if (isMock) {
      this.configsSignal.set(this.initialConfigs);
    } else {
      // PERSISTENCE: Load from SQL via Backend API
      this.http.get<EndpointConfiguration[]>(this.CONFIG_API_URL).pipe(
        catchError(err => {
          console.warn('Error loading configs from backend (SQL), using fallback:', err);
          // Fallback to initial configs if backend fails or table doesn't exist yet
          return of(this.initialConfigs); 
        })
      ).subscribe(data => {
        this.configsSignal.set(data);
      });
    }
  }

  // CRUD METHODS WITH PERSISTENCE

  addConfig(config: Omit<EndpointConfiguration, 'id' | 'lastModified'>) {
    const newConfig: EndpointConfiguration = {
      ...config,
      id: crypto.randomUUID(), // Temp ID, backend might replace it
      lastModified: new Date().toISOString()
    };

    if (this.api.useMockData()) {
      this.configsSignal.update(list => [newConfig, ...list]);
    } else {
      // SAVE TO SQL
      this.http.post<EndpointConfiguration>(this.CONFIG_API_URL, newConfig).subscribe({
        next: (savedConfig) => {
          // Use returned config (which might have real SQL ID) or fallback to local
          this.configsSignal.update(list => [savedConfig || newConfig, ...list]);
        },
        error: (err) => {
          console.error('Failed to save config to SQL:', err);
          alert('Error al guardar la configuración en la base de datos.');
        }
      });
    }
  }

  updateConfig(id: string, changes: Partial<EndpointConfiguration>) {
    if (this.api.useMockData()) {
      this.configsSignal.update(list => 
        list.map(c => c.id === id ? { ...c, ...changes, lastModified: new Date().toISOString() } : c)
      );
    } else {
      // UPDATE SQL
      const current = this.configsSignal().find(c => c.id === id);
      if (!current) return;
      
      const updated = { ...current, ...changes, lastModified: new Date().toISOString() };

      this.http.put(`${this.CONFIG_API_URL}/${id}`, updated).subscribe({
        next: () => {
          this.configsSignal.update(list => 
            list.map(c => c.id === id ? updated : c)
          );
        },
        error: (err) => {
          console.error('Failed to update config in SQL:', err);
          alert('Error al actualizar la configuración en la base de datos.');
        }
      });
    }
  }

  deleteConfig(id: string) {
    if (this.api.useMockData()) {
      this.configsSignal.update(list => list.filter(c => c.id !== id));
    } else {
      // DELETE FROM SQL
      this.http.delete(`${this.CONFIG_API_URL}/${id}`).subscribe({
        next: () => {
          this.configsSignal.update(list => list.filter(c => c.id !== id));
        },
        error: (err) => {
          console.error('Failed to delete config from SQL:', err);
          alert('Error al eliminar la configuración de la base de datos.');
        }
      });
    }
  }

  getConfigById(id: string): EndpointConfiguration | undefined {
    return this.configsSignal().find(c => c.id === id);
  }


  // --- LEGACY HELPERS (Used by MappingLinkerComponent) ---
  
  private readonly SQL_CONFIG = {
    processName: 'INSERT_BYD_MODELS',
    targetTable: '[dbo].[BYDModelosDMS]',
    endpoint: '/dynamic-insert'
  };

  transformToSqlStructure(items: Partial<MappingItem>[]): BydModelSqlRow[] {
    return items.map((item, index) => ({
      IdModeloVehiculo: index + 1, 
      Nombre: item.vehicleModel || 'GENERICO', 
      Codigo: item.bydCode || '', 
      Descripcion: item.description || '' 
    }));
  }

  buildInsertPayload(rows: BydModelSqlRow[]) {
    // Try to find the config to see if user changed it, otherwise fallback
    const activeConfig = this.configsSignal().find(c => c.id === '1');
    
    if (activeConfig) {
      return {
        configuration: {
          process: activeConfig.name, 
          target: activeConfig.targetTable, 
          apiKey: activeConfig.apiKey, 
          timestamp: new Date().toISOString(),
          recordCount: rows.length,
          schema: ['IdModeloVehiculo', 'Nombre', 'Codigo', 'Descripcion']
        },
        data: rows
      };
    }

    return {
      configuration: {
        process: this.SQL_CONFIG.processName,
        target: this.SQL_CONFIG.targetTable,
        timestamp: new Date().toISOString(),
        recordCount: rows.length,
        schema: ['IdModeloVehiculo', 'Nombre', 'Codigo', 'Descripcion']
      },
      data: rows
    };
  }
}
