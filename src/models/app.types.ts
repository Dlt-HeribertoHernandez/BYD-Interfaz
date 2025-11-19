
export interface MappingItem {
  id: string;
  bydCode: string; // 'Repair item code'
  bydType: 'Labor' | 'Repair';
  daltonCode: string; // 'Claim labor hour code' or mapped manually
  description?: string; // 'Repair item name'
  
  // New Fields from Excel
  vehicleModel?: string; // 'Vehicle code' e.g., 'SONG PLUS DMI'
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

export type OrderStatus = 'Pending' | 'Transmitted' | 'In Process' | 'Rejected' | 'Completed' | 'Error';

// --- NEW: Business Rule Definitions for Order Types ---
export interface OrderTypeConfig {
  code: string;       // The raw DMS DocType (e.g., 'OS', 'WAR', 'INT')
  label: string;      // Display Name (e.g., 'Repair Order')
  icon: string;       // FontAwesome icon class
  colorClass: string; // Tailwind base color class (e.g., 'blue', 'purple')
  rules: {
    allowLinking: boolean;      // Can user link items manually?
    autoProcessing: boolean;    // Can be auto-processed?
    requiresApproval: boolean;  // Needs manager approval?
    visibleInList: boolean;     // Show in main grid?
  };
}

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
  docType: string; // TpDoc_DOri (Matches OrderTypeConfig.code)
  orderNumber: string; // FolDoc_DOri (e.g., XCL00435)
  
  date: string; // FDoc_DOri
  customerCode: string; // Cod_Cte
  customerName: string; // Resolved name
  vin: string; // NumSer_Vehi (e.g., LGXC74C48S0147557)
  modelCodeRaw: string; // e.g., SOPL25BY
  modelDescRaw: string; // e.g., SONG PLUS 2025 BC DM-I
  year: string; // e.g., 2025
  
  totalAmount: number; // ImpTot_DOri
  
  status: OrderStatus; 
  rawStatusChar?: string;

  items: ServiceOrderItem[];
  logs: OrderLog[];
}

export interface OrderLog {
  timestamp: string;
  message: string;
  status: OrderStatus;
}

// --- Integration Log (New Table) ---
export interface IntegrationLog {
  id: string;
  vchOrdenServicio: string; // XCL00435
  vchLog: string; // 1 -> 190802
  dtmcreated: string; // 19/11/2025
  txtDataJson: string; // JSON payload sent
  vchMessage: string; // "success":true,"message":"labour code and vehicle series not match"
  VIN: string; 
  labourcode: string; // WSA3HAC02101GH00
  Cod_TpAut: string; // SOPL25BD
  Desc_TpAut: string; // SONG PLUS 2025 BL
  isError: boolean; // derived from vchMessage
}

// --- AI Types ---
export interface AiSuggestion {
  code: string;
  type: 'Labor' | 'Repair';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
  vehicleSeriesMatch?: string;
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
  name: string;        
  description: string; 
  url: string;         
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  targetTable?: string; 
  
  // Auth & Headers
  apiKey?: string;
  headers?: string; 
  
  // The JSON Template structure (stringified)
  jsonStructure: string; 
  
  isActive: boolean;
  lastModified: string;
}

// --- UI Types ---
export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}
