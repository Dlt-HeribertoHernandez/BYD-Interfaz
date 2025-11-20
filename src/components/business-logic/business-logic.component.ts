
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { BusinessRulesService } from '../../services/business-rules.service';
import { BusinessRule } from '../../models/app.types';

/**
 * Componente de administración de Reglas de Negocio.
 * CRUD para definir comportamientos de carga masiva y filtrado de órdenes.
 */
@Component({
  selector: 'app-business-logic',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './business-logic.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessLogicComponent {
  rulesService = inject(BusinessRulesService);
  private fb = inject(FormBuilder);

  rules = this.rulesService.rules;
  
  isEditing = signal(false);
  selectedRuleId = signal<string | null>(null);

  ruleForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    strategy: ['MIRROR', Validators.required],
    fixedValue: ['MO006'],
    prefixValue: ['BYD-'],
    placeholderCodes: [''], // UI: String separado por comas. Model: Array de strings.
    defaultCategory: ['Labor'],
    defaultHours: [0]
  });

  startNewRule() {
    this.selectedRuleId.set(null);
    this.isEditing.set(true);
    this.ruleForm.reset({
      name: '',
      description: '',
      strategy: 'MIRROR',
      fixedValue: 'MO006',
      prefixValue: 'BYD-',
      placeholderCodes: 'MO006, GENERICO',
      defaultCategory: 'Labor',
      defaultHours: 0
    });
  }

  editRule(rule: BusinessRule) {
    this.selectedRuleId.set(rule.id);
    this.isEditing.set(true);
    
    // Convertir Array a String para el input
    const formVal = {
      ...rule,
      placeholderCodes: rule.placeholderCodes ? rule.placeholderCodes.join(', ') : ''
    };
    
    this.ruleForm.patchValue(formVal);
  }

  saveRule() {
    if (this.ruleForm.invalid) return;
    const val = this.ruleForm.value;

    // Parsear String a Array
    const placeholders = (val.placeholderCodes as string)
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const cleanRule = {
      ...val,
      placeholderCodes: placeholders
    };

    if (this.selectedRuleId()) {
      this.rulesService.updateRule(this.selectedRuleId()!, cleanRule);
    } else {
      this.rulesService.addRule(cleanRule);
    }
    this.cancelEdit();
  }

  deleteRule(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('¿Eliminar esta regla de negocio?')) {
      this.rulesService.deleteRule(id);
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
    this.selectedRuleId.set(null);
  }

  setActive(id: string, event: Event) {
    event.stopPropagation();
    this.rulesService.setActiveRule(id);
  }
}
