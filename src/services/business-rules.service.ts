
import { Injectable, signal, computed } from '@angular/core';
import { BusinessRule, ClassificationRule } from '../models/app.types';

/**
 * BusinessRulesService
 * --------------------
 * Centraliza la lógica de transformación y filtrado de datos.
 * Implementa un patrón de ESTRATEGIA para determinar:
 * 1. Admisión: ¿Qué códigos del DMS son relevantes para BYD?
 * 2. Clasificación: ¿A qué categoría pertenece un ítem basado en su descripción?
 */
@Injectable({
  providedIn: 'root'
})
export class BusinessRulesService {

  // --- REGLAS DE ADMISIÓN (Whitelist Filter) ---
  // Define qué códigos internos (ej. 'MO006') se muestran en la UI.
  private rulesSignal = signal<BusinessRule[]>([
    {
      id: 'default-mirror',
      name: 'Perfil Estándar',
      description: 'Detecta códigos MO006 y Servicios Generales',
      isActive: true,
      strategy: 'MIRROR',
      placeholderCodes: ['MO006', 'MO-GEN', 'ZLAB', 'SERVICIO'],
      defaultCategory: 'Labor',
      defaultHours: 0
    }
  ]);

  // --- REGLAS DE CLASIFICACIÓN (Keyword Dictionary) ---
  // Motor de inferencia simple para etiquetar items automáticamente.
  private classificationRulesSignal = signal<ClassificationRule[]>([
    { id: '1', keyword: 'ACEITE', category: 'Mantenimiento', icon: 'fa-oil-can', priority: 'Normal', colorClass: 'blue' },
    { id: '2', keyword: 'BALATAS', category: 'Frenos', icon: 'fa-circle-stop', priority: 'High', colorClass: 'red' },
    { id: '3', keyword: 'ALINEACION', category: 'Suspensión', icon: 'fa-arrows-alt-h', priority: 'Normal', colorClass: 'orange' },
    { id: '4', keyword: 'PLUMILLAS', category: 'Carrocería', icon: 'fa-wiper', priority: 'Low', colorClass: 'gray' },
    { id: '5', keyword: 'DIAGNOSTICO', category: 'Diagnóstico', icon: 'fa-stethoscope', priority: 'High', colorClass: 'purple' },
    { id: '6', keyword: 'BATERIA', category: 'Eléctrico', icon: 'fa-car-battery', priority: 'High', colorClass: 'yellow' },
  ]);

  readonly rules = this.rulesSignal.asReadonly();
  readonly classificationRules = this.classificationRulesSignal.asReadonly();

  // Regla activa calculada (siempre debe haber una estrategia activa)
  readonly activeRule = computed(() => {
    return this.rulesSignal().find(r => r.isActive) || this.rulesSignal()[0];
  });

  // --- GESTIÓN DE PERFILES DE ADMISIÓN ---

  setActiveRule(id: string) {
    this.rulesSignal.update(list => 
      list.map(r => ({ ...r, isActive: r.id === id }))
    );
  }

  addRule(rule: Omit<BusinessRule, 'id' | 'isActive'>) {
    const newRule: BusinessRule = {
      ...rule,
      id: crypto.randomUUID(),
      isActive: false
    };
    this.rulesSignal.update(list => [...list, newRule]);
  }

  updateRule(id: string, changes: Partial<BusinessRule>) {
    this.rulesSignal.update(list => 
      list.map(r => r.id === id ? { ...r, ...changes } : r)
    );
  }

  deleteRule(id: string) {
    if (this.rulesSignal().length <= 1) return; 
    this.rulesSignal.update(list => list.filter(r => r.id !== id));
    
    // Asegurar que siempre haya una regla activa
    if (!this.rulesSignal().some(r => r.isActive)) {
       this.rulesSignal.update(list => {
         if (list.length > 0) list[0].isActive = true;
         return [...list];
       });
    }
  }

  // --- GESTIÓN DE REGLAS DE CLASIFICACIÓN ---

  addClassificationRule(rule: Omit<ClassificationRule, 'id'>) {
    const newRule = { ...rule, id: crypto.randomUUID() };
    this.classificationRulesSignal.update(list => [newRule, ...list]);
  }

  deleteClassificationRule(id: string) {
    this.classificationRulesSignal.update(list => list.filter(r => r.id !== id));
  }

  // --- LÓGICA DE EVALUACIÓN ---

  /**
   * Verifica si un código específico (proveniente de una orden) es considerado
   * un "Placeholder" o Comodín (ej. MO006) según la estrategia activa.
   */
  isPlaceholderCode(code: string): boolean {
    const active = this.activeRule();
    if (!active || !active.placeholderCodes) return false;
    return active.placeholderCodes.some(p => p.trim().toUpperCase() === code.trim().toUpperCase());
  }

  /**
   * Determina si un ítem de la orden debe mostrarse en la interfaz principal.
   * Actúa como un filtro "Whitelist".
   */
  isItemRelevant(code: string): boolean {
    const active = this.activeRule();
    if (!active) return true;
    
    if (!active.placeholderCodes || active.placeholderCodes.length === 0) {
      return true;
    }
    return active.placeholderCodes.some(p => p.trim().toUpperCase() === code.trim().toUpperCase());
  }

  /**
   * Analiza una descripción y devuelve la mejor clasificación posible
   * basada en las palabras clave definidas por el usuario.
   */
  classifyItem(description: string): { category: string, icon: string, priority: string, colorClass: string } | null {
    const descUpper = description.toUpperCase();
    const rules = this.classificationRulesSignal();

    // Estrategia: First Match Wins
    const match = rules.find(r => descUpper.includes(r.keyword.toUpperCase()));

    if (match) {
      return {
        category: match.category,
        icon: match.icon,
        priority: match.priority,
        colorClass: match.colorClass
      };
    }

    return null; // Sin clasificación detectada
  }
}
