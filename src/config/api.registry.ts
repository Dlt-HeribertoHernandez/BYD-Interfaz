
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
  // NUEVOS ENDPOINTS PARA MAPEO DE TIPOS DE ORDEN
  {
    name: 'Tipos Dalton',
    resource: '/order-types/dalton',
    method: 'GET',
    description: 'Obtiene los tipos de documento activos en el DMS por agencia.',
    jsonStructure: '{}'
  },
  {
    name: 'Tipos Planta',
    resource: '/order-types/plant',
    method: 'GET',
    description: 'Obtiene el catálogo oficial de tipos de orden de Planta (BYD).',
    jsonStructure: '{}'
  },
  {
    name: 'Guardar Mapeo Tipos',
    resource: '/order-types/mapping',
    method: 'POST',
    description: 'Guarda la configuración de equivalencias entre Dalton y Planta.',
    jsonStructure: '{\n  "dealerCode": "...",\n  "mappings": [\n    { "daltonCode": "P", "plantCode": "OR" }\n  ]\n}'
  },
  {
    name: 'Obtener Mapeo Tipos',
    resource: '/order-types/mapping',
    method: 'GET',
    description: 'Recupera la configuración actual de equivalencias.',
    jsonStructure: '{}'
  }
];
