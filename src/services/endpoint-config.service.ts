
import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, tap, Observable, throwError, of } from 'rxjs';
import { EndpointConfiguration } from '../models/app.types';
import { NotificationService } from './notification.service';
import { API_REGISTRY, BASE_PATHS } from '../config/api.registry';

export type ApiEnvironment = 'Prod' | 'Qa' | 'Dev' | 'Local';

@Injectable({
  providedIn: 'root'
})
export class EndpointConfigService {
  private http = inject(HttpClient);
  private notification = inject(NotificationService);
  
  // URL del Microservicio de Gestión de Configuraciones (API-EQUIVALENCIAS-BYD)
  // Por defecto apunta a Local, pero debería ser configurable o detectado por ambiente de despliegue.
  private readonly MANAGEMENT_API_URL = 'http://localhost:5000/api/ApiConfigs'; 
  
  // Key de suscripción para el API Manager (Requerido en QA/PROD)
  // TODO: En un entorno real, esto vendría de variables de entorno (process.env).
  private readonly MANAGEMENT_SUB_KEY = ''; 

  // Estado Global
  currentEnvironment = signal<ApiEnvironment>('Prod');
  private configsSignal = signal<EndpointConfiguration[]>([]);
  isLoading = signal(false); 
  
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
      
      // Fallback a Prod si el entorno elegido está vacío
      if(!base) base = config.basePathProd || '';
      
      // Normalización de slashes
      const cleanBase = base.replace(/\/$/, '');
      const cleanRes = config.resource.startsWith('/') ? config.resource : '/' + config.resource;
      
