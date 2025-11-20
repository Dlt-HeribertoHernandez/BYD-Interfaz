
import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { BusinessRulesService } from '../../services/business-rules.service';
import { BusinessRule, ClassificationRule } from '../../models/app.types';

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

  // Signals de Datos
  rules = this.rulesService.rules;
  classificationRules = this.rulesService.classificationRules;
  
  // Estado de Vista
  activeTab = signal<'admission' | 'classification'>('admission');
  isEditingProfile = signal(false);
  
  // Estado del Simulador
  simulatorCode = signal<string>('MO006');
  simulatorDesc = signal<string>('REVISION DE FRENOS DELANTEROS');

  // Formulario Perfil de Admisión
  profileForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    placeholderCodes: ['', Validators.required], 
    isActive: [false]
  });

  // Formulario Nueva Regla de Clasificación
  newClassRuleKeyword = signal('');
  newClassRuleCategory = signal('');
  newClassRuleIcon = signal('fa-tag');
  newClassRuleColor = signal('blue');

  // --- COMPUTED: Simulador ---

  simulationResult = computed(() => {
    const code = this.simulatorCode().trim().toUpperCase();
    const desc = this.simulatorDesc().trim();
    
    // 1. Chequeo de Admisión
    const isAdmitted = this.rulesService.isItemRelevant(code);
    
    // 2. Chequeo de Clasificación
    const classification = this.rulesService.classifyItem(desc);

    return {
      isAdmitted,
      admittedStatus: isAdmitted ? 'ACEPTADO' : 'IGNORADO',
      admittedMessage: isAdmitted 
        ? 'El código está en la lista blanca. Pasará al flujo de trabajo.' 
        : 'Código no reconocido como Mano de Obra. Se ocultará.',
      
      classification
    };
  });

  // --- LOGICA PESTAÑA: ADMISIÓN ---

  get parsedTags(): string[] {
    const raw = this.profileForm.get('placeholderCodes')?.value || '';
    return raw.split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s.length > 0);
  }

  startNewProfile() {
    this.isEditingProfile.set(true);
    this.profileForm.reset({
      name: 'Nuevo Perfil',
      description: '',
      placeholderCodes: 'MO006, SERVICIO',
      isActive: false
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    const val = this.profileForm.value;
    const placeholders = (val.placeholderCodes as string).split(',').map(s => s.trim()).filter(s => s.length > 0);

    const cleanRule: any = {
      name: val.name,
      description: val.description,
      placeholderCodes: placeholders,
      isActive: val.isActive,
      strategy: 'MIRROR', defaultCategory: 'Labor', defaultHours: 0
    };

    this.rulesService.addRule(cleanRule); // Simplificado: Siempre crea nuevo en esta demo
    this.isEditingProfile.set(false);
  }

  cancelProfileEdit() {
    this.isEditingProfile.set(false);
  }

  deleteProfile(id: string) {
     if(confirm('¿Eliminar perfil?')) this.rulesService.deleteRule(id);
  }

  activateProfile(id: string) {
     this.rulesService.setActiveRule(id);
  }

  // --- LOGICA PESTAÑA: CLASIFICACIÓN ---

  addClassificationRule() {
    if (!this.newClassRuleKeyword() || !this.newClassRuleCategory()) return;

    this.rulesService.addClassificationRule({
      keyword: this.newClassRuleKeyword(),
      category: this.newClassRuleCategory(),
      icon: this.newClassRuleIcon(),
      colorClass: this.newClassRuleColor(),
      priority: 'Normal'
    });

    // Reset fields
    this.newClassRuleKeyword.set('');
    this.newClassRuleCategory.set('');
  }

  deleteClassRule(id: string) {
    this.rulesService.deleteClassificationRule(id);
  }

  // Helpers para UI
  iconsList = ['fa-tag', 'fa-oil-can', 'fa-circle-stop', 'fa-car-battery', 'fa-wrench', 'fa-stethoscope', 'fa-wifi', 'fa-bolt', 'fa-shield-alt', 'fa-broom'];
  colorsList = ['blue', 'green', 'red', 'orange', 'purple', 'yellow', 'gray'];
}
