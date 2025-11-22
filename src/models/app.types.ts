
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
 * NUEVO: Tipo de Documento en Dalton (DMS)
 */
export interface DaltonDocType {
  code: string;       // Ej: 'P', 'G', 'I'
  description: string;// Ej: 'Preventivo', 'Garantía', 'Interno'
  dealerCode: string;
}

/**
 * NUEVO: Tipo de Documento en Planta (BYD)
 */
export interface PlantDocType {
  code: string;       // Ej: 'OR', 'WAR', 'PDI'
  description: string;// Ej: 'Other Repair', 'Warranty Claim'
}

/**
 * NUEVO: Mapeo de Equivalencia entre Dalton y Planta
 */
export interface OrderTypeMapping {
  daltonCode: string; // PK
  plantCode: string;  // FK to PlantDocType
  dealerCode: string;
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
 * NUEVO: Regla de Clasificación Automática.
 * Permite asignar metadatos (Categoría, Icono, Prioridad) basados en palabras clave.
 */
export interface ClassificationRule {
  id: string;
  keyword: string;        // Palabra a buscar (ej. "BALATAS", "ACEITE")
  category: string;       // Categoría asignada (ej. "FRENOS")
  icon: string;           // Icono FontAwesome (ej. "fa-circle-stop")
  priority: 'High' | 'Normal' | 'Low'; 
  colorClass: string;     // Color visual para la UI
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
  
  // Metadatos calculados en tiempo real por reglas
  detectedCategory?: string;
  detectedIcon?: string;
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
 * Estructura de respuesta para el endpoint de Agrupación Masiva (Batch).
 */
export interface ModelGroup {
  groupId: string; // Llave compuesta: MODELO + AÑO (ej. "SONG PLUS|2025")
  modelName: string;
  year: string;
  count: number;
  items: ModelGroupItem[];
}

export interface ModelGroupItem {
  orderId: string;
  orderNumber: string;
  vin: string;
  item: ServiceOrderItem;
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
 * Payload para transmisión a planta.
 */
export interface TransmissionPayload {
  header: {
    dealerCode: string;
    roNumber: string;
    vin: string;
    repairDate: string;
    modelCode: string;
  };
  laborList: {
    lineId: number;
    operationCode: string; // BYD Code
    internalCode: string;  // Dalton Code
    description: string;
    hours: number;
  }[];
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
 * Configuración de Endpoints Dinámicos (Multi-Entorno).
 * Permite definir BasePaths separados para Prod, QA, Dev y Local.
 */
export interface EndpointConfiguration {
  id: string;
  name: string;        // vchNombre
  description: string; // vchDescripcion
  
  // Entornos
  basePathProd: string;
  basePathQa: string;
  basePathDev: string;
  basePathLocal: string;
  resource: string;     // vchResource (ej. /dealers)
  
  // Seguridad
  apiKeyProd?: string;
  apiKeyQa?: string;
  headerKey: string;    // vchHeaderKey (ej. X-API-Key)
  headers?: string;     // Headers adicionales en formato JSON string
  
  // Configuración Frontend
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  targetTable?: string; 
  jsonStructure: string; 
  isActive: boolean;
  lastModified: string;
  
  // Propiedad calculada en runtime (no se guarda en DB)
  computedUrl?: string; 
  apiKey?: string;      // API Key resuelta para el entorno actual
}

/** Notificación tipo Toast para la UI */
export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}
