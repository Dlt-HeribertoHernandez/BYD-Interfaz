
export interface MappingItem {
  id: string;
  bydCode: string; // 'Repair item code'
  bydType: 'Labor' | 'Repair';
  daltonCode: string; // 'Claim labor hour code' or mapped manually
  description?: string; // 'Repair item name'
  
  // New Fields from Excel
  vehicleModel?: string; // 'Vehicle code'
  vehicleSeries?: string; // 'Name of project Vehicle Series'
  mainCategory?: string; // 'Main category name'
  subCategory?: string; // 'Secondary classification name'
  standardHours?: number; // 'Standard labor hours'
  dispatchHours?: number; // 'Dispatch labor hours'
  isBatteryRepair?: boolean; // 'Battery pack repair or not'
  modelYear?: string; // Placeholder for year filtering

  status: 'Pending' | 'Linked' | 'Error';
  confidence?: number;
}

export type OrderStatus = 'Pending' | 'Transmitted' | 'In Process' | 'Rejected' | 'Completed';

export interface ServiceOrderItem {
  code: string; // Cod_Art
  description: string; // Computed or joined description
  quantity: number; // CtdArt_DDor
  unitPrice?: number; // PrecLst_DDor
  total?: number; // SubTot_DOri
  isLinked: boolean;
  linkedBydCode?: string;
}

export interface ServiceOrder {
  id: string; // Internal ID
  // Dalton Keys
  branchCode: string; // Cod_Sucu (Now mapped to dealerCode)
  docType: string; // TpDoc_DOri
  orderNumber: string; // FolDoc_DOri
  
  date: string; // FDoc_DOri
  customerCode: string; // Cod_Cte
  customerName: string; // Resolved name
  vin: string; // NumSer_Vehi
  
  totalAmount: number; // ImpTot_DOri
  
  status: OrderStatus; // Mapped from StatDoc_DOri
  rawStatusChar?: string; // The original 'R', 'F', etc.

  items: ServiceOrderItem[];
  logs: OrderLog[];
}

export interface OrderLog {
  timestamp: string;
  message: string;
  status: OrderStatus;
}

// --- AI Types ---
export interface AiSuggestion {
  code: string;
  type: 'Labor' | 'Repair';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

// --- Dealer Context Support ---

export interface Dealer {
  intID: number;
  dealerCode: string; // e.g. MEX022429
  dealerName: string; // e.g. BYD Carretera 57-Dalton
  appId: string;
  dealerKey: string;
  vchRepairStoreCode: string;
}

// --- Config Module Types ---

export interface EndpointConfiguration {
  id: string;
  name: string;        // e.g., "Insertar Modelos BYD"
  description: string; // e.g., "Proceso de carga masiva de catálogo"
  url: string;         // e.g., "/api/dynamic-insert"
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  targetTable?: string; // e.g., "[dbo].[BYDModelosDMS]"
  
  // Auth & Headers
  apiKey?: string;
  headers?: string; // JSON string representing key-value pairs
  
  // The JSON Template structure (stringified)
  jsonStructure: string; 
  
  isActive: boolean;
  lastModified: string;
}
