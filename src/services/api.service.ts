
import { Injectable, signal, inject, effect } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { delay, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MappingItem, ServiceOrder, Dealer, EndpointConfiguration } from '../models/app.types';
import { EndpointConfigService } from './endpoint-config.service';

function getOffsetDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private endpointConfig = inject(EndpointConfigService);
  
  useMockData = signal<boolean>(true);
  selectedDealerCode = signal<string>(''); 

  constructor() {
    effect(() => {
      const isMock = this.useMockData();
      this.endpointConfig.load(isMock);
    });
  }

  toggleMockData() {
    this.useMockData.update(v => !v);
  }

  // --- MOCK DATA SETS ---
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
    {
      id: '101', branchCode: 'MEX022429', docType: 'OS', orderNumber: 'XCL00435', date: getOffsetDate(0), 
      customerCode: '9003', customerName: 'DE LA MORA GUTIERREZ ANDRES', vin: 'LGXC74C48S0147557', 
      modelCodeRaw: 'SOPL25BY', modelDescRaw: 'SONG PLUS 2025 BC DM-I AT DELAN BLACK', year: '2025',
      totalAmount: 1795.22, status: 'Pending',
      items: [
          { code: '15407199-00', description: 'IPC MEMORY CARD_EVA007KG-IC-M1-BYD', quantity: 2, total: 847.60, isLinked: false },
          { code: 'MO006', description: 'CONFIGURACION DE TARJETAS NFC PARA CARGADOR', quantity: 1, total: 700.00, isLinked: false }
      ], 
      logs: [{ timestamp: new Date().toISOString(), message: 'Error: vehicle series not match', status: 'Error' }]
    }
  ];

  private getHttpOptions(config: EndpointConfiguration) {
    let headers = new HttpHeaders();
    if (config.headers) {
      try {
        const parsed = JSON.parse(config.headers);
        for (const key in parsed) {
          headers = headers.set(key, parsed[key]);
        }
      } catch (e) {
        console.warn(`Invalid headers JSON for config: ${config.name}`);
      }
    }
    if (config.apiKey) {
        if (!headers.has('Authorization') && !headers.has('x-api-key') && !headers.has('X-API-Key')) {
             headers = headers.set('x-api-key', config.apiKey);
        }
    }
    return { headers };
  }

  // --- API METHODS ---

  getDealers(): Observable<Dealer[]> {
    if(this.useMockData()) return of(this.mockDealers);
    const config = this.endpointConfig.getConfig('Dealers');
    if (!config || !config.url) return of([]);
    const options = this.getHttpOptions(config);

    return this.http.get<Partial<Dealer>[]>(config.url, options).pipe(
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
      catchError(err => {
        console.error('API Error (Dealers):', err);
        return of([]);
      })
    );
  }

  getMappings(): Observable<MappingItem[]> {
    if (this.useMockData()) return of([...this.mockMappings]).pipe(delay(500));
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.url) return of([]);
    return this.http.get<MappingItem[]>(config.url, this.getHttpOptions(config)).pipe(
      catchError(() => of([]))
    );
  }

  createMapping(item: MappingItem): Observable<MappingItem> {
    if (this.useMockData()) {
      this.mockMappings.unshift(item);
      return of(item).pipe(delay(300));
    }
    const config = this.endpointConfig.getConfig('Mappings') || this.endpointConfig.getConfig('Carga');
    if (!config || !config.url) throw new Error("No Mappings URL configured");
    return this.http.post<MappingItem>(config.url, item, this.getHttpOptions(config));
  }

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

  getOrders(startDate: string, endDate: string, dealerCode?: string): Observable<ServiceOrder[]> {
    const targetDealer = dealerCode || this.selectedDealerCode();

    if (this.useMockData()) {
      return of(this.mockOrders.filter(o => o.branchCode === targetDealer)).pipe(delay(600));
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

  linkOrderItem(daltonCode: string, bydCode: string, bydType: 'Labor' | 'Repair', description: string): Observable<boolean> {
    if(this.useMockData()) {
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
