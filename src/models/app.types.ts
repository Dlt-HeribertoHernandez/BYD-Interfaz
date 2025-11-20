
/**
 * Definición principal de tipos para la aplicación.
 * Se utiliza TypeScript estricto para garantizar la integridad de los datos
 * a través de toda la aplicación.
 */

/**
 * Representa un ítem en el catálogo maestro de mapeo (Excel cargado).
 * Vincula un código BYD (Fábrica) con un código interno Dalton (DMS).
 */
export interface MappingItem {
  id: string;
  /** Código proporcionado por BYD (ej. 'Repair item code') */
  bydCode: string;
  /** Tipo de operación definido por fábrica */
  bydType: 'Labor' | 'Repair';
  /** Código interno en el DMS (ej. 'Claim labor hour code') o mapeado manual */
  daltonCode: string;
  /** Descripción o nombre de la operación */
  description?: string;
  
  // Campos adicionales provenientes de la carga masiva (Excel)
  vehicleModel?: string;  // 'Vehicle code' ej. 'SONG PLUS DMI'
  vehicleSeries?: string; // 'Name of project Vehicle Series'
  mainCategory?: string;  // Categoría principal para filtros
  subCategory?: string;   // Clasificación secundaria
  standardHours?: number; // Horas estándar de labor
  dispatchHours?: number; // Horas despacho
  isBatteryRepair?: boolean; // Bandera para reparaciones de alto voltaje
  modelYear?: string;     // Año modelo para filtrado preciso

  /** Estado de la vinculación en el sistema */
  status: 'Pending' | 'Linked' | 'Error';
  /** Nivel de confianza si fue sugerido por IA (0-100) */
  confidence?: number;
}

/** Estados posibles de una Orden de Servicio */
export type OrderStatus = 'Pending' | 'Transmitted' | 'In Process' | 'Rejected' | 'Completed' | 'Error';

/**
 * Configuración de Estrategia para Tipos de Orden.
 * Define cómo se comporta la UI/UX para diferentes tipos de documentos del DMS.
 */
export interface OrderTypeConfig {
  code: string;       // El DocType crudo del DMS (ej. 'OS', 'WAR', 'INT')
  label: string;      // Nombre visual para el usuario
  icon: string;       // Clase de icono FontAwesome
  colorClass: string; // Clase base de color Tailwind (ej. 'blue', 'purple')
  rules: {
    allowLinking: boolean;      // ¿Permite vincular items manualmente?
    autoProcessing: boolean;    // ¿Puede procesarse automáticamente?
    requiresApproval: boolean;  // ¿Requiere aprobación gerencial?
    visibleInList: boolean;     // ¿Se muestra en la lista principal?
  };
}

/**
 * Regla de Negocio para la importación y transformación de datos.
 */
export interface BusinessRule {
  id: string;
  name: string;         // ej. "Carga General" o "Campaña MO006"
  description?: string;
  isActive: boolean;    // Solo una regla activa a la vez se recomienda
  
  // Estrategia para calcular el Dalton Code a partir del BYD Code
  strategy: 'MIRROR' | 'FIXED' | 'PREFIX'; 
  fixedValue?: string;  // Usado si strategy === 'FIXED' (ej. "MO006")
  prefixValue?: string; // Usado si strategy === 'PREFIX' (ej. "BYD-")
  
  // Códigos Comodín (Placeholder Codes)
  // Son códigos genéricos del DMS (ej. MO006) que requieren desglose manual obligatoriamente.
  placeholderCodes: string[]; 
  
  // Valores por defecto
  defaultCategory: string;
  defaultHours: number;
}

/**
 * Item individual dentro de una Orden de Servicio.
 */
export interface ServiceOrderItem {
  code: string; // Cod_Art (DMS)
  description: string; // Descripción calculada o concatenada
  quantity: number; // CtdArt_DDor
  unitPrice?: number; // PrecLst_DDor
  total?: number; // SubTot_DOri
  
  /** Indica si este ítem ya fue vinculado a un código de fábrica */
  isLinked: boolean;
  linkedBydCode?: string;
  linkedBydDescription?: string; // Descripción oficial de planta guardada al vincular
}

/**
 * Representa una Orden de Servicio completa (Encabezado + Detalle).
 */
export interface ServiceOrder {
  id: string; // ID Interno o UUID
  
  // Llaves y Referencias DMS
  branchCode: string; // Cod_Sucu (Mapeado a dealerCode)
  docType: string;    // TpDoc_DOri (Coincide con OrderTypeConfig.code)
  orderNumber: string;// FolDoc_DOri (ej. XCL00435)
  
  date: string;       // Fecha Documento
  customerCode: string; 
  customerName: string; 
  vin: string;        // NumSer_Vehi (Critico para garantías)
  modelCodeRaw: string; // Código Modelo DMS
  modelDescRaw: string; // Descripción Modelo DMS
  year: string; 
  
  totalAmount: number; 
  
  status: OrderStatus; 
  rawStatusChar?: string; // Estado crudo de la BD si aplica

  items: ServiceOrderItem[];
  logs: OrderLog[]; // Historial de errores/eventos locales
}

/** Log ligero dentro de la orden */
export interface OrderLog {
  timestamp: string;
  message: string;
  status: OrderStatus;
}

/**
 * Log de Integración (Tabla LogIntegracion).
 * Registra intentos de comunicación con la API de Fábrica/Planta.
 */
export interface IntegrationLog {
  id: string;
  vchOrdenServicio: string; // XCL00435
  vchLog: string;           // ID correlativo externo
  dtmcreated: string;       // Fecha creación
  txtDataJson: string;      // Payload JSON enviado
  vchMessage: string;       // Respuesta del servidor (ej. error messages)
  VIN: string; 
  labourcode: string; 
  Cod_TpAut: string; 
  Desc_TpAut: string; 
  isError: boolean;         // Flag calculado basado en vchMessage
}

/**
 * Respuesta de sugerencia de la IA (Gemini).
 */
export interface AiSuggestion {
  code: string;
  type: 'Labor' | 'Repair';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
  vehicleSeriesMatch?: string;
}

/**
 * Contexto de la Agencia (Dealer).
 */
export interface Dealer {
  intID: number;
  dealerCode: string; // ej. MEX022429
  dealerName: string; // ej. BYD Carretera 57-Dalton
  appId: string;
  dealerKey: string;
  vchRepairStoreCode: string;
}

/**
 * Configuración de Endpoints Dinámicos.
 * Permite cambiar URLs y estructuras JSON sin recompilar.
 */
export interface EndpointConfiguration {
  id: string;
  name: string;        
  description: string; 
  url: string;         
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  targetTable?: string; 
  
  // Autenticación y Cabeceras
  apiKey?: string;
  headers?: string; 
  
  // Plantilla de Estructura JSON (Stringified)
  jsonStructure: string; 
  
  isActive: boolean;
  lastModified: string;
}

/** Notificación tipo Toast para la UI */
export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}
