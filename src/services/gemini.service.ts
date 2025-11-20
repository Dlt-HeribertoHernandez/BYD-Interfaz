
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { MappingItem, AiSuggestion } from '../models/app.types';

/**
 * Servicio de Inteligencia Artificial (Google Gemini).
 * Se encarga de las tareas cognitivas: traducción técnica, análisis de anomalías
 * y sugerencia de mapeos difusos.
 */
@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // Se asume que process.env.API_KEY está inyectado por el entorno de compilación
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * NUEVO: Enriquecimiento Masivo.
   * Toma un lote de items crudos y devuelve versiones mejoradas.
   * 1. Estandariza descripciones a Español comercial.
   * 2. Asigna categorías automáticas.
   */
  async enrichCatalogBatch(items: MappingItem[]): Promise<{ id: string, cleanDescription: string, category: string, tags: string[] }[]> {
    if (!process.env.API_KEY) return [];

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
      const response = await this.ai.models.generateContent({
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
      return [];
    }
  }

  /**
   * Traduce una descripción técnica (generalmente en Español "sucio" del DMS)
   * a Inglés Técnico y extrae palabras clave (Tags) para búsqueda difusa.
   */
  async translateToKeywords(text: string): Promise<{ translation: string; keywords: string[] }> {
    if (!process.env.API_KEY) return { translation: '', keywords: [] };

    const prompt = `
      You are an expert automotive translator and parts specialist.
      Task: 
      1. Translate the following Service Description from Spanish to Technical English.
      2. Extract a broad list of 15 to 20 keywords/tags to help find this item in a master catalog.
      
      CRITICAL RULES FOR KEYWORDS (MAXIMIZE MATCHING POTENTIAL):
      1. **Deconstruct everything**: If "Smart Card", return ["Smart Card", "Card", "Smart"].
      2. **Singular AND Plural**: If "Lights", YOU MUST ALSO include "Light". If "Brakes", include "Brake".
      3. **Synonyms & Verbs**: "Replace" -> ["Replacement", "Changing", "Renew", "Install"].
      4. **Abbreviations**: Include standard automotive acronyms (e.g., "Assembly" -> "Assy", "Right" -> "RH", "Left" -> "LH").
      
      Input Description: "${text}"
      
      Return JSON format:
      {
        "translation": "The English translation",
        "keywords": ["Keyword1", "Keyword2", "Keyword3", ...]
      }
    `;

    // Schema estricto para garantizar que recibimos JSON válido
    const schema = {
      type: Type.OBJECT,
      properties: {
        translation: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["translation", "keywords"]
    };

    try {
      const response = await this.ai.models.generateContent({
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
   * Se mejora la lógica para manejar descripciones genéricas de forma robusta.
   */
  async suggestMapping(
    daltonDescription: string, 
    daltonCode: string, 
    history: MappingItem[]
  ): Promise<AiSuggestion[]> {
    if (!process.env.API_KEY) return [];

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
      
      INSTRUCCIONES CRÍTICAS DE RAZONAMIENTO:
      1. **Búsqueda de Patrones**: Analiza la 'Base de Conocimiento'. Si hay algo idéntico, úsalo como base.
      
      2. **Manejo de Ambigüedad (IMPORTANTE)**: 
         - Si la descripción es VAGA o GENÉRICA (ej. "Revisión", "Ruido", "Servicio", "Diagnóstico", "Check engine") y no hay contexto suficiente:
         - NO inventes un código de parte específica (no adivines frenos si solo dice "Ruido").
         - Sugiere un código genérico administrativo o de diagnóstico (ej. "DIAG_GEN", "MO-GEN", "GENERAL_INSPECTION").
         - Marca la confianza (confidence) como "Low".
         - En el campo 'reasoning', explica claramente: "Descripción insuficiente para determinar código exacto. Se sugiere código genérico."

      3. **Preferencia de Tipo**: Si no menciona explícitamente "Cambio" o "Reemplazo", asume que es 'Labor' (Mano de obra), no 'Repair'.
      
      4. **Formato**: Genera hasta 3 sugerencias.
      
      Retorna JSON estricto bajo el schema proporcionado.
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
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.3 // Bajamos temperatura para ser más conservadores y analíticos
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
