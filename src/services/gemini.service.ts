
import { Injectable, signal, inject } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { MappingItem, AiSuggestion } from '../models/app.types';
import { NotificationService } from './notification.service';

/**
 * Servicio de Inteligencia Artificial (Google Gemini).
 * Se encarga de las tareas cognitivas: traducción técnica, análisis de anomalías
 * y sugerencia de mapeos difusos.
 */
@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private notification = inject(NotificationService);
  private ai: GoogleGenAI | null = null;

  // Señal pública para que los componentes sepan si la IA está lista para usarse
  isAvailable = signal<boolean>(false);

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    let apiKey = '';
    
    // Protección contra ReferenceError si process no está definido en el entorno
    try {
      apiKey = process.env.API_KEY || '';
    } catch (e) {
      console.warn('[GeminiService] No se pudo acceder a las variables de entorno.');
    }

    // Validación básica de configuración
    if (!apiKey || apiKey.length < 10 || apiKey.includes('YOUR_API_KEY')) {
      console.warn('[GeminiService] API Key no detectada o inválida. Las funciones de IA estarán deshabilitadas.');
      this.isAvailable.set(false);
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey: apiKey });
      this.isAvailable.set(true);
    } catch (err) {
      console.error('[GeminiService] Error inicializando cliente:', err);
      this.isAvailable.set(false);
    }
  }

  /**
   * Helper para notificar al usuario/desarrollador si falta configuración
   */
  private checkAvailability(): boolean {
    if (!this.isAvailable() || !this.ai) {
      this.notification.show(
        '⚠️ IA No Configurada: Falta "API_KEY" en variables de entorno.', 
        'warning', 
        6000
      );
      return false;
    }
    return true;
  }

  /**
   * NUEVO: Enriquecimiento Masivo.
   * Toma un lote de items crudos y devuelve versiones mejoradas.
   */
  async enrichCatalogBatch(items: MappingItem[]): Promise<{ id: string, cleanDescription: string, category: string, tags: string[] }[]> {
    if (!this.checkAvailability()) return [];

    // Limitamos el contexto para evitar errores de payload grande (Top 20 items a la vez recomendado)
    const batch = items.slice(0, 25).map(item => ({
      id: item.id,
      code: item.bydCode,
      desc: item.description
    }));

    const prompt = `
      Actúa como un Gerente de Servicio de Taller Automotriz experto.
      Tu tarea es LIMPIAR y CATEGORIZAR un catálogo de operaciones de taller.
      
      Input Data (JSON):
      ${JSON.stringify(batch)}

      Reglas de Transformación:
      1. 'cleanDescription': Reescribe la descripción técnica (que puede estar en inglés técnico, abreviada o mezclada) a un ESPAÑOL claro y comercial, listo para imprimirse en la factura del cliente. Ej: "RPL BRK PAD" -> "Reemplazo de Balatas Delanteras".
      2. 'category': Clasifica el ítem en una de estas categorías: [Mantenimiento, Motor, Suspensión, Frenos, Eléctrico, Carrocería, Transmisión, Accesorios, General].
      3. 'tags': Array de 3 palabras clave para búsqueda rápida.

      Output esperado: JSON Array estricto con la estructura solicitada.
    `;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          cleanDescription: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Mantenimiento", "Motor", "Suspensión", "Frenos", "Eléctrico", "Carrocería", "Transmisión", "Accesorios", "General"] },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["id", "cleanDescription", "category", "tags"]
      }
    };

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const jsonText = response.text;
      if (!jsonText) return [];
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Gemini Enrichment Error:', error);
      this.notification.show('Error de conexión con Gemini API.', 'error');
      return [];
    }
  }

  /**
   * Traduce una descripción técnica a palabras clave.
   */
  async translateToKeywords(text: string): Promise<{ translation: string; keywords: string[] }> {
    if (!this.checkAvailability()) return { translation: '', keywords: [] };

    const prompt = `
      You are an expert automotive translator and parts specialist.
      Task: 
      1. Translate the following Service Description from Spanish to Technical English.
      2. Extract a broad list of 15 to 20 keywords/tags to help find this item in a master catalog.
      
      Input Description: "${text}"
      
      Return JSON format:
      {
        "translation": "The English translation",
        "keywords": ["Keyword1", "Keyword2", "Keyword3", ...]
      }
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        translation: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["translation", "keywords"]
    };

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const jsonText = response.text;
      if (!jsonText) return { translation: '', keywords: [] };
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Gemini Translation Error:', error);
      return { translation: '', keywords: [] };
    }
  }

  /**
   * Sugiere mapeos potenciales utilizando "Few-Shot Learning".
   */
  async suggestMapping(
    daltonDescription: string, 
    daltonCode: string, 
    history: MappingItem[]
  ): Promise<AiSuggestion[]> {
    if (!this.checkAvailability()) return [];

    // Contexto: Enviamos ejemplos exitosos previos
    const contextSample = history
      .filter(h => h.status === 'Linked')
      .slice(0, 30)
      .map(h => `{"desc": "${h.description}", "byd": "${h.bydCode}", "type": "${h.bydType}"}`)
      .join(',\n');

    const prompt = `
      Eres un experto en ingeniería de servicios automotrices BYD. 
      Tu tarea es sugerir códigos de operación (Labor/Repair) para un ítem no vinculado.
      
      Ítem a Vincular:
      - Código Interno: ${daltonCode}
      - Descripción: "${daltonDescription}"
      
      Base de Conocimiento (Experiencia Previa):
      [
        ${contextSample}
      ]
      
      INSTRUCCIONES:
      1. **Búsqueda de Patrones**: Analiza la 'Base de Conocimiento'. Si hay algo idéntico, úsalo como base.
      2. **Manejo de Ambigüedad**: Si la descripción es VAGA (ej. "Revisión", "Ruido"), sugiere un código genérico y marca confianza "Low".
      3. **Preferencia de Tipo**: Si no menciona explícitamente "Cambio" o "Reemplazo", asume 'Labor'.
      4. **Formato**: Genera hasta 3 sugerencias.
      
      Retorna JSON estricto.
    `;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Labor", "Repair"] },
          reasoning: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
        },
        required: ["code", "type", "reasoning", "confidence"]
      }
    };

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.3
        }
      });

      const jsonText = response.text;
      if (!jsonText) return [];
      
      return JSON.parse(jsonText) as AiSuggestion[];
    } catch (error) {
      console.error('Gemini Suggestion Error:', error);
      return [];
    }
  }
}
