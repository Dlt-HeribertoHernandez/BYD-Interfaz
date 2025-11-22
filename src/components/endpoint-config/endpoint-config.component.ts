
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { EndpointConfigService, ApiEnvironment } from '../../services/endpoint-config.service';
import { ApiService } from '../../services/api.service';
import { EndpointConfiguration } from '../../models/app.types';

@Component({
  selector: 'app-endpoint-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './endpoint-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EndpointConfigComponent {
  public configService = inject(EndpointConfigService);
  private apiService = inject(ApiService);
  private fb: FormBuilder = inject(FormBuilder);

  configs = this.configService.configurations;
  currentEnv = this.configService.currentEnvironment;
  
  // UI States
  isEditing = signal(false);
  isSaving = signal(false); 
  selectedConfigId = signal<string | null>(null);
  activeTab = signal<'general' | 'envs' | 'security' | 'payload'>('general');
  
  // Preview
  showPreviewModal = signal(false);
  previewContent = signal('');

  configForm: FormGroup = this.fb.group({
    // General
    name: ['', Validators.required],
    description: [''],
    method: ['POST', Validators.required],
    targetTable: [''],
    isActive: [true],
    
    // Paths
    resource: ['', [Validators.required, Validators.pattern('^/.*')]],
    basePathProd: ['', Validators.required],
    basePathQa: [''],
    basePathDev: [''],
    basePathLocal: ['http://localhost:5000'],
    
    // Security
    headerKey: ['X-API-Key'],
    apiKeyProd: [''],
    apiKeyQa: [''],

    // Payload (Frontend only feature currently)
    jsonStructure: ['{\n  \n}', Validators.required]
  });

  get isFormInvalid() {
    return this.configForm.invalid;
  }

  setEnv(env: string) {
    this.configService.setEnvironment(env as ApiEnvironment);
  }

  reloadConfigs() {
    this.configService.load(this.apiService.useMockData());
  }

  startNewConfig() {
    this.selectedConfigId.set(null);
    this.isEditing.set(true);
    this.activeTab.set('general');
    this.configForm.reset({
      method: 'POST',
      isActive: true,
      headerKey: 'Content-Type', 
      basePathLocal: 'http://localhost:5000',
      jsonStructure: '{\n  "key": "value"\n}'
    });
  }

  selectConfig(config: EndpointConfiguration) {
    this.selectedConfigId.set(config.id);
    this.isEditing.set(true);
    this.activeTab.set('general');
    this.configForm.patchValue({
      name: config.name,
      description: config.description,
      method: config.method,
      targetTable: config.targetTable,
      isActive: config.isActive,
      
      resource: config.resource,
      basePathProd: config.basePathProd,
      basePathQa: config.basePathQa,
      basePathDev: config.basePathDev,
      basePathLocal: config.basePathLocal,
      
      headerKey: config.headerKey,
      apiKeyProd: config.apiKeyProd,
      apiKeyQa: config.apiKeyQa,
      
      jsonStructure: config.jsonStructure
    });
  }

  saveConfig() {
    if (this.configForm.invalid) {
      alert('Formulario inválido. Revisa las pestañas obligatorias (Nombre, Recurso, BasePath).');
      return;
    }

    const formValue = this.configForm.value;
    this.isSaving.set(true);

    const configId = this.selectedConfigId();

    if (configId) {
      // Actualización (PUT)
      this.configService.updateConfig(configId, { ...formValue, id: configId }).subscribe({
        next: () => {
           this.isSaving.set(false);
           this.cancelEdit();
        },
        error: () => this.isSaving.set(false)
      });
    } else {
      // Creación (POST)
      this.configService.createConfig(formValue).subscribe({
        next: () => {
           this.isSaving.set(false);
           this.cancelEdit();
        },
        error: () => this.isSaving.set(false)
      });
    }
  }

  deleteConfig(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('¿Estás seguro de eliminar esta configuración? Se marcará como inactiva.')) {
      this.configService.deleteConfig(id).subscribe();
      if (this.selectedConfigId() === id) {
        this.cancelEdit();
      }
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
    this.selectedConfigId.set(null);
  }

  formatJson() {
    try {
      const current = this.configForm.get('jsonStructure')?.value;
      const parsed = JSON.parse(current);
      this.configForm.patchValue({
        jsonStructure: JSON.stringify(parsed, null, 2)
      });
    } catch (e) {
      alert('JSON inválido, no se puede formatear.');
    }
  }

  generatePreview() {
    let raw = this.configForm.get('jsonStructure')?.value || '';
    // Simple template replacement for preview
    raw = raw.replace(/{{TIMESTAMP}}/g, new Date().toISOString());
    raw = raw.replace(/{{CONTEXT_DEALER}}/g, "MEX022429");
    
    try {
       const obj = JSON.parse(raw);
       this.previewContent.set(JSON.stringify(obj, null, 2));
    } catch(e) {
       this.previewContent.set(raw + '\n\n// Nota: JSON inválido.');
    }
    this.showPreviewModal.set(true);
  }

  closePreview() {
    this.showPreviewModal.set(false);
  }
}
