
import { Injectable, signal, computed } from '@angular/core';
import { BusinessRule } from '../models/app.types';

/**
 * Servicio de Reglas de Negocio.
 * Centraliza la lógica de transformación y filtrado de datos.
 * Permite cambiar comportamientos (ej. cómo se calculan códigos) en tiempo de ejecución.
 */
@Injectable({
  providedIn: 'root'
})
export class BusinessRulesService {

  // Estado inicial de reglas. 
  // "default-mirror" es la regla estándar donde el código no sufre cambios.
  private rulesSignal = signal<BusinessRule[]>([
    {
      id: 'default-mirror',
      name: 'Estándar (Espejo)',
      description: 'El código Dalton será idéntico al código BYD.',
      isActive: true,
      strategy: 'MIRROR',
      placeholderCodes: ['MO006', 'MO-GEN'], // Códigos comodín por defecto
      defaultCategory: 'Labor',
      defaultHours: 0
    },
    {
      id: 'fixed-mo006',
      name: 'Campaña MO006',
      description: 'Todos los ítems cargados se asignarán al código MO006.',
      isActive: false,
      strategy: 'FIXED',
      fixedValue: 'MO006',
      placeholderCodes: ['MO006'],
      defaultCategory: 'Labor',
      defaultHours: 0
    }
  ]);

  readonly rules = this.rulesSignal.asReadonly();

  // Regla activa calculada (siempre debe haber una)
  readonly activeRule = computed(() => {
    return this.rulesSignal().find(r => r.isActive) || this.rulesSignal()[0];
  });

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
    if (this.rulesSignal().length <= 1) return; // Prevenir borrar la última regla
    this.rulesSignal.update(list => list.filter(r => r.id !== id));
    
    // Asegurar que queda una activa
    if (!this.rulesSignal().some(r => r.isActive)) {
       this.rulesSignal.update(list => {
         if (list.length > 0) list[0].isActive = true;
         return [...list];
       });
    }
  }

  /**
   * Verifica si un código específico (proveniente de una orden) es considerado
   * un "Placeholder" o Comodín (ej. MO006).
   * Estos códigos REQUIEREN vinculación manual obligatoria.
   */
  isPlaceholderCode(code: string): boolean {
    const active = this.activeRule();
    if (!active || !active.placeholderCodes) return false;
    return active.placeholderCodes.includes(code);
  }

  /**
   * Determina si un ítem de la orden debe mostrarse en la interfaz principal.
   * Lógica: 
   * - Si la regla activa tiene `placeholderCodes` definidos, SOLO muestra esos ítems.
   * - Esto filtra refacciones, aceites y otros conceptos que no son Mano de Obra (Labor).
   * - Si no hay códigos definidos, muestra todo.
   */
  isItemRelevant(code: string): boolean {
    const active = this.activeRule();
    if (!active) return true;
    
    if (!active.placeholderCodes || active.placeholderCodes.length === 0) {
      return true;
    }

    // Comparación estricta (trimming incluido)
    return active.placeholderCodes.some(p => p.trim() === code.trim());
  }

  /**
   * Calcula el código interno (Dalton) basado en el código de fábrica (BYD)
   * y la estrategia de la regla activa.
   */
  calculateDaltonCode(bydCode: string, rule: BusinessRule): string {
    switch(rule.strategy) {
      case 'FIXED': return rule.fixedValue || 'MO006';
      case 'PREFIX': return (rule.prefixValue || '') + bydCode;
      case 'MIRROR': 
      default: return bydCode;
    }
  }
}
