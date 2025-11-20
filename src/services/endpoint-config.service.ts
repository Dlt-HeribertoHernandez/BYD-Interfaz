
import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { MappingItem, EndpointConfiguration } from '../models/app.types';

// Definición estricta de la estructura de la tabla SQL solicitada
export interface BydModelSqlRow {
  IdModeloVehiculo: number; 
  Nombre: string;           
  Codigo: string;           
  Descripcion: string;      
}

@Injectable({
  providedIn: 'root'
})
export class EndpointConfigService {
  private http = inject(HttpClient);
  
  // Backend URL for configuration persistence
  private readonly CONFIG_API_URL = 'https://api.daltonsoft-integration.com/api/configurations'; 

  // Initial Mock Data
  private initialConfigs: EndpointConfiguration[] = [
    {
      id: '1',
      name: 'Carga Catálogo BYD', // Key for lookup
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
      name: 'Vincular Orden Servicio', // Key for lookup
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
      name: 'Obtener Agencias (Dealers)', // Key for lookup
      description: 'Obtiene el listado de agencias configuradas.',
      url: 'http://localhost:5013/api/Dealers',
      method: 'GET',
      targetTable: 'N/A', 
      apiKey: '',
      headers: '{\n  "Accept": "application/json"\n}',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: '// GET Request'
    },
    {
      id: '4',
      name: 'Obtener Mappings', // Key for lookup
      description: 'Obtiene el listado de vinculaciones existentes.',
      url: 'https://api.daltonsoft-integration.com/api/mappings',
      method: 'GET',
      targetTable: '[dbo].[BYDModelosDMS]',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: '// GET Request'
    },
    {
      id: '5',
      name: 'Obtener Órdenes', // Key for lookup
      description: 'Consulta las órdenes de servicio del DMS.',
      url: 'https://api.daltonsoft-integration.com/api/orders',
      method: 'GET',
      targetTable: 'dsfacdocori',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: '// GET Request params: ?startDate=...&endDate=...'
    },
    {
      id: '6',
      name: 'Obtener Logs', // Key for lookup
      description: 'Consulta los logs de integración de la base de datos.',
      url: 'https://api.daltonsoft-integration.com/api/logs',
      method: 'GET',
      targetTable: '[dbo].[LogIntegracion]',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: '// GET Request params: ?startDate=...&endDate=...'
    }
  ];

  // Signals for State
  private configsSignal = signal<EndpointConfiguration[]>([]);
  readonly configurations = this.configsSignal.asReadonly();

  // Helper to get FULL Config object by partial name match
  getConfig(nameSubstring: string): EndpointConfiguration | undefined {
    return this.configsSignal().find(c => 
      c.isActive && c.name.toLowerCase().includes(nameSubstring.toLowerCase())
    );
  }

  // Legacy helper (keeping for compatibility, but getConfig is preferred)
  getEndpointUrl(nameSubstring: string): string | undefined {
    return this.getConfig(nameSubstring)?.url;
  }

  // Triggered by ApiService to avoid circular dependency
  load(isMock: boolean) {
    if (isMock) {
      this.configsSignal.set(this.initialConfigs);
    } else {
      // LIVE MODE: Clear configs first to ensure we don't use stale mock data
      this.configsSignal.set([]); 
      
      // PERSISTENCE: Load from SQL via Backend API
      // STRICT MODE: If error (backend down), return EMPTY list.
      this.http.get<EndpointConfiguration[]>(this.CONFIG_API_URL).pipe(
        catchError(err => {
          console.warn('Live Mode: Could not load configurations from backend. App will be empty until configs are added.', err);
          return of([]); 
        })
      ).subscribe(data => {
        if (data && data.length > 0) {
           this.configsSignal.set(data);
        }
      });
    }
  }

  // CRUD METHODS

  addConfig(config: Omit<EndpointConfiguration, 'id' | 'lastModified'>) {
    const newConfig: EndpointConfiguration = {
      ...config,
      id: crypto.randomUUID(), 
      lastModified: new Date().toISOString()
    };

    // Optimistic / Mock Update
    this.configsSignal.update(list => [newConfig, ...list]);

    // Persist if in Live Environment context
    if (this.CONFIG_API_URL.includes('localhost') || this.CONFIG_API_URL.includes('daltonsoft')) {
       this.http.post<EndpointConfiguration>(this.CONFIG_API_URL, newConfig).pipe(
         catchError(e => {
           console.error('Error persisting config', e);
           return of(null);
         })
       ).subscribe(saved => {
         if (saved) {
           this.configsSignal.update(list => 
             list.map(c => c.id === newConfig.id ? saved : c)
           );
         }
       });
    }
  }

  updateConfig(id: string, changes: Partial<EndpointConfiguration>) {
    this.configsSignal.update(list => 
      list.map(c => c.id === id ? { ...c, ...changes, lastModified: new Date().toISOString() } : c)
    );

    this.http.put(`${this.CONFIG_API_URL}/${id}`, changes).pipe(catchError(e => of(null))).subscribe();
  }

  deleteConfig(id: string) {
    this.configsSignal.update(list => list.filter(c => c.id !== id));
    this.http.delete(`${this.CONFIG_API_URL}/${id}`).pipe(catchError(e => of(null))).subscribe();
  }

  // --- SQL Structure Helpers ---
  
  transformToSqlStructure(items: Partial<MappingItem>[]): BydModelSqlRow[] {
    return items.map((item, index) => ({
      IdModeloVehiculo: index + 1, 
      Nombre: item.vehicleModel || 'GENERICO', 
      Codigo: item.bydCode || '', 
      Descripcion: item.description || '' 
    }));
  }

  buildInsertPayload(rows: BydModelSqlRow[]) {
    const activeConfig = this.getConfig('Carga');
    
    const basePayload = {
      configuration: {
        process: "INSERT_BYD_MODELS",
        target: "[dbo].[BYDModelosDMS]",
        timestamp: new Date().toISOString(),
        recordCount: rows.length,
        schema: ['IdModeloVehiculo', 'Nombre', 'Codigo', 'Descripcion']
      },
      data: rows
    };

    if (activeConfig) {
      return {
        ...basePayload,
        configuration: {
          ...basePayload.configuration,
          process: activeConfig.name, 
          target: activeConfig.targetTable || basePayload.configuration.target,
          apiKey: activeConfig.apiKey // Include API Key in payload if needed by backend wrapper
        }
      };
    }
    return basePayload;
  }
}
