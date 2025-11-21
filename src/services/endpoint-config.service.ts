
import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, tap, Observable, of, throwError } from 'rxjs';
import { EndpointConfiguration } from '../models/app.types';
import { NotificationService } from './notification.service';

export type ApiEnvironment = 'Prod' | 'Qa' | 'Dev' | 'Local';

@Injectable({
  providedIn: 'root'
})
export class EndpointConfigService {
  private http = inject(HttpClient);
  private notification = inject(NotificationService);
  
  // URL endpoint exacto solicitado
  private readonly API_URL = '/api/ApiConfigs'; 
  
  // Estado Global
  currentEnvironment = signal<ApiEnvironment>('Prod');
  private configsSignal = signal<EndpointConfiguration[]>([]);
  
  // Mock Data Inicial (Fallback por si la API está caída en demo)
  private initialConfigs: EndpointConfiguration[] = [
    {
      id: '1',
      name: 'Carga Catálogo BYD',
      description: 'Inserta modelos y labor codes en la tabla maestra.',
      basePathProd: 'https://api.daltonsoft.com/v1',
      basePathQa: 'https://qa-api.daltonsoft.com/v1',
      basePathDev: 'https://dev-api.daltonsoft.com/v1',
      basePathLocal: 'http://localhost:5000',
      resource: '/dynamic-insert',
      headerKey: 'X-API-Key',
      apiKeyProd: 'prod_key_9988',
      method: 'POST',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: '{}'
    }
  ];

  // --- COMPUTED: Resuelve la URL final según el entorno seleccionado ---
  readonly configurations = computed(() => {
    const env = this.currentEnvironment();
    return this.configsSignal().map(config => {
      let base = '';
      let resolvedApiKey = '';

      switch(env) {
        case 'Prod': 
          base = config.basePathProd;
          resolvedApiKey = config.apiKeyProd || '';
          break;
        case 'Qa': 
          base = config.basePathQa; 
          resolvedApiKey = config.apiKeyQa || '';
          break;
        case 'Dev': 
          base = config.basePathDev; 
          break;
        case 'Local': 
          base = config.basePathLocal; 
          break;
      }
      
      if(!base) base = config.basePathProd || '';
      
      const cleanBase = base.replace(/\/$/, '');
      const cleanRes = config.resource.startsWith('/') ? config.resource : '/' + config.resource;
      
      return {
        ...config,
        computedUrl: `${cleanBase}${cleanRes}`,
        apiKey: resolvedApiKey
      } as EndpointConfiguration;
    });
  });

  getConfig(nameSubstring: string): EndpointConfiguration | undefined {
    return this.configurations().find(c => 
      c.isActive && c.name.toLowerCase().includes(nameSubstring.toLowerCase())
    );
  }

  setEnvironment(env: ApiEnvironment) {
    this.currentEnvironment.set(env);
  }

  load(isMock: boolean) {
    // Si estamos en modo Mock, cargamos data local
    if (isMock) {
      this.configsSignal.set(this.initialConfigs);
    } else {
      // En modo Live, intentamos cargar de la BD real
      this.http.get<any[]>(this.API_URL).subscribe({
        next: (data) => {
           if (Array.isArray(data)) {
             // Mapear de vuelta de Hungarian a CamelCase para uso interno
             const mapped = data.map(d => ({
                id: d.id || crypto.randomUUID(),
                name: d.vchNombre,
                description: d.vchDescripcion,
                basePathProd: d.vchBasePathProd,
                basePathQa: d.vchBasePathQa,
                basePathDev: d.vchBasePathDev,
                basePathLocal: d.vchBasePathLocal,
                resource: d.vchResource,
                headerKey: d.vchHeaderKey,
                apiKeyProd: d.vchApiKeyProd,
                apiKeyQa: d.vchApiKeyQa,
                isActive: d.bitActivo !== undefined ? d.bitActivo : true,
                method: 'POST', // Default safe ya que no viene en la respuesta
                jsonStructure: '{}', // Default safe
                lastModified: d.dtCreatedAt || new Date().toISOString()
             } as EndpointConfiguration));
             this.configsSignal.set(mapped);
           }
        },
        error: (err) => {
           console.warn('No se pudieron cargar configs de la API, usando fallback.', err);
           this.configsSignal.set(this.initialConfigs);
        }
      });
    }
  }

  // ===========================================================================
  //  MÉTODOS DE INTERACCIÓN CON BASE DE DATOS (POST /api/ApiConfigs)
  // ===========================================================================

  /**
   * Crea una nueva configuración en Base de Datos.
   * Mapea el modelo de frontend (CamelCase) al modelo de backend (Hungarian Notation).
   */
  createConfig(config: Omit<EndpointConfiguration, 'id' | 'lastModified' | 'computedUrl'>): Observable<any> {
    
    // Payload estricto según especificación
    const payload = {
      vchNombre: config.name,
      vchDescripcion: config.description,
      
      // Rutas por entorno
      vchBasePathProd: config.basePathProd,
      vchBasePathQa: config.basePathQa,
      vchBasePathDev: config.basePathDev,
      vchBasePathLocal: config.basePathLocal,
      
      // Recurso y Seguridad
      vchResource: config.resource,
      vchApiKeyProd: config.apiKeyProd,
      vchApiKeyQa: config.apiKeyQa,
      vchHeaderKey: config.headerKey,
      
      // Campo booleano para estado
      bitActivo: config.isActive
    };

    console.log('Enviando Payload a /api/ApiConfigs:', payload);

    return this.http.post(this.API_URL, payload).pipe(
      tap((response: any) => {
        // Actualización optimista en la lista local
        const newConfig: EndpointConfiguration = {
          ...config,
          id: response?.id || crypto.randomUUID(),
          lastModified: new Date().toISOString()
        };
        this.configsSignal.update(list => [newConfig, ...list]);
        this.notification.show('Configuración guardada en base de datos.', 'success');
      }),
      catchError(err => {
        console.error('Error al crear endpoint:', err);
        this.notification.show('Error al guardar configuración en el servidor.', 'error');
        return throwError(() => err);
      })
    );
  }

  deleteConfig(id: string) {
    // Eliminar localmente primero (optimista)
    this.configsSignal.update(list => list.filter(c => c.id !== id));
    // Intento de borrado remoto
    this.http.delete(`${this.API_URL}/${id}`).subscribe({
        error: (e) => console.error('Error eliminando remoto', e)
    });
  }

  updateConfig(id: string, changes: Partial<EndpointConfiguration>) {
    // Actualizar localmente
    this.configsSignal.update(list => 
      list.map(c => c.id === id ? { ...c, ...changes, lastModified: new Date().toISOString() } : c)
    );
    // TODO: Implementar PUT si el backend lo soporta (actualmente solo POST especificado)
  }
}