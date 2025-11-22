
import { Component, inject, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../services/notification.service';
import { Dealer } from '../../models/app.types';

@Component({
  selector: 'app-dealer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dealer-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DealerManagerComponent {
  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  // Signals
  dealers = signal<Dealer[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);

  // Formulario de Registro
  dealerForm: FormGroup = this.fb.group({
    dealerCode: ['', [Validators.required, Validators.minLength(3)]],
    dealerName: ['', [Validators.required]],
    appId: ['', Validators.required],
    dealerKey: ['', Validators.required],
    vchRepairStoreCode: ['']
  });

  constructor() {
    effect(() => {
      this.api.useMockData(); // Trigger effect on mode change
      this.loadDealers();
    });
  }

  loadDealers() {
    this.isLoading.set(true);
    this.api.getDealers().subscribe({
      next: (data) => {
        this.dealers.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.notification.show('Error al cargar agencias.', 'error');
        this.isLoading.set(false);
      }
    });
  }

  saveDealer() {
    if (this.dealerForm.invalid) {
      this.notification.show('Completa los campos obligatorios.', 'warning');
      return;
    }

    this.isSubmitting.set(true);
    const formVal = this.dealerForm.value;

    // Objeto Dealer sin ID (el backend lo asignará)
    const newDealer: Omit<Dealer, 'intID'> = {
      dealerCode: formVal.dealerCode,
      dealerName: formVal.dealerName,
      appId: formVal.appId,
      dealerKey: formVal.dealerKey,
      vchRepairStoreCode: formVal.vchRepairStoreCode || `${formVal.dealerCode}RS0001` // Default generator
    };

    this.api.createDealer(newDealer).subscribe({
      next: (success) => {
        if (success) {
          this.notification.show('Agencia registrada exitosamente.', 'success');
          this.dealerForm.reset();
          this.loadDealers(); // Recargar lista
        } else {
          this.notification.show('Error al guardar agencia en el servidor.', 'error');
        }
        this.isSubmitting.set(false);
      },
      error: () => {
        this.notification.show('Error de conexión al crear agencia.', 'error');
        this.isSubmitting.set(false);
      }
    });
  }

  // Helper visual
  getInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }
}
