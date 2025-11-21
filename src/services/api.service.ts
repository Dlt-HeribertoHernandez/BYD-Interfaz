
import { Injectable, signal, inject, effect } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { delay, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MappingItem, ServiceOrder, Dealer, EndpointConfiguration, IntegrationLog, TransmissionPayload } from '../models/app.types';
import { EndpointConfigService } from './endpoint-config.service';

/**
 * ApiService (Infrastructure Layer)
 * ---------------------------------
 * Servicio central de comunicación HTTP.
 * Actúa como un Gateway agnóstico que decide si usar datos simulados (Mock) 
 * o datos reales basados en la configuración de Endpoints dinámicos.
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
    // SONG PLUS DM-I
    { id: '1', bydCode: 'WSA3HAC02101GH00', bydType: 'Labor', daltonCode: '19897094-00', status: 'Linked', description: 'Mantenimiento 10,000 KM Song Plus', vehicleSeries: 'SONG PLUS DMI', vehicleModel: 'SONG PLUS DMI', mainCategory: 'Mantenimiento', standardHours: 1.2 },
    { id: '2', bydCode: 'WSA3HRF00501GH00', bydType: 'Repair', daltonCode: '10500005-00', status: 'Linked', description: 'Reemplazo Balatas Delanteras', vehicleSeries: 'SONG PLUS DMI', vehicleModel: 'SONG PLUS DMI', mainCategory: 'Frenos', standardHours: 0.8 },
    { id: '3', bydCode: 'WSA3-DIAG-001', bydType: 'Labor', daltonCode: 'DIAG-01', status: 'Linked', description: 'Diagnóstico Sistema Híbrido', vehicleSeries: 'SONG PLUS DMI', vehicleModel: 'SONG PLUS DMI', mainCategory: 'Motor', standardHours: 2.0 },
    
    // DOLPHIN / DOLPHIN MINI
    { id: '4', bydCode: 'DOL-MAINT-20K', bydType: 'Labor', daltonCode: 'M-20K', status: 'Linked', description: 'Servicio 20,000 KM Dolphin', vehicleSeries: 'DOLPHIN', vehicleModel: 'DOLPHIN', mainCategory: 'Mantenimiento', standardHours: 1.5 },
    { id: '5', bydCode: 'DOL-MINI-WIPER', bydType: 'Labor', daltonCode: 'WIP-01', status: 'Linked', description: 'Cambio Plumillas Limpiaparabrisas', vehicleSeries: 'DOLPHIN MINI', vehicleModel: 'DOLPHIN MINI', mainCategory: 'Carrocería', standardHours: 0.3 },
    { id: '6', bydCode: 'DOL-ELEC-CHK', bydType: 'Labor', daltonCode: 'E-CHK', status: 'Linked', description: 'Revisión Sistema Alto Voltaje', vehicleSeries: 'DOLPHIN', vehicleModel: 'DOLPHIN', mainCategory: 'Eléctrico', standardHours: 1.0 },

    // SEAL
    { id: '7', bydCode: 'SEAL-ALIGN-01', bydType: 'Labor', daltonCode: 'ALI-01', status: 'Linked', description: 'Alineación y Balanceo 4 Ruedas', vehicleSeries: 'SEAL', vehicleModel: 'SEAL', mainCategory: 'Suspensión', standardHours: 1.8 },
    { id: '8', bydCode: 'SEAL-UPD-SOFT', bydType: 'Labor', daltonCode: 'SW-UPD', status: 'Linked', description: 'Actualización Software OTA Manual', vehicleSeries: 'SEAL', vehicleModel: 'SEAL', mainCategory: 'Eléctrico', standardHours: 0.5 },

    // GENERIC / OTHERS
    { id: '9', bydCode: 'SHARK_LAB_01', bydType: 'Labor', daltonCode: 'S_LAB_01', status: 'Pending', description: 'Shark Battery Replace', vehicleSeries: 'SHARK', vehicleModel: 'SHARK', mainCategory: 'Motor' },
    { id: '10', bydCode: 'HAN-BRK-RR', bydType: 'Labor', daltonCode: 'BRK-RR', status: 'Linked', description: 'Reemplazo Pastillas Traseras Han', vehicleSeries: 'HAN EV', vehicleModel: 'HAN EV', mainCategory: 'Frenos', standardHours: 1.0 },
    { id: '11', bydCode: 'TANG-AC-SERV', bydType: 'Labor', daltonCode: 'AC-01', status: 'Linked', description: 'Mantenimiento A/C Tang', vehicleSeries: 'TANG', vehicleModel: 'TANG', mainCategory: 'Mantenimiento', standardHours: 1.1 }
  ];

  private mockOrders: ServiceOrder[] = [
    // GRUPO 1: SONG PLUS 2025 (Varios items pendientes para probar Batch)
    {
      id: '435', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00435', date: '2025-11-12', 
      customerCode: '9003', customerName: 'DE LA MORA GUTIERREZ ANDRES', vin: 'LGXC74C48S0147557', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BC DM-I AT DELAN BLACK', year: '2025',
      totalAmount: 1795.22, status: 'Pending', 
      items: [
          { code: '15407199-00', description: 'IPC MEMORY CARD_EVA007KG-IC-M1-BYD', quantity: 2, total: 847.60, isLinked: false },
          { code: 'MO006', description: 'CONFIGURACION DE TARJETAS NFC PARA CARGADOR', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    },
    {
      id: '432', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00432', date: '2025-11-12', 
      customerCode: '4418', customerName: 'RAMIREZ OROZCO BENJAMIN', vin: 'LGXC74C42S0023462', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BL DM-I AT EMPEROR RED', year: '2025',
      totalAmount: 812.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'REVISION DE RUIDO EN SUSPENSION TRASERA', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    },
    {
      id: '430', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00430', date: '2025-11-11', 
      customerCode: '5521', customerName: 'PEREZ LOPEZ JUAN', vin: 'LGXC74C42S0029988', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BL DM-I AT GREY', year: '2025',
      totalAmount: 2100.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'SERVICIO DE MANTENIMIENTO 10,000 KMS', quantity: 1, total: 1800.00, isLinked: false },
          { code: 'FIL-ACE', description: 'FILTRO DE ACEITE', quantity: 1, total: 300.00, isLinked: false }
      ], 
      logs: []
    },

    // GRUPO 2: DOLPHIN MINI 2024 (Grupo distinto para probar agrupación)
    {
      id: '434', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00434', date: '2025-11-12', 
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
      id: '429', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00429', date: '2025-11-11', 
      customerCode: '1122', customerName: 'GOMEZ MARIA', vin: 'LGXCE4CC2S0065511', 
      modelCodeRaw: 'DOLPHIN25', modelDescRaw: 'DOLPHIN MINI 2025 BL EV ROSE', year: '2025',
      totalAmount: 500.00, status: 'Pending', 
      items: [
          { code: 'MO006', description: 'REVISION DE PLUMILLAS LIMPIAPARABRISAS', quantity: 0.5, total: 500.00, isLinked: false }
      ], 
      logs: []
    },

    // GRUPO 3: SEAL (Unidad única)
    {
      id: '428', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00428', date: '2025-11-10', 
      customerCode: '8899', customerName: 'LUIS FERNANDO TORRES', vin: 'LPE19W2A0SF091122', 
      modelCodeRaw: 'SEAL24', modelDescRaw: 'SEAL 2024 AWD PERFORMANCE BLACK', year: '2024',
      totalAmount: 1200.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'ACTUALIZACION DE SOFTWARE SISTEMA INFOENTRETENIMIENTO', quantity: 1.5, total: 1200.00, isLinked: false }
      ], 
      logs: []
    },

    // GRUPO 4: SHARK (Híbrido)
    {
      id: '433', branchCode: 'MEX022429', docType: 'OR', orderNumber: 'XCL00433', date: '2025-11-12', 
      customerCode: '3088', customerName: 'RAMIREZ AMADOR FAUSTO ALONSO', vin: 'LPE19W2A0SF095657', 
      modelCodeRaw: 'SHARK25', modelDescRaw: 'SHARK 2025 BL PLUG IN HIBRIDO DM-O GS AT VERDE BOREAL', year: '2025',
      totalAmount: 812.00, status: 'In Process', 
      items: [
          { code: 'MO006', description: 'UNIDAD INGRESA A TALLER POR TESTIGO DE CHECK ENGINE QUE APARECE OCASIONALMENTE', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: []
    }
  ];

  private mockLogs: IntegrationLog[] = [
    { id: '1', vchOrdenServicio: 'XCL00435', vchLog: '1 -> 190802', dtmcreated: new Date().toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":false,"message":"Warranty activation date for VIN mismatch"}', VIN: 'LGXC74C48S0147557', labourcode: 'WSA3HAC02101GH00', Cod_TpAut: 'SOPL25BY', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true },
    { id: '2', vchOrdenServicio: 'XCL00434', vchLog: '1 -> 190586', dtmcreated: new Date().toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"OK"}', VIN: 'LGXCE4CC2S0064848', labourcode: 'WSATJ00101GH00', Cod_TpAut: 'DOLPHIN25', Desc_TpAut: 'DOLPHIN MINI', isError: false },
    { id: '3', vchOrdenServicio: 'XCL00430', vchLog: '1 -> 190599', dtmcreated: new Date(Date.now() - 86400000).toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":false,"message":"Invalid Labor Code"}', VIN: 'LGXC74C42S0029988', labourcode: 'UNK-001', Cod_TpAut: 'SOPL25BY', Desc_TpAut: 'SONG PLUS', isError: true },
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
        // Use the configured header key (default to x-api-key)
        const keyName = config.headerKey || 'x-api-key';
        if (!headers.has('Authorization') && !headers.has(keyName)) {
             headers = headers.set(keyName, config.apiKey);
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
    // Validación robusta: Asegurar que existe la URL calculada
    if (!config || !config.computedUrl) return of([]);
    
    const requestUrl = config.computedUrl;

    return this.http.get<Partial<Dealer>[]>(requestUrl, this.getHttpOptions(config)).pipe(
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
    if (!config || !config.computedUrl) return of([]);
    
    const requestUrl = config.computedUrl;

    return this.http.get<MappingItem[]>(requestUrl, this.getHttpOptions(config)).pipe(
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
    if (!config || !config.computedUrl) throw new Error("URL de Mappings no configurada");
    
    const requestUrl = config.computedUrl;

    return this.http.post<MappingItem>(requestUrl, item, this.getHttpOptions(config));
  }

  /** Elimina un mapping existente */
  deleteMapping(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockMappings = this.mockMappings.filter(m => m.id !== id);
      return of(true).pipe(delay(300));
    }
    
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.computedUrl) return of(false);
    
    const requestUrl = `${config.computedUrl}/${id}`;

    return this.http.delete<boolean>(requestUrl, this.getHttpOptions(config)).pipe(
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
    if (!config || !config.computedUrl) return of([]);
    
    const requestUrl = config.computedUrl;

    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('dealerCode', targetDealer);

    const options = { ...this.getHttpOptions(config), params };

    return this.http.get<ServiceOrder[]>(requestUrl, options).pipe(
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
  getMappingUsageHistory(bydCode: string): Observable<{orderRef: string, date: string, description: string, vin: string}[]> {
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
    const config = this.endpointConfig.getConfig('Historial Uso');
    if (!config || !config.computedUrl) return of([]);
    
    const requestUrl = config.computedUrl;
    const params = new HttpParams().set('bydCode', bydCode);
    const options = { ...this.getHttpOptions(config), params };

    return this.http.get<any[]>(requestUrl, options).pipe(
      catchError(() => of([]))
    );
  }

  /** Obtiene logs de integración del sistema */
  getIntegrationLogs(startDate?: string, endDate?: string): Observable<IntegrationLog[]> {
    if (this.useMockData()) {
      return of(this.mockLogs).pipe(delay(400));
    }

    const config = this.endpointConfig.getConfig('Obtener Logs') || this.endpointConfig.getConfig('Logs');
    if (!config || !config.computedUrl) return of([]);
    
    const requestUrl = config.computedUrl;

    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    const options = { ...this.getHttpOptions(config), params };

    return this.http.get<IntegrationLog[]>(requestUrl, options).pipe(
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

  /** Vincula un item de orden DMS a un código de catálogo BYD (Individual) */
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
    if (!config || !config.computedUrl) return of(false);
    
    const requestUrl = config.computedUrl;

    const payload = {
        daltonCode, bydCode, bydType, description,
        dealerCode: this.selectedDealerCode()
    };
    return this.http.post<boolean>(requestUrl, payload, this.getHttpOptions(config)).pipe(
      catchError(() => of(false))
    );
  }

  /**
   * Vincula múltiples ítems en una sola petición HTTP.
   * Mejora drástica de rendimiento y consistencia transaccional.
   */
  linkOrderItemsBatch(items: { daltonCode: string, description: string }[], bydCode: string, bydType: 'Labor' | 'Repair'): Observable<boolean> {
    if(this.useMockData()) {
      this.mockOrders.forEach(order => {
         order.items.forEach(item => {
            // Verificar si el item está en la lista de batch
            const inBatch = items.some(i => i.daltonCode === item.code);
            if (inBatch) {
               item.isLinked = true;
               item.linkedBydCode = bydCode;
               item.linkedBydDescription = "Batch Linked"; // Simplified desc for mock
            }
         });
      });
      return of(true).pipe(delay(800));
    }

    // Estrategia de URL: Preferir endpoint dedicado 'Vincular Batch', 
    // sino fallback inteligente reemplazando el path del endpoint 'Vincular' simple.
    let config = this.endpointConfig.getConfig('Vincular Batch');
    let requestUrl = config?.computedUrl;

    if (!requestUrl) {
       // Fallback: Intentar derivar URL del endpoint simple
       const simpleConfig = this.endpointConfig.getConfig('Vincular');
       if (simpleConfig?.computedUrl) {
           requestUrl = simpleConfig.computedUrl.replace('/link', '/link-batch');
           config = simpleConfig; // Usar headers/key del simple
       }
    }
    
    if (!requestUrl || !config) return of(false);

    const payload = {
       items: items.map(i => ({ daltonCode: i.daltonCode, description: i.description })),
       targetBydCode: bydCode,
       targetBydType: bydType,
       dealerCode: this.selectedDealerCode()
    };

    return this.http.post<boolean>(requestUrl, payload, this.getHttpOptions(config)).pipe(
       catchError(() => of(false))
    );
  }

  /**
   * Construye el payload JSON estandarizado que se enviará a la planta.
   * Separado de la transmisión para permitir previsualización en UI.
   */
  buildTransmissionPayload(order: ServiceOrder): TransmissionPayload {
    const linkedItems = order.items.filter(i => i.isLinked);
    
    return {
      header: {
        dealerCode: this.selectedDealerCode(),
        roNumber: order.orderNumber,
        vin: order.vin,
        repairDate: order.date,
        modelCode: order.modelCodeRaw
      },
      laborList: linkedItems.map((item, index) => ({
        lineId: index + 1,
        operationCode: item.linkedBydCode || '',
        internalCode: item.code,
        description: item.linkedBydDescription || item.description,
        hours: 1.0 // TODO: Mapear horas reales si existen
      }))
    };
  }

  /** Transmite la orden completa a Planta (API Externa) */
  transmitOrderToPlant(payload: TransmissionPayload): Observable<boolean> {
     if(this.useMockData()) {
       // Simulación de éxito tras delay
       const mOrder = this.mockOrders.find(o => o.orderNumber === payload.header.roNumber);
       if(mOrder) mOrder.status = 'Transmitted';
       return of(true).pipe(delay(2000));
     }

     const config = this.endpointConfig.getConfig('Transmitir');
     if (!config || !config.computedUrl) return of(false);
     
     const requestUrl = config.computedUrl;
     
     return this.http.post<boolean>(requestUrl, payload, this.getHttpOptions(config)).pipe(
        catchError(() => of(false))
     );
  }

  /**
   * Crea un registro de log oficial después de una transmisión (Exitosa o Fallida).
   * En modo Demo, inserta en el array local.
   */
  createIntegrationLog(payload: TransmissionPayload, responseMessage: string, isSuccess: boolean): Observable<boolean> {
     if (this.useMockData()) {
       this.mockLogs.unshift({
         id: crypto.randomUUID(),
         vchOrdenServicio: payload.header.roNumber,
         vchLog: `LOG-${Math.floor(Math.random() * 1000)}`,
         dtmcreated: new Date().toISOString(),
         txtDataJson: JSON.stringify(payload),
         vchMessage: responseMessage,
         VIN: payload.header.vin,
         labourcode: payload.laborList[0]?.operationCode || 'N/A',
         Cod_TpAut: payload.header.modelCode,
         Desc_TpAut: '',
         isError: !isSuccess
       });
       return of(true).pipe(delay(800)); // Delay simulado de escritura en BD
     }

     const config = this.endpointConfig.getConfig('Registrar Log') || this.endpointConfig.getConfig('Log');
     if (!config || !config.computedUrl) return of(false);

     const requestUrl = config.computedUrl;

     const logEntry = {
        vchOrdenServicio: payload.header.roNumber,
        txtDataJson: JSON.stringify(payload),
        vchMessage: responseMessage,
        vin: payload.header.vin,
        isError: !isSuccess,
        dealerCode: this.selectedDealerCode()
     };

     return this.http.post<boolean>(requestUrl, logEntry, this.getHttpOptions(config)).pipe(
        catchError(() => of(false))
     );
  }

  /** Ejecuta inserción masiva dinámica (usado para carga de Excel) */
  executeDynamicInsert(payload: any): Observable<boolean> {
    if (this.useMockData()) {
      return of(true).pipe(delay(2000));
    }
    const config = this.endpointConfig.getConfig('Carga') || this.endpointConfig.getConfig('Insertar');
    if (!config || !config.computedUrl) return of(false);
    
    const requestUrl = config.computedUrl;
    
    return this.http.post<boolean>(requestUrl, payload, this.getHttpOptions(config)).pipe(
      catchError(() => of(false))
    );
  }
}
