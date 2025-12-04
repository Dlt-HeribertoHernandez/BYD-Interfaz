
import { Injectable, signal, inject, effect } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { delay, of, Observable } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { MappingItem, ServiceOrder, Dealer, EndpointConfiguration, IntegrationLog, TransmissionPayload, ModelGroup, BydOrderType, BydRepairType, BydServiceDetail, EquivalenceRule, DaltonFolioType, DaltonServiceConcept, DashboardStats, TimeSeriesPoint } from '../models/app.types';
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
  ];

  private mockLogs: IntegrationLog[] = [
    { id: '1', vchOrdenServicio: 'XCL00435', vchLog: '1 -> 190802', dtmcreated: new Date().toISOString(), txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":false,"message":"Warranty activation date for VIN mismatch"}', VIN: 'LGXC74C48S0147557', labourcode: 'WSA3HAC02101GH00', Cod_TpAut: 'SOPL25BY', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true }
  ];

  // --- Mock Data for New 4-Panel Matrix ---
  private mockBydOrderTypes: BydOrderType[] = [
    { id: 'ot1', code: '22021001', name: 'Repair (Orden de Servicio)' },
    { id: 'ot2', code: '22021002', name: 'Claim (Garantía)' }
  ];

  private mockBydRepairTypes: BydRepairType[] = [
    { id: 'rt1', orderTypeId: 'ot1', code: 'CGBY', name: 'Regular Repair (Pago Cliente)' },
    { id: 'rt2', orderTypeId: 'ot1', code: 'SG', name: 'Accident Repair' },
    { id: 'rt3', orderTypeId: 'ot2', code: 'YBWXW', name: 'Normal Warranty' },
    { id: 'rt4', orderTypeId: 'ot2', code: 'BY', name: 'Maintenance Claim' }
  ];

  private mockBydServiceDetails: BydServiceDetail[] = [
    { id: 'sd1', repairTypeId: 'rt1', description: 'Servicio 10,000 KM', laborCode: 'WST10K-GEN', standardHours: 1.2 },
    { id: 'sd2', repairTypeId: 'rt1', description: 'Servicio 20,000 KM', laborCode: 'WST20K-GEN', standardHours: 1.8 },
    { id: 'sd3', repairTypeId: 'rt3', description: 'Reemplazo Batería 12V', laborCode: 'WAR-BAT-001', standardHours: 0.5 },
    { id: 'sd4', repairTypeId: 'rt3', description: 'Actualización Software', laborCode: 'WAR-SW-002', standardHours: 0.8 }
  ];

  private mockDaltonFolios: DaltonFolioType[] = [
    { id: 'df1', dealerCode: 'MEX022429', prefix: 'P', description: 'Preventivo' },
    { id: 'df2', dealerCode: 'MEX022429', prefix: 'OR', description: 'Orden Reparacion' },
    { id: 'df3', dealerCode: 'MEX022429', prefix: 'XCL', description: 'Folio Taller' }
  ];

  private mockDaltonConcepts: DaltonServiceConcept[] = [
    { id: 'dc1', dealerCode: 'MEX022429', internalClass: 'Kilometrado', description: 'Servicios de Mantenimiento' },
    { id: 'dc2', dealerCode: 'MEX022429', internalClass: 'Hojalateria', description: 'Reparaciones de Carrocería' },
    { id: 'dc3', dealerCode: 'MEX022429', internalClass: 'Garantia', description: 'Reclamaciones a Fábrica' }
  ];

  private mockEquivalenceRules: EquivalenceRule[] = [
    { id: 'rule1', dealerCode: 'MEX022429', daltonPrefix: 'P', internalClass: 'Kilometrado', serviceDetailId: 'sd1', _bydOrderType: 'Repair', _bydRepairType: 'CGBY', _bydLaborCode: 'WST10K-GEN', _description: 'Servicio 10,000 KM' },
    { id: 'rule2', dealerCode: 'MEX022429', daltonPrefix: 'G', internalClass: 'Garantia', serviceDetailId: 'sd3', _bydOrderType: 'Claim', _bydRepairType: 'YBWXW', _bydLaborCode: 'WAR-BAT-001', _description: 'Reemplazo Batería 12V' }
  ];

  // ===========================================================================
  // HELPERS PRIVADOS
  // ===========================================================================

  private getHttpOptions(config: EndpointConfiguration) {
    let headers = new HttpHeaders();
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
    if (config.apiKey) {
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

  getDealers(): Observable<Dealer[]> {
    if(this.useMockData()) return of([...this.mockDealers]);
    const config = this.endpointConfig.getConfig('Dealers');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<Partial<Dealer>[]>(config.computedUrl, this.getHttpOptions(config)).pipe(
      map(response => {
        if (!Array.isArray(response)) return [];
        return response.map((d, i) => ({
          intID: d.intID || (i + 1),
          dealerCode: d.dealerCode || 'UNKNOWN',
          dealerName: d.dealerName || 'Unknown Dealer',
          appId: d.appId || '',
          dealerKey: d.dealerKey || '',
          vchRepairStoreCode: d.vchRepairStoreCode || ''
        } as Dealer));
      }),
      catchError(() => of([]))
    );
  }

  createDealer(dealer: Omit<Dealer, 'intID'>): Observable<boolean> {
    if (this.useMockData()) {
       const newDealer: Dealer = { ...dealer, intID: this.mockDealers.length + 1 };
       this.mockDealers.push(newDealer);
       return of(true).pipe(delay(800));
    }
    const config = this.endpointConfig.getConfig('Crear Agencia') || this.endpointConfig.getConfig('Create Dealer');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, dealer, this.getHttpOptions(config)).pipe(
       catchError(() => of(false))
    );
  }

  getMappings(): Observable<MappingItem[]> {
    if (this.useMockData()) return of([...this.mockMappings]).pipe(delay(500));
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<MappingItem[]>(config.computedUrl, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createMapping(item: MappingItem): Observable<MappingItem> {
    if (this.useMockData()) {
      this.mockMappings.unshift(item);
      return of(item).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.computedUrl) throw new Error("URL de Mappings no configurada");
    return this.http.post<MappingItem>(config.computedUrl, item, this.getHttpOptions(config));
  }

  deleteMapping(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockMappings = this.mockMappings.filter(m => m.id !== id);
      return of(true).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  getOrders(startDate: string, endDate: string, dealerCode?: string): Observable<ServiceOrder[]> {
    const targetDealer = dealerCode || this.selectedDealerCode();
    if (this.useMockData()) return of([...this.mockOrders]).pipe(delay(600));
    const config = this.endpointConfig.getConfig('Obtener Órdenes');
    if (!config || !config.computedUrl) return of([]);
    let params = new HttpParams().set('startDate', startDate).set('endDate', endDate).set('dealerCode', targetDealer);
    return this.http.get<ServiceOrder[]>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(catchError(() => of([])));
  }

  getPendingModelGroups(dealerCode?: string): Observable<ModelGroup[]> {
    const targetDealer = dealerCode || this.selectedDealerCode();
    if (this.useMockData()) {
       const groups = new Map<string, ModelGroup>();
       this.mockOrders.forEach(order => {
         if (order.status === 'Transmitted' || order.status === 'Completed') return;
         const modelName = (order.modelDescRaw || order.modelCodeRaw || 'GENERICO').split(' ')[0] + ' ' + ((order.modelDescRaw || '').split(' ')[1] || ''); 
         const year = order.year || 'N/A';
         const groupId = `${modelName.trim()}|${year}`;
         if (!groups.has(groupId)) {
           groups.set(groupId, { groupId, modelName: modelName.trim(), year, count: 0, items: [] });
         }
         const group = groups.get(groupId)!;
         order.items.forEach(item => {
           if (!item.isLinked) {
              group.items.push({ orderId: order.id, orderNumber: order.orderNumber, vin: order.vin, item: item });
              group.count++;
           }
         });
       });
       const result = Array.from(groups.values()).filter(g => g.count > 0).sort((a, b) => a.groupId.localeCompare(b.groupId));
       return of(result).pipe(delay(700));
    }
    const config = this.endpointConfig.getConfig('Grupos Pendientes') || this.endpointConfig.getConfig('Pending Groups');
    if (!config || !config.computedUrl) return of([]);
    const params = new HttpParams().set('dealerCode', targetDealer);
    return this.http.get<ModelGroup[]>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(catchError(() => of([])));
  }

  getMappingUsageHistory(bydCode: string): Observable<{orderRef: string, date: string, description: string, vin: string}[]> {
    if (this.useMockData()) {
      const history: any[] = [];
      this.mockOrders.forEach(order => {
        order.items.forEach(item => {
           if (item.isLinked && item.linkedBydCode === bydCode) {
             history.push({ orderRef: order.orderNumber, date: order.date, description: item.description, vin: order.vin });
           }
        });
      });
      return of(history).pipe(delay(400));
    }
    const config = this.endpointConfig.getConfig('Historial Uso');
    if (!config || !config.computedUrl) return of([]);
    const params = new HttpParams().set('bydCode', bydCode);
    return this.http.get<any[]>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(catchError(() => of([])));
  }

  getIntegrationLogs(startDate?: string, endDate?: string): Observable<IntegrationLog[]> {
    if (this.useMockData()) return of(this.mockLogs).pipe(delay(400));
    const config = this.endpointConfig.getConfig('Obtener Logs') || this.endpointConfig.getConfig('Logs');
    if (!config || !config.computedUrl) return of([]);
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    return this.http.get<IntegrationLog[]>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(
      map(logs => logs.map(l => {
        const msg = l.vchMessage ? l.vchMessage.toLowerCase() : '';
        const isError = l.isError || msg.includes('not match') || msg.includes('error') || msg.includes('"success":false');
        return { ...l, isError };
      })),
      catchError(() => of([]))
    );
  }

  linkOrderItem(daltonCode: string, bydCode: string, bydType: 'Labor' | 'Repair', description: string): Observable<boolean> {
    if(this.useMockData()) {
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
    const payload = { daltonCode, bydCode, bydType, description, dealerCode: this.selectedDealerCode() };
    return this.http.post<boolean>(config.computedUrl, payload, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  linkOrderItemsBatch(items: { daltonCode: string, description: string }[], bydCode: string, bydType: 'Labor' | 'Repair'): Observable<boolean> {
    if(this.useMockData()) {
      this.mockOrders.forEach(order => {
         order.items.forEach(item => {
            const inBatch = items.some(i => i.daltonCode === item.code);
            if (inBatch) {
               item.isLinked = true;
               item.linkedBydCode = bydCode;
               item.linkedBydDescription = "Batch Linked";
            }
         });
      });
      return of(true).pipe(delay(800));
    }
    let config = this.endpointConfig.getConfig('Vincular Batch');
    if (!config || !config.computedUrl) return of(false);
    const payload = { items: items.map(i => ({ daltonCode: i.daltonCode, description: i.description })), targetBydCode: bydCode, targetBydType: bydType, dealerCode: this.selectedDealerCode() };
    return this.http.post<boolean>(config.computedUrl, payload, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

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
        hours: 1.0
      }))
    };
  }

  transmitOrderToPlant(payload: TransmissionPayload): Observable<boolean> {
     if(this.useMockData()) {
       const mOrder = this.mockOrders.find(o => o.orderNumber === payload.header.roNumber);
       if(mOrder) mOrder.status = 'Transmitted';
       return of(true).pipe(delay(2000));
     }
     const config = this.endpointConfig.getConfig('Transmitir');
     if (!config || !config.computedUrl) return of(false);
     return this.http.post<boolean>(config.computedUrl, payload, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

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
       return of(true).pipe(delay(800));
     }
     const config = this.endpointConfig.getConfig('Registrar Log') || this.endpointConfig.getConfig('Log');
     if (!config || !config.computedUrl) return of(false);
     const logEntry = { vchOrdenServicio: payload.header.roNumber, txtDataJson: JSON.stringify(payload), vchMessage: responseMessage, vin: payload.header.vin, isError: !isSuccess, dealerCode: this.selectedDealerCode() };
     return this.http.post<boolean>(config.computedUrl, logEntry, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  executeDynamicInsert(payload: any): Observable<boolean> {
    if (this.useMockData()) return of(true).pipe(delay(2000));
    const config = this.endpointConfig.getConfig('Carga') || this.endpointConfig.getConfig('Insertar');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, payload, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // ===========================================================================
  // MÉTODOS DE MATRIZ JERÁRQUICA (Nivel 1, 2, 3) - BYD CRUD
  // ===========================================================================

  // --- ORDER TYPES (Nivel 1) ---
  getBydOrderTypes(): Observable<BydOrderType[]> {
    if (this.useMockData()) return of([...this.mockBydOrderTypes]).pipe(delay(200));
    const config = this.endpointConfig.getConfig('BYD Order Types');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<BydOrderType[]>(config.computedUrl, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createBydOrderType(item: Omit<BydOrderType, 'id'>): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydOrderTypes = [...this.mockBydOrderTypes, { ...item, id: crypto.randomUUID() }];
      return of(true).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('BYD Order Types');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, item, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }
  
  deleteBydOrderType(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydOrderTypes = this.mockBydOrderTypes.filter(i => i.id !== id);
      return of(true).pipe(delay(200));
    }
    const config = this.endpointConfig.getConfig('BYD Order Types');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // --- REPAIR TYPES (Nivel 2) ---
  getBydRepairTypes(): Observable<BydRepairType[]> {
    if (this.useMockData()) return of([...this.mockBydRepairTypes]).pipe(delay(300));
    const config = this.endpointConfig.getConfig('BYD Repair Types');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<BydRepairType[]>(config.computedUrl, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createBydRepairType(item: Omit<BydRepairType, 'id'>): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydRepairTypes = [...this.mockBydRepairTypes, { ...item, id: crypto.randomUUID() }];
      return of(true).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('BYD Repair Types');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, item, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }
  
  deleteBydRepairType(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydRepairTypes = this.mockBydRepairTypes.filter(i => i.id !== id);
      return of(true).pipe(delay(200));
    }
    const config = this.endpointConfig.getConfig('BYD Repair Types');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // --- SERVICE DETAILS (Nivel 3) ---
  getBydServiceDetails(): Observable<BydServiceDetail[]> {
    if (this.useMockData()) return of([...this.mockBydServiceDetails]).pipe(delay(400));
    const config = this.endpointConfig.getConfig('BYD Service Details');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<BydServiceDetail[]>(config.computedUrl, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createBydServiceDetail(item: Omit<BydServiceDetail, 'id'>): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydServiceDetails = [...this.mockBydServiceDetails, { ...item, id: crypto.randomUUID() }];
      return of(true).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('BYD Service Details');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, item, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }
  
  deleteBydServiceDetail(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockBydServiceDetails = this.mockBydServiceDetails.filter(i => i.id !== id);
      return of(true).pipe(delay(200));
    }
    const config = this.endpointConfig.getConfig('BYD Service Details');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // ===========================================================================
  // MÉTODOS DE MATRIZ JERÁRQUICA (Nivel 4 - Dalton Catalogs & Equivalences)
  // ===========================================================================

  // --- DALTON FOLIOS (Prefixes) ---
  getDaltonFolios(dealerCode: string): Observable<DaltonFolioType[]> {
    if (this.useMockData()) return of(this.mockDaltonFolios.filter(f => f.dealerCode === dealerCode)).pipe(delay(200));
    const config = this.endpointConfig.getConfig('Dalton Folios');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<DaltonFolioType[]>(`${config.computedUrl}?dealerCode=${dealerCode}`, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createDaltonFolio(item: Omit<DaltonFolioType, 'id'>): Observable<boolean> {
     if (this.useMockData()) {
       this.mockDaltonFolios.push({...item, id: crypto.randomUUID()});
       return of(true).pipe(delay(300));
     }
     const config = this.endpointConfig.getConfig('Dalton Folios');
     if (!config || !config.computedUrl) return of(false);
     return this.http.post<boolean>(config.computedUrl, item, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }
  
  deleteDaltonFolio(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockDaltonFolios = this.mockDaltonFolios.filter(f => f.id !== id);
      return of(true).pipe(delay(200));
    }
    const config = this.endpointConfig.getConfig('Dalton Folios');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // --- DALTON CONCEPTS (Internal Classes) ---
  getDaltonConcepts(dealerCode: string): Observable<DaltonServiceConcept[]> {
    if (this.useMockData()) return of(this.mockDaltonConcepts.filter(c => c.dealerCode === dealerCode)).pipe(delay(200));
    const config = this.endpointConfig.getConfig('Dalton Concepts');
    if (!config || !config.computedUrl) return of([]);
    return this.http.get<DaltonServiceConcept[]>(`${config.computedUrl}?dealerCode=${dealerCode}`, this.getHttpOptions(config)).pipe(catchError(() => of([])));
  }

  createDaltonConcept(item: Omit<DaltonServiceConcept, 'id'>): Observable<boolean> {
     if (this.useMockData()) {
       this.mockDaltonConcepts.push({...item, id: crypto.randomUUID()});
       return of(true).pipe(delay(300));
     }
     const config = this.endpointConfig.getConfig('Dalton Concepts');
     if (!config || !config.computedUrl) return of(false);
     return this.http.post<boolean>(config.computedUrl, item, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  deleteDaltonConcept(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockDaltonConcepts = this.mockDaltonConcepts.filter(c => c.id !== id);
      return of(true).pipe(delay(200));
    }
    const config = this.endpointConfig.getConfig('Dalton Concepts');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // --- EQUIVALENCE RULES ---
  getEquivalenceRules(dealerCode: string): Observable<EquivalenceRule[]> {
    if (this.useMockData()) {
      // Simular join de tablas para la vista
      const populated = this.mockEquivalenceRules.filter(r => r.dealerCode === dealerCode).map(r => {
         const sd = this.mockBydServiceDetails.find(s => s.id === r.serviceDetailId);
         const rt = sd ? this.mockBydRepairTypes.find(t => t.id === sd.repairTypeId) : null;
         const ot = rt ? this.mockBydOrderTypes.find(o => o.id === rt.orderTypeId) : null;
         return {
           ...r,
           _bydOrderType: ot?.name,
           _bydRepairType: rt?.name,
           _bydLaborCode: sd?.laborCode,
           _description: sd?.description
         };
      });
      return of(populated).pipe(delay(500));
    }
    const config = this.endpointConfig.getConfig('Equivalence Rules');
    if (!config || !config.computedUrl) return of([]);
    const params = new HttpParams().set('dealerCode', dealerCode);
    return this.http.get<EquivalenceRule[]>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(catchError(() => of([])));
  }

  createEquivalenceRule(rule: EquivalenceRule): Observable<boolean> {
    if (this.useMockData()) {
      this.mockEquivalenceRules.push({ ...rule, id: crypto.randomUUID() });
      return of(true).pipe(delay(500));
    }
    const config = this.endpointConfig.getConfig('Crear Regla Equivalencia');
    if (!config || !config.computedUrl) return of(false);
    return this.http.post<boolean>(config.computedUrl, rule, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  deleteEquivalenceRule(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockEquivalenceRules = this.mockEquivalenceRules.filter(r => r.id !== id);
      return of(true).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('Eliminar Regla Equivalencia');
    if (!config || !config.computedUrl) return of(false);
    return this.http.delete<boolean>(`${config.computedUrl}/${id}`, this.getHttpOptions(config)).pipe(catchError(() => of(false)));
  }

  // --- DASHBOARD ANALYTICS ---
  getDashboardStats(startDate: string, endDate: string, dealerCode?: string): Observable<DashboardStats> {
    if (this.useMockData()) {
      // Generador de datos aleatorios realistas
      const days = 7;
      const trendSeries: TimeSeriesPoint[] = [];
      let totalSuccess = 0;
      let totalErrors = 0;

      for (let i = days; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        // Random volume
        const dailySuccess = Math.floor(Math.random() * 20) + 5; 
        const dailyError = Math.floor(Math.random() * 5);
        
        totalSuccess += dailySuccess;
        totalErrors += dailyError;
        
        trendSeries.push({ date: dateStr, success: dailySuccess, error: dailyError });
      }

      const totalTransmissions = totalSuccess + totalErrors;
      const successRate = totalTransmissions > 0 ? Math.round((totalSuccess / totalTransmissions) * 100) : 0;

      const mockStats: DashboardStats = {
        kpis: {
          totalTransmissions,
          successRate,
          totalErrors,
          avgResponseTime: Math.floor(Math.random() * 500) + 200 // 200-700ms
        },
        trendSeries,
        errorDistribution: [
          { label: 'VIN Mismatch', count: Math.floor(totalErrors * 0.4) },
          { label: 'Network Timeout', count: Math.floor(totalErrors * 0.2) },
          { label: 'Invalid Schema', count: Math.floor(totalErrors * 0.3) },
          { label: 'Auth Error', count: totalErrors - Math.floor(totalErrors * 0.9) }
        ]
      };
      
      return of(mockStats).pipe(delay(800));
    }

    const config = this.endpointConfig.getConfig('Dashboard Stats');
    if (!config || !config.computedUrl) return of({ kpis: { totalTransmissions: 0, successRate: 0, totalErrors: 0, avgResponseTime: 0 }, trendSeries: [], errorDistribution: [] });
    
    let params = new HttpParams().set('startDate', startDate).set('endDate', endDate);
    if(dealerCode) params = params.set('dealerCode', dealerCode);

    return this.http.get<DashboardStats>(config.computedUrl, { ...this.getHttpOptions(config), params }).pipe(catchError(() => of({ kpis: { totalTransmissions: 0, successRate: 0, totalErrors: 0, avgResponseTime: 0 }, trendSeries: [], errorDistribution: [] })));
  }
}
