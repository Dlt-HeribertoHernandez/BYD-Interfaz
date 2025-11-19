
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { MappingItem, AiSuggestion } from '../models/app.types';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async analyzeDataIntegrity(data: MappingItem[]): Promise<string> {
    if (!process.env.API_KEY) return "API Key no configurada.";

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
   * Suggests potential BYD mappings for a given Dalton item description.
   * Uses historical mappings as context/experience (Few-Shot Learning).
   */
  async suggestMapping(
    daltonDescription: string, 
    daltonCode: string, 
    history: MappingItem[]
  ): Promise<AiSuggestion[]> {
    if (!process.env.API_KEY) return [];

    // Prepare Context (Top 30 most relevant or recent items to save tokens)
    // In a real app, we would use vector search here. 
    // For now, we just pass a sample of existing valid mappings as "Experience".
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
      1. Analiza la 'Base de Conocimiento' para encontrar patrones similares (ej. palabras clave como 'Batería', 'Freno', 'Servicio').
      2. Si encuentras algo similar, sugiere ese código o uno derivado.
      3. Si no hay similitud, usa tu conocimiento general de códigos BYD (formatos L-XXXX para Labor, R-XXXX para Repair) para inventar una sugerencia plausible o genérica.
      4. Genera exactamente 3 sugerencias.
      
      Retorna JSON estricto.
    `;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, description: "The suggested BYD code" },
          type: { type: Type.STRING, enum: ["Labor", "Repair"], description: "The operation type" },
          reasoning: { type: Type.STRING, description: "Very short explanation (e.g. 'Matches historical pattern for Brakes')" },
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
          temperature: 0.4 // Low temperature for more deterministic/analytical results
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
