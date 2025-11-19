
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { delay, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MappingItem, ServiceOrder, Dealer } from '../models/app.types';

// Helper for dynamic dates in Mock Data
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
  
  // Configuration
  private readonly API_URL = 'https://api.daltonsoft-integration.com/api'; 

  // Global switch for Mock Data
  useMockData = signal<boolean>(true);

  // --- CONTEXT STATE (Global) ---
  // The currently selected dealer code (replacing region/branch)
  selectedDealerCode = signal<string>(''); 

  toggleMockData() {
    this.useMockData.update(v => !v);
  }

  // --- DEALERS MOCK DATA (Based on SQL Screenshot) ---
  private mockDealers: Dealer[] = [
    { intID: 1, dealerCode: 'MEX022429', dealerName: 'BYD Carretera 57-Dalton', appId: '791565418', dealerKey: '24f5bbb9f9ab8237...', vchRepairStoreCode: 'MEX022429RS0001' },
    { intID: 2, dealerCode: 'MEX022310', dealerName: 'BYD Lopez Mateos-Dalton', appId: '791565389', dealerKey: '8b7bac7279744628...', vchRepairStoreCode: 'MEX022310RS0001' },
    { intID: 3, dealerCode: 'MEX022311', dealerName: 'BYD Lomas-Dalton', appId: '791565390', dealerKey: 'd3665f9b3311cbb7...', vchRepairStoreCode: 'MEX022311RS0001' },
    { intID: 4, dealerCode: 'MEX022430', dealerName: 'BYD Mariano Escobedo-Dalton', appId: '791565391', dealerKey: '0e63261d33722d5c...', vchRepairStoreCode: 'MEX022430RS0001' },
    { intID: 5, dealerCode: 'MEX022203', dealerName: 'BYD Country-Dalton', appId: '791565388', dealerKey: '8af5ab167a63c467...', vchRepairStoreCode: 'MEX022203RS0001' }
  ];

  // --- MAPPINGS MOCK DATA ---
  private mockMappings: MappingItem[] = [
    { id: '1', bydCode: 'L-99201', bydType: 'Labor', daltonCode: '19897094-00', status: 'Linked', description: 'Reemplazo Batería HV' },
    { id: '2', bydCode: 'R-10203', bydType: 'Repair', daltonCode: '10500005-00', status: 'Linked', description: 'Ajuste Suspensión Delantera' }
  ];

  // --- ORDERS MOCK DATA ---
  private mockOrders: ServiceOrder[] = [
    {
      id: '101',
      branchCode: 'MEX022429', // Carretera 57
      docType: 'OS',
      orderNumber: 'P0002901', 
      date: getOffsetDate(0), 
      customerCode: '7119',
      customerName: 'JUAN PEREZ (Demo)',
      vin: 'LGXC74C42S0065615',
      totalAmount: 4977.87, 
      status: 'Pending',
      rawStatusChar: 'R',
      items: [
        { code: '19897094-00', description: 'BATERIA HV MODULE', quantity: 3.7, unitPrice: 400.00, total: 1480.00, isLinked: true, linkedBydCode: 'L-99201' },
        { code: 'M0006', description: 'MANO DE OBRA GRAL', quantity: 1.6, unitPrice: 700.00, total: 1120.00, isLinked: false },
        { code: '10500005-00', description: 'TORNILLO ESTABILIZADOR', quantity: 1.0, unitPrice: 38.82, total: 38.82, isLinked: true, linkedBydCode: 'R-10203' }
      ],
      logs: [
        { timestamp: `${getOffsetDate(0)}T09:00:00`, message: 'Documento creado (Stat: R) en Sucursal MEX022429', status: 'Pending' }
      ]
    },
    {
      id: '102',
      branchCode: 'MEX022429', // Carretera 57
      docType: 'OS',
      orderNumber: 'P0002905',
      date: getOffsetDate(0),
      customerCode: '8821',
      customerName: 'TRANSPORTE LOGISTICO SA',
      vin: 'BYDHANEV999888',
      totalAmount: 12500.50,
      status: 'Transmitted',
      items: [
        { code: '12633693-00', description: 'SENSOR ABS TRASERO', quantity: 2, unitPrice: 299.24, total: 598.48, isLinked: false }
      ],
      logs: [
        { timestamp: `${getOffsetDate(0)}T10:00:00`, message: 'Documento Creado', status: 'Pending' },
        { timestamp: `${getOffsetDate(0)}T10:05:00`, message: 'Enviado a API BYD Exitosamente', status: 'Transmitted' }
      ]
    },
    {
      id: '103',
      branchCode: 'MEX022310', // Lopez Mateos
      docType: 'OS',
      orderNumber: 'G005102',
      date: getOffsetDate(-1),
      customerCode: '5501',
      customerName: 'MARIA GONZALEZ',
      vin: 'BYDYUAN000777',
      totalAmount: 850.00,
      status: 'Rejected',
      items: [
         { code: 'ERR-999', description: 'ITEM DESCONOCIDO', quantity: 1, total: 0, isLinked: false }
      ],
      logs: [
        { timestamp: `${getOffsetDate(-1)}T14:00:00`, message: 'Error: VIN no encontrado en base de datos BYD', status: 'Rejected' }
      ]
    },
    {
      id: '104',
      branchCode: 'MEX022203', // Country
      docType: 'OS',
      orderNumber: 'M900100',
      date: getOffsetDate(0),
      customerCode: '3301',
      customerName: 'NORTE MOTORS',
      vin: 'BYDSEAL000111',
      totalAmount: 5200.00,
      status: 'In Process',
      items: [],
      logs: []
    }
  ];

  // --- CATALOG METHODS ---

  getDealers(): Observable<Dealer[]> {
    if(this.useMockData()) return of(this.mockDealers);
    
    return this.http.get<Dealer[]>(`${this.API_URL}/dealers`).pipe(
      catchError(err => {
        console.warn('API Error (Dealers) - Returning empty list:', err);
        return of([]);
      })
    );
  }

  // --- ENDPOINTS ---

  // GET Mappings
  getMappings(): Observable<MappingItem[]> {
    if (this.useMockData()) {
      return of([...this.mockMappings]).pipe(delay(500));
    }
    return this.http.get<MappingItem[]>(`${this.API_URL}/mappings`).pipe(
      catchError(err => {
        console.warn('API Error (Mappings) - Returning empty list:', err);
        return of([]);
      })
    );
  }

  // POST Mapping
  createMapping(item: MappingItem): Observable<MappingItem> {
    if (this.useMockData()) {
      this.mockMappings.unshift(item);
      return of(item).pipe(delay(300));
    }
    return this.http.post<MappingItem>(`${this.API_URL}/mappings`, item).pipe(
      catchError(err => {
         console.error('API Error (Create Mapping):', err);
         throw err; 
      })
    );
  }

  // DELETE Mapping
  deleteMapping(id: string): Observable<boolean> {
    if (this.useMockData()) {
      this.mockMappings = this.mockMappings.filter(m => m.id !== id);
      return of(true).pipe(delay(300));
    }
    return this.http.delete<boolean>(`${this.API_URL}/mappings/${id}`).pipe(
       catchError(err => {
         console.error('API Error (Delete Mapping):', err);
         return of(false); 
      })
    );
  }

  // GET Orders (with filters)
  getOrders(startDate: string, endDate: string, dealerCode?: string): Observable<ServiceOrder[]> {
    // Use provided branch or fallback to global state
    const targetDealer = dealerCode || this.selectedDealerCode();

    if (this.useMockData()) {
      // Filter by Date AND Dealer
      const filtered = this.mockOrders.filter(o => 
        o.date >= startDate && 
        o.date <= endDate && 
        o.branchCode === targetDealer // Match on dealerCode
      );
      
      return of(filtered).pipe(delay(600));
    }
    
    // Real API call with filters
    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('dealerCode', targetDealer);

    return this.http.get<ServiceOrder[]>(`${this.API_URL}/orders`, { params }).pipe(
      catchError(err => {
        console.warn('API Error (Orders) - Returning empty list:', err);
        return of([]);
      })
    );
  }

  // POST Link Order Item
  linkOrderItem(daltonCode: string, bydCode: string, bydType: 'Labor' | 'Repair', description: string): Observable<boolean> {
    const payload = {
        daltonCode,
        bydCode,
        bydType,
        description,
        dealerCode: this.selectedDealerCode() // Context
    };

    if(this.useMockData()) {
        const newMapping: MappingItem = {
            id: crypto.randomUUID(),
            daltonCode,
            bydCode,
            bydType,
            description,
            status: 'Linked'
        };
        return this.createMapping(newMapping).pipe(delay(100)) as any;
    }

    return this.http.post<boolean>(`${this.API_URL}/mappings/link-from-order`, payload).pipe(
      catchError(err => {
        console.error('API Error (Link Order):', err);
        return of(false);
      })
    );
  }

  // GENERIC DYNAMIC INSERT
  executeDynamicInsert(payload: any): Observable<boolean> {
    if (this.useMockData()) {
      console.log("MOCK API: Executing Dynamic Insert with JSON:", JSON.stringify(payload, null, 2));
      // Simulate network latency for animation
      return of(true).pipe(delay(2500));
    }

    return this.http.post<boolean>(`${this.API_URL}/dynamic-insert`, payload).pipe(
      catchError(err => {
        console.error('API Error (Dynamic Insert):', err);
        return of(false);
      })
    );
  }
}
