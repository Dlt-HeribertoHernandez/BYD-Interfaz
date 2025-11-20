
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { EndpointConfigService } from '../../services/endpoint-config.service';
import { EndpointConfiguration } from '../../models/app.types';

/**
 * Componente para la gestión de configuraciones de endpoints dinámicos.
 * Permite editar URLs, Headers y Payloads JSON sin modificar código fuente.
 */
@Component({
  selector: 'app-endpoint-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './endpoint-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EndpointConfigComponent {
  private configService = inject(EndpointConfigService);
  private fb = inject(FormBuilder);

  configs = this.configService.configurations;
  
  // Estados de UI
  isEditing = signal(false);
  selectedConfigId = signal<string | null>(null);
  
  // Estados de Preview
  showPreviewModal = signal(false);
  previewContent = signal('');

  configForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    url: ['', [Validators.required, Validators.pattern('https?://.+')]],
    method: ['POST', Validators.required],
    targetTable: [''],
    apiKey: [''],
    headers: ['{\n  "Content-Type": "application/json"\n}'],
    jsonStructure: ['{\n  \n}', Validators.required],
    isActive: [true]
  });

  get isFormInvalid() {
    return this.configForm.invalid;
  }

  startNewConfig() {
    this.selectedConfigId.set(null);
    this.isEditing.set(true);
    this.configForm.reset({
      method: 'POST',
      isActive: true,
      apiKey: '',
      headers: '{\n  "Content-Type": "application/json"\n}',
      jsonStructure: '{\n  "key": "value"\n}'
    });
  }

  selectConfig(config: EndpointConfiguration) {
    this.selectedConfigId.set(config.id);
    this.isEditing.set(true);
    this.configForm.patchValue({
      name: config.name,
      description: config.description,
      url: config.url,
      method: config.method,
      targetTable: config.targetTable,
      apiKey: config.apiKey,
      headers: config.headers,
      jsonStructure: config.jsonStructure,
      isActive: config.isActive
    });
  }

  saveConfig() {
    if (this.configForm.invalid) return;

    const formValue = this.configForm.value;

    if (this.selectedConfigId()) {
      this.configService.updateConfig(this.selectedConfigId()!, formValue);
    } else {
      this.configService.addConfig(formValue);
    }

    this.cancelEdit();
  }

  deleteConfig(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('¿Estás seguro de eliminar esta configuración?')) {
      this.configService.deleteConfig(id);
      if (this.selectedConfigId() === id) {
        this.cancelEdit();
      }
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
    this.selectedConfigId.set(null);
  }

  formatJson(field: 'jsonStructure' | 'headers') {
    try {
      const current = this.configForm.get(field)?.value;
      const parsed = JSON.parse(current);
      this.configForm.patchValue({
        [field]: JSON.stringify(parsed, null, 2)
      });
    } catch (e) {
      alert('JSON inválido, no se puede formatear.');
    }
  }

  /**
   * Genera una simulación del JSON final reemplazando variables de plantilla
   * con datos ficticios.
   */
  generatePreview() {
    let raw = this.configForm.get('jsonStructure')?.value || '';
    
    // Reemplazo de variables de plantilla
    raw = raw.replace(/{{TIMESTAMP}}/g, new Date().toISOString());
    raw = raw.replace(/{{CONTEXT_DEALER}}/g, "MEX022429");
    raw = raw.replace(/{{STRING}}/g, "SAMPLE_TEXT");

    const sampleArray = JSON.stringify([
      { "IdModeloVehiculo": 1, "Nombre": "SONG PLUS", "Codigo": "WSA3...", "Descripcion": "Sample Labor" },
      { "IdModeloVehiculo": 2, "Nombre": "HAN EV", "Codigo": "BAT_01", "Descripcion": "Battery Check" }
    ]);
    
    raw = raw.replace(/{{ARRAY_DATA}}/g, sampleArray);
    raw = raw.replace(/"{{ARRAY_DATA}}"/g, sampleArray); 

    try {
       const obj = JSON.parse(raw);
       this.previewContent.set(JSON.stringify(obj, null, 2));
    } catch(e) {
       this.previewContent.set(raw + '\n\n// Nota: La vista previa generó un JSON inválido o contiene errores de sintaxis.');
    }
    
    this.showPreviewModal.set(true);
  }

  closePreview() {
    this.showPreviewModal.set(false);
  }
}