      return {
        ...config,
        computedUrl: `${cleanBase}${cleanRes}`,
        apiKey: resolvedApiKey
      } as EndpointConfiguration;
    });
  });

  /**
   * Construye los headers de autenticación para la API de Gestión.
   * Si se configura una MANAGEMENT_SUB_KEY, se adjunta el header Ocp-Apim-Subscription-Key.
   */
  private getManagementHeaders() {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    if (this.MANAGEMENT_SUB_KEY) {
      headers = headers.set('Ocp-Apim-Subscription-Key', this.MANAGEMENT_SUB_KEY);
    }
    return { headers };
  }

  /**
   * Construye el payload en Notación Húngara requerido por el backend.
   */
  private mapToHungarianPayload(config: Partial<EndpointConfiguration>) {
    return {
      vchNombre: config.name,
      vchDescripcion: config.description,
      vchBasePathProd: config.basePathProd,
      vchBasePathQa: config.basePathQa,
      vchBasePathDev: config.basePathDev,
      vchBasePathLocal: config.basePathLocal,
      vchResource: config.resource,
      vchApiKeyProd: config.apiKeyProd,
      vchApiKeyQa: config.apiKeyQa,
      vchHeaderKey: config.headerKey,
      bitActivo: config.isActive
    };
  }

  private getInitialConfigs(): EndpointConfiguration[] {
    return API_REGISTRY.map((def, index) => ({
      id: (index + 1).toString(),
      name: def.name || 'Endpoint',
      description: def.description || '',
      basePathProd: BASE_PATHS.PROD,
      basePathQa: BASE_PATHS.QA,
      basePathDev: BASE_PATHS.DEV,
      basePathLocal: BASE_PATHS.LOCAL,
      resource: def.resource || '/',
      method: (def.method as any) || 'GET',
      headerKey: 'X-API-Key',
      apiKeyProd: '', 
      apiKeyQa: '',
      isActive: true,
      lastModified: new Date().toISOString(),
      jsonStructure: def.jsonStructure || '{}',
      computedUrl: '', 
      apiKey: ''
    }));
  }

  getConfig(nameSubstring: string): EndpointConfiguration | undefined {
    return this.configurations().find(c => 
      c.isActive && c.name.toLowerCase().includes(nameSubstring.toLowerCase())
    );
  }

  setEnvironment(env: ApiEnvironment) {
    this.currentEnvironment.set(env);
  }

  load(isMock: boolean) {
    this.isLoading.set(true);
    
    const baseConfigs = this.getInitialConfigs();

    if (isMock) {
      setTimeout(() => {
        this.configsSignal.set(baseConfigs);
        this.isLoading.set(false);
      }, 600);
    } else {
      this.http.get<any[]>(this.MANAGEMENT_API_URL, this.getManagementHeaders()).subscribe({
        next: (data) => {
           if (Array.isArray(data) && data.length > 0) {
             const mapped = this.mapBackendResponse(data);
             this.configsSignal.set(mapped);
           } else {
             console.warn('API retornó lista vacía, usando registro local.');
             this.configsSignal.set(baseConfigs);
           }
           this.isLoading.set(false);
        },
        error: (err) => {
           console.warn('No se pudieron cargar configs remotas (Offline/Error), usando registro local.', err);
           this.configsSignal.set(baseConfigs);
           this.isLoading.set(false);
        }
      });
    }
  }

  // Helper para mapear respuesta Hungarian a CamelCase
  private mapBackendResponse(data: any[]): EndpointConfiguration[] {
    return data.map(d => ({
      id: d.id || crypto.randomUUID(),
      name: d.vchNombre || 'Sin Nombre',
      description: d.vchDescripcion || '',
      basePathProd: d.vchBasePathProd || BASE_PATHS.PROD,
      basePathQa: d.vchBasePathQa || BASE_PATHS.QA,
      basePathDev: d.vchBasePathDev || BASE_PATHS.DEV,
      basePathLocal: d.vchBasePathLocal || BASE_PATHS.LOCAL,
      resource: d.vchResource || '/',
      headerKey: d.vchHeaderKey || 'X-API-Key',
      apiKeyProd: d.vchApiKeyProd || '',
      apiKeyQa: d.vchApiKeyQa || '',
      isActive: d.bitActivo !== undefined ? d.bitActivo : true,
      method: 'POST', // Default safe as backend might not store method
      jsonStructure: '{}',
      lastModified: d.dtCreatedAt || new Date().toISOString()
    }));
  }

  // ===========================================================================
  //  MÉTODOS DE INTERACCIÓN CON BASE DE DATOS
  // ===========================================================================

  /**
   * POST: Crear Nueva Configuración
   */
  createConfig(config: Omit<EndpointConfiguration, 'id' | 'lastModified' | 'computedUrl'>): Observable<any> {
    const payload = this.mapToHungarianPayload(config);

    return this.http.post(this.MANAGEMENT_API_URL, payload, this.getManagementHeaders()).pipe(
      tap((response: any) => {
        const newConfig: EndpointConfiguration = {
          ...config,
          id: response?.id || crypto.randomUUID(), // Fallback ID if backend doesn't return obj
          lastModified: new Date().toISOString()
        };
        this.configsSignal.update(list => [newConfig, ...list]);
        this.notification.show('Configuración creada en servidor.', 'success');
      }),
      catchError(err => {
        console.error('Error al crear endpoint:', err);
        this.notification.show('Error al guardar configuración en el servidor.', 'error');
        return throwError(() => err);
      })
    );
  }

  /**
   * PUT: Actualizar Configuración Existente
   */
  updateConfig(id: string, config: EndpointConfiguration): Observable<any> {
    const payload = this.mapToHungarianPayload(config);
    const url = `${this.MANAGEMENT_API_URL}/${id}`;

    // Optimistic Update Local
    this.configsSignal.update(list => 
      list.map(c => c.id === id ? { ...c, ...config, lastModified: new Date().toISOString() } : c)
    );

    return this.http.put(url, payload, this.getManagementHeaders()).pipe(
      tap(() => {
        this.notification.show('Configuración actualizada.', 'success');
      }),
      catchError(err => {
        console.error('Error update endpoint:', err);
        this.notification.show('Error sincronizando actualización.', 'error');
        // Rollback could be implemented here
        return throwError(() => err);
      })
    );
  }

  /**
   * DELETE: Desactivar Configuración (Soft Delete)
   */
  deleteConfig(id: string): Observable<any> {
    const url = `${this.MANAGEMENT_API_URL}/${id}`;
    
    // Remove from UI immediately
    this.configsSignal.update(list => list.filter(c => c.id !== id));

    return this.http.delete(url, this.getManagementHeaders()).pipe(
        tap(() => this.notification.show('Configuración desactivada (Soft Delete).', 'info')),
        catchError((e) => {
           console.error('Error eliminando remoto', e);
           this.notification.show('Error al desactivar en servidor.', 'error');
           return of(null);
        })
    );
  }

  /**
   * PATCH: Reactivar Configuración
   * Nota: Este método no se usa actualmente en la UI principal pero está listo para implementación.
   */
  reactivateConfig(id: string): Observable<any> {
    const url = `${this.MANAGEMENT_API_URL}/${id}/reactivate`;
    return this.http.patch(url, {}, this.getManagementHeaders());
  }
}
