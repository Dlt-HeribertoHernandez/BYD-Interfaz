
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
   * Analiza una muestra de datos cargados para detectar problemas de calidad.
   * Usa el modelo 'gemini-2.5-flash' para velocidad y bajo costo.
   */
  async analyzeDataIntegrity(data: MappingItem[]): Promise<string> {
    if (!process.env.API_KEY) return "API Key no configurada.";

    // Tomamos solo una muestra pequeña para no exceder límites de tokens
    const sample = data.slice(0, 20).map(item => 
      `BYD: ${item.bydCode} (${item.bydType}) <-> Dalton: ${item.daltonCode}`
    ).join('\n');

    const prompt = `
      Actúa como un auditor de calidad de datos para una planta automotriz.
      Analiza la siguiente muestra de vinculaciones de códigos entre el sistema BYD y Daltonsoft.
      
      Datos (Muestra):
      ${sample}
      
      Por favor, proporciona un breve resumen en texto plano (máximo 3 oraciones) sobre:
      1. La consistencia del formato de los códigos.
      2. Si detectas alguna anomalía obvia (ej. códigos vacíos o formatos mezclados).
      3. Una recomendación rápida.
      
      Responde en Español, tono profesional y conciso.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Gemini Error:', error);
      return "No se pudo completar el análisis de IA en este momento.";
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
   * Se le pasa un historial de mapeos correctos para que la IA aprenda el patrón.
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
      
      Instrucciones:
      1. Analiza la 'Base de Conocimiento' para encontrar patrones similares.
      2. Si encuentras algo similar, sugiere ese código o uno derivado.
      3. Si no hay similitud, usa tu conocimiento general de códigos BYD.
      4. Genera exactamente 3 sugerencias.
      
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
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.4 
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
