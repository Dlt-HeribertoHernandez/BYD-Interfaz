
/**
 * API REGISTRY
 * -------------------------------------------------------------------------
 * Este archivo centraliza toda la configuración de endpoints de la aplicación.
 * 
 * PARA EL DESARROLLADOR:
 * 1. Configure los 'BASE_PATHS' según su entorno local.
 * 2. Verifique que los 'ENDPOINTS' coincidan con los controladores de su API.
 * -------------------------------------------------------------------------
 */

import { EndpointConfiguration } from '../models/app.types';

// 1. CONFIGURACIÓN DE ENTORNOS BASE
// Define las URLs raíz para cada ambiente.
export const BASE_PATHS = {
  PROD:  'https://apimgmt.dalton.com.mx/apilabourequivalencias',
  QA:    'https://dlt-qa-apimanagement.azure-api.net/apilabourequivalencias',
  DEV:   'https://dev-api.daltonsoft.com/v1',
  LOCAL: 'http://localhost:5000' 
};

// 2. DEFINICIÓN DE ENDPOINTS
// Lista maestra de recursos. Se usa para generar la configuración inicial.
export const API_REGISTRY: Partial<EndpointConfiguration>[] = [
  // --- AUTHENTICATION ---
  {
    name: 'Auth Login',
    resource: '/auth/login',
    method: 'POST',
    description: 'Autenticación de usuario. Retorna Token JWT.',
    jsonStructure: '{\n  "email": "user@dalton.com",\n  "password": "..."\n}'
  },
  {
    name: 'Carga Catálogo BYD',
    resource: '/dynamic-insert',
    method: 'POST',
    description: 'Inserta modelos y labor codes en la tabla maestra.',
    jsonStructure: '{}'
  },
  {
    name: 'Vincular Batch',
    resource: '/link-batch',
    method: 'POST',
    description: 'Endpoint optimizado para vinculación masiva de órdenes.',
    jsonStructure: '{\n  "items": [],\n  "targetBydCode": "..."\n}'
  },
  {
    name: 'Vincular',
    resource: '/link',
    method: 'POST',
    description: 'Endpoint para vinculación individual (Fallback).',
    jsonStructure: '{}'
  },
  {
    name: 'Obtener Órdenes',
    resource: '/orders',
    method: 'GET',
    description: 'Obtiene lista plana de órdenes de servicio.',
    jsonStructure: '{}'
  },
  {
    name: 'Grupos Pendientes',
    resource: '/pending-groups',
    method: 'GET',
    description: 'Obtiene ítems agrupados por modelo para asignación masiva.',
    jsonStructure: '{}'
  },
  {
    name: 'Crear Agencia',
    resource: '/dealers',
    method: 'POST',
    description: 'Registra un nueva agencia (Dealer) en el sistema.',
    jsonStructure: '{\n  "dealerCode": "MEX0...",\n  "dealerName": "BYD...",\n  "appId": "...",\n  "dealerKey": "..."\n}'
  },
  {
    name: 'Dealers',
    resource: '/dealers',
    method: 'GET',
    description: 'Obtiene el catálogo de agencias disponibles.',
    jsonStructure: '{}'
  },
  {
    name: 'Mappings',
    resource: '/mappings',
    method: 'GET',
    description: 'Obtiene el catálogo maestro de códigos BYD/Dalton.',
    jsonStructure: '{}'
  },
  {
    name: 'Transmitir',
    resource: '/transmit',
    method: 'POST',
    description: 'Envía la orden procesada a la API de Fábrica.',
    jsonStructure: '{}'
  },
  {
    name: 'Registrar Log',
    resource: '/integration-logs',
    method: 'POST',
    description: 'Guarda el resultado de la transmisión.',
    jsonStructure: '{}'
  },
  {
    name: 'Obtener Logs',
    resource: '/integration-logs',
    method: 'GET',
    description: 'Consulta historial de transmisiones.',
    jsonStructure: '{}'
  },
  // NUEVOS ENDPOINTS PARA LA MATRIZ DE JERARQUIA (Nivel 1, 2, 3 y Reglas)
  {
    name: 'BYD Order Types',
    resource: '/catalogs/byd-order-types',
    method: 'GET',
    description: 'Nivel 1: Tipos de Orden Principales (Repair, Claim).',
    jsonStructure: '{}'
  },
  {
    name: 'BYD Repair Types',
    resource: '/catalogs/byd-repair-types',
    method: 'GET',
    description: 'Nivel 2: Subtipos de Reparación (CGBY, YBWXW).',
    jsonStructure: '{}'
  },
  {
    name: 'BYD Service Details',
    resource: '/catalogs/byd-service-details',
    method: 'GET',
    description: 'Nivel 3: Detalle de Servicios y Labour Codes.',
    jsonStructure: '{}'
  },
  // CATÁLOGOS DALTON (Nivel 4 Inputs)
  {
    name: 'Dalton Folios',
    resource: '/catalogs/dalton-folios',
    method: 'GET',
    description: 'Catálogo de Prefijos de Orden (OR, P, G).',
    jsonStructure: '{}'
  },
  {
    name: 'Dalton Concepts',
    resource: '/catalogs/dalton-concepts',
    method: 'GET',
    description: 'Catálogo de Conceptos Internos (Kilometrado, Hojalatería).',
    jsonStructure: '{}'
  },
  {
    name: 'Equivalence Rules',
    resource: '/mappings/equivalence-rules',
    method: 'GET',
    description: 'Nivel 4: Matriz final de equivalencias Dalton -> BYD.',
    jsonStructure: '{}'
  },
  {
    name: 'Crear Regla Equivalencia',
    resource: '/mappings/equivalence-rules',
    method: 'POST',
    description: 'Guarda una nueva regla de mapeo.',
    jsonStructure: '{}'
  },
  {
    name: 'Eliminar Regla Equivalencia',
    resource: '/mappings/equivalence-rules',
    method: 'DELETE',
    description: 'Elimina una regla de mapeo.',
    jsonStructure: '{}'
  },
  // DASHBOARD
  {
    name: 'Dashboard Stats',
    resource: '/dashboard/stats',
    method: 'GET',
    description: 'Obtiene KPIs y series de tiempo para gráficos.',
    jsonStructure: '{}'
  }
];
