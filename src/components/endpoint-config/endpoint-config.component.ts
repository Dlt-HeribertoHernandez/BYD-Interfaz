
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { EndpointConfigService } from '../../services/endpoint-config.service';
import { EndpointConfiguration } from '../../models/app.types';

@Component({
  selector: 'app-endpoint-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './endpoint-config.component.html'
})
export class EndpointConfigComponent {
  private configService = inject(EndpointConfigService);
  private fb = inject(FormBuilder);

  configs = this.configService.configurations;
  
  // UI State
  isEditing = signal(false);
  selectedConfigId = signal<string | null>(null);

  // Form
  configForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    url: ['', [Validators.required, Validators.pattern('https?://.+')]],
    method: ['POST', Validators.required],
    targetTable: [''],
    apiKey: [''], // New
    headers: ['{\n  "Content-Type": "application/json"\n}'], // New
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
      // Update
      this.configService.updateConfig(this.selectedConfigId()!, formValue);
    } else {
      // Create
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
}
