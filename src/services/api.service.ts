
import { Injectable, signal, inject, effect } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { delay, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MappingItem, ServiceOrder, Dealer, EndpointConfiguration, IntegrationLog } from '../models/app.types';
import { EndpointConfigService } from './endpoint-config.service';

/**
 * Servicio principal de comunicación HTTP.
 * Maneja tanto la simulación de datos (Mock) como la comunicación real con los endpoints configurados.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private endpointConfig = inject(EndpointConfigService);
  
  // Señales de configuración global del servicio
  useMockData = signal<boolean>(true);
  selectedDealerCode = signal<string>(''); 

  constructor() {
    // Reactividad: Si cambia el modo (Mock/Live), recargar las configuraciones de endpoint
    effect(() => {
      const isMock = this.useMockData();
      this.endpointConfig.load(isMock);
    });
  }

  toggleMockData() {
    this.useMockData.update(v => !v);
  }

  // ===========================================================================
  // DATOS MOCK (Simulación para Demo y Desarrollo)
  // ===========================================================================
  
  private mockDealers: Dealer[] = [
    { intID: 1, dealerCode: 'MEX022429', dealerName: 'BYD Carretera 57-Dalton', appId: '791565418', dealerKey: '24f5...', vchRepairStoreCode: 'MEX022429RS0001' },
    { intID: 2, dealerCode: 'MEX022310', dealerName: 'BYD Lopez Mateos-Dalton', appId: '791565389', dealerKey: '8b7b...', vchRepairStoreCode: 'MEX022310RS0001' },
    { intID: 3, dealerCode: 'MEX022311', dealerName: 'BYD Lomas-Dalton', appId: '791565390', dealerKey: 'd366...', vchRepairStoreCode: 'MEX022311RS0001' },
  ];

  private mockMappings: MappingItem[] = [
    { id: '1', bydCode: 'WSA3HAC02101GH00', bydType: 'Labor', daltonCode: '19897094-00', status: 'Linked', description: 'Replace EGR gasket 2', vehicleSeries: 'SONG PLUS DMI', vehicleModel: 'SONG PLUS DMI' },
    { id: '2', bydCode: 'WSA3HRF00501GH00', bydType: 'Repair', daltonCode: '10500005-00', status: 'Linked', description: 'Replace ACC bracket', vehicleSeries: 'SONG PLUS DMI', vehicleModel: 'SONG PLUS DMI' },
    { id: '3', bydCode: 'SHARK_LAB_01', bydType: 'Labor', daltonCode: 'S_LAB_01', status: 'Pending', description: 'Shark Battery Replace', vehicleSeries: 'SHARK', vehicleModel: 'SHARK' }
  ];

  private mockOrders: ServiceOrder[] = [
    // Caso 1: Orden Pendiente con Logs de error
    {
      id: '435', branchCode: 'MEX022429', docType: 'OS', orderNumber: 'XCL00435', date: '2025-11-12', 
      customerCode: '9003', customerName: 'DE LA MORA GUTIERREZ ANDRES', vin: 'LGXC74C48S0147557', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BC DM-I AT DELAN BLACK', year: '2025',
      totalAmount: 1795.22, status: 'Pending', 
      items: [
          { code: '15407199-00', description: 'IPC MEMORY CARD_EVA007KG-IC-M1-BYD', quantity: 2, total: 847.60, isLinked: false },
          { code: 'MO006', description: 'CONFIGURACION DE TARJETAS NFC PARA CARGADOR', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    },
    // Caso 2: Orden Completada
    {
      id: '434', branchCode: 'MEX022429', docType: 'OS', orderNumber: 'XCL00434', date: '2025-11-12', 
      customerCode: '6881', customerName: 'MORENO GONZALEZ RAFAEL ANTONIO', vin: 'LGXCE4CC2S0064848', 
      modelCodeRaw: 'DOLPHIN25', modelDescRaw: 'DOLPHIN MINI 2025 BL PLUS EV AT BLANCO', year: '2025',
      totalAmount: 1700.63, status: 'Completed', 
      items: [
          { code: 'MO006', description: 'CAMBIO DE NEUMATICOS', quantity: 0.86, total: 602.00, isLinked: false },
          { code: 'A Y B SERV', description: 'ALINEACIÓN Y BALANCEO', quantity: 1, total: 864.06, isLinked: false }
      ], 
      logs: []
    },
    {
      id: '433', branchCode: 'MEX022429', docType: 'OS', orderNumber: 'XCL00433', date: '2025-11-12', 
      customerCode: '3088', customerName: 'RAMIREZ AMADOR FAUSTO ALONSO', vin: 'LPE19W2A0SF095657', 
      modelCodeRaw: 'SHARK25', modelDescRaw: 'SHARK 2025 BL PLUG IN HIBRIDO DM-O GS AT VERDE BOREAL', year: '2025',
      totalAmount: 812.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'UNIDAD INGRESA A TALLER POR TESTIGO DE CHECK ENGINE QUE APARECE OCASIONALMENTE', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    },
    {
      id: '432', branchCode: 'MEX022429', docType: 'OS', orderNumber: 'XCL00432', date: '2025-11-12', 
      customerCode: '4418', customerName: 'RAMIREZ OROZCO BENJAMIN', vin: 'LGXC74C42S0023462', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BL DM-I AT EMPEROR RED', year: '2025',
      totalAmount: 812.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'UNIDAD INGRESA A TALLER POR RUIDO EN AMORTIGUADORES TRASEROS', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    }
  ];

  private mockLogs: IntegrationLog[] = [
    { id: '1', vchOrdenServicio: 'XCL00435', vchLog: '1 -> 190802', dtmcreated: new Date().toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":false,"message":"Warranty activation date for VIN mismatch"}', VIN: 'LGXC74C48S0147557', labourcode: 'WSA3HAC02101GH00', Cod_TpAut: 'SOPL25BY', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true },
    { id: '2', vchOrdenServicio: 'XCL00434', vchLog: '1 -> 190586', dtmcreated: new Date().toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"OK"}', VIN: 'LGXCE4CC2S0064848', labourcode: 'WSATJ00101GH00', Cod_TpAut: 'DOLPHIN25', Desc_TpAut: 'DOLPHIN MINI', isError: false },
  ];

  // ===========================================================================
  // HELPERS PRIVADOS
  // ===========================================================================

  /**
   * Construye las cabeceras HTTP dinámicamente basadas en la configuración del endpoint.
   * Permite inyectar API Keys y Custom Headers definidos por el usuario.
   */
  private getHttpOptions(config: EndpointConfiguration) {
    let headers = new HttpHeaders();
    
    // 1. Parsear headers customizados (JSON)
    if (config.headers) {
      try {
        const parsed = JSON.parse(config.headers);
        for (const key in parsed) {
          headers = headers.set(key, parsed[key]);
        }
      } catch (e) {
        console.warn(`Headers inválidos para config: ${config.name}`);
      }
    }
    
    // 2. Inyectar API Key si existe y no fue sobreescrita
    if (config.apiKey) {
        if (!headers.has('Authorization') && !headers.has('x-api-key') && !headers.has('X-API-Key')) {
             headers = headers.set('x-api-key', config.apiKey);
        }
    }
    return { headers };
  }

  // ===========================================================================
  // MÉTODOS PÚBLICOS (API)
  // ===========================================================================

  /** Obtiene el catálogo de agencias (dealers) */
  getDealers(): Observable<Dealer[]> {
    if(this.useMockData()) return of(this.mockDealers);
    
    const config = this.endpointConfig.getConfig('Dealers');
    if (!config || !config.url) return of([]);
    
    return this.http.get<Partial<Dealer>[]>(config.url, this.getHttpOptions(config)).pipe(
      map(response => {
        if (!Array.isArray(response)) return [];
        // Mapeo seguro para evitar undefined
        return response.map((d, i) => ({
          intID: d.intID || (i + 1),
          dealerCode: d.dealerCode || 'UNKNOWN',
          dealerName: d.dealerName || 'Unknown Dealer',
          appId: d.appId || '',
          dealerKey: d.dealerKey || '',
          vchRepairStoreCode: d.vchRepairStoreCode || ''
        } as Dealer));
      }),
      catchError(err => {
        console.error('API Error (Dealers):', err);
        return of([]);
      })
    );
  }

  /** Obtiene todos los mappings almacenados */
  getMappings(): Observable<MappingItem[]> {
    if (this.useMockData()) return of([...this.mockMappings]).pipe(delay(500));
    
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.url) return of([]);
    
    return this.http.get<MappingItem[]>(config.url, this.getHttpOptions(config)).pipe(
      catchError(() => of([]))
    );
  }

  /** Crea un nuevo mapping manualmente */
  createMapping(item: MappingItem): Observable<MappingItem> {
    if (this.useMockData()) {
      this.mockMappings.unshift(item);
      return of(item).pipe(delay(300));
    }
    
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.url) throw new Error("URL de Mappings no configurada");
    
    return this.http.post<MappingItem>(config.url, item, this.getHttpOptions(config));
  }

  /** Elimina un mapping existente */
  deleteMapping(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockMappings = this.mockMappings.filter(m => m.id !== id);
      return of(true).pipe(delay(300));
    }
    
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.url) return of(false);
    
    return this.http.delete<boolean>(`${config.url}/${id}`, this.getHttpOptions(config)).pipe(
       catchError(() => of(false))
    );
  }

  /** Consulta órdenes de servicio con filtros de fecha y dealer */
  getOrders(startDate: string, endDate: string, dealerCode?: string): Observable<ServiceOrder[]> {
    const targetDealer = dealerCode || this.selectedDealerCode();

    if (this.useMockData()) {
      // Retornar mock con delay para simular latencia de red
      return of(this.mockOrders).pipe(delay(600));
    }
    
    const config = this.endpointConfig.getConfig('Obtener Órdenes');
    if (!config || !config.url) return of([]);

    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('dealerCode', targetDealer);

    const options = { ...this.getHttpOptions(config), params };

    return this.http.get<ServiceOrder[]>(config.url, options).pipe(
      catchError(err => {
        console.error('API Error (Orders):', err);
        return of([]);
      })
    );
  }

  /**
   * Obtiene el historial de uso de un código BYD específico en órdenes pasadas.
   * Útil para ver si un código ha sido usado antes y en qué vehículos.
   */
  getBydCodeUsageHistory(bydCode: string): Observable<{orderRef: string, date: string, description: string, vin: string}[]> {
    if (this.useMockData()) {
      // Simular búsqueda en el array de mock local
      const history: {orderRef: string, date: string, description: string, vin: string}[] = [];
      
      this.mockOrders.forEach(order => {
        order.items.forEach(item => {
           if (item.isLinked && item.linkedBydCode === bydCode) {
             history.push({
               orderRef: order.orderNumber,
               date: order.date,
               description: item.description,
               vin: order.vin
             });
           }
        });
      });
      
      // Dato fake solo para demostración si no hay coincidencias
      if (history.length === 0 && Math.random() > 0.5) {
         history.push({
            orderRef: 'XCL00399',
            date: '2025-10-01',
            description: 'SIMULACIÓN DE DATO HISTÓRICO',
            vin: 'LPE19W2A8SF02716'
         });
      }

      return of(history).pipe(delay(400));
    }
    
    // Implementación Real:
    // Actualmente no hay endpoint definido, retornamos vacío.
    return of([]);
  }

  /** Obtiene logs de integración del sistema */
  getIntegrationLogs(startDate?: string, endDate?: string): Observable<IntegrationLog[]> {
    if (this.useMockData()) {
      return of(this.mockLogs).pipe(delay(400));
    }

    const config = this.endpointConfig.getConfig('Logs');
    if (!config || !config.url) return of([]);

    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    const options = { ...this.getHttpOptions(config), params };

    return this.http.get<IntegrationLog[]>(config.url, options).pipe(
      map(logs => logs.map(l => {
        // Normalización: Determinar si es error basado en el mensaje si el backend no lo marca
        const msg = l.vchMessage ? l.vchMessage.toLowerCase() : '';
        const isError = l.isError || msg.includes('not match') || msg.includes('error') || msg.includes('"success":false');
        return { ...l, isError };
      })),
      catchError(err => {
         console.error('API Error (Logs):', err);
         return of([]);
      })
    );
  }

  /** Vincula un item de orden DMS a un código de catálogo BYD */
  linkOrderItem(daltonCode: string, bydCode: string, bydType: 'Labor' | 'Repair', description: string): Observable<boolean> {
    if(this.useMockData()) {
        // Actualizar estado en memoria para que la UI refleje el cambio
        this.mockOrders.forEach(order => {
           order.items.forEach(item => {
              if (item.code === daltonCode) {
                 item.isLinked = true;
                 item.linkedBydCode = bydCode;
                 item.linkedBydDescription = description;
              }
           });
        });
        return of(true).pipe(delay(500));
    }
    
    const config = this.endpointConfig.getConfig('Vincular');
    if (!config || !config.url) return of(false);

    const payload = {
        daltonCode, bydCode, bydType, description,
        dealerCode: this.selectedDealerCode()
    };
    return this.http.post<boolean>(config.url, payload, this.getHttpOptions(config)).pipe(
      catchError(() => of(false))
    );
  }

  /** Transmite la orden completa a Planta (API Externa) */
  transmitOrderToPlant(order: ServiceOrder): Observable<boolean> {
     if(this.useMockData()) {
       // Actualizar estado local
       const mOrder = this.mockOrders.find(o => o.id === order.id);
       if(mOrder) mOrder.status = 'Transmitted';
       
       // Agregar log simulado de éxito
       this.mockLogs.unshift({
         id: crypto.randomUUID(),
         vchOrdenServicio: order.orderNumber,
         vchLog: 'MOCK-SUCCESS',
         dtmcreated: new Date().toISOString(),
         txtDataJson: JSON.stringify({ vin: order.vin }),
         vchMessage: '{"success":true, "message":"Simulated Transmission OK"}',
         VIN: order.vin,
         labourcode: 'N/A',
         Cod_TpAut: order.modelCodeRaw,
         Desc_TpAut: order.modelDescRaw,
         isError: false
       });

       return of(true).pipe(delay(1500));
     }

     const config = this.endpointConfig.getConfig('Transmitir');
     if (!config || !config.url) return of(false);
     
     // Construir payload según especificación de planta
     const payload = {
        vin: order.vin,
        dealerCode: this.selectedDealerCode(),
        orderRef: order.orderNumber,
        items: order.items.filter(i => i.isLinked).map(i => ({
           type: 'Labor', // Simplificado
           code: i.linkedBydCode,
           description: i.linkedBydDescription || i.description
        }))
     };

     return this.http.post<boolean>(config.url, payload, this.getHttpOptions(config)).pipe(
        catchError(() => of(false))
     );
  }

  /** Ejecuta inserción masiva dinámica (usado para carga de Excel) */
  executeDynamicInsert(payload: any): Observable<boolean> {
    if (this.useMockData()) {
      return of(true).pipe(delay(2000));
    }
    const config = this.endpointConfig.getConfig('Carga') || this.endpointConfig.getConfig('Insertar');
    if (!config || !config.url) return of(false);
    
    return this.http.post<boolean>(config.url, payload, this.getHttpOptions(config)).pipe(
      catchError(() => of(false))
    );
  }
}
