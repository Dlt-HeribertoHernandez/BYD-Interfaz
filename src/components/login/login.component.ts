
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  authService = inject(AuthService);
  apiService = inject(ApiService); // Para togglear el modo mock desde el login si se desea
  private fb = inject(FormBuilder);

  isLoading = signal(false);
  errorMessage = signal('');

  loginForm: FormGroup = this.fb.group({
    email: ['admin@dalton.com', [Validators.required, Validators.email]],
    password: ['admin123', [Validators.required, Validators.minLength(4)]]
  });

  get isMockMode() {
    return this.apiService.useMockData();
  }

  toggleMock() {
    this.apiService.toggleMockData();
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const credentials = this.loginForm.value;

    this.authService.login(credentials).subscribe({
      next: (success) => {
        if (!success) {
          this.errorMessage.set('Credenciales inválidas.');
        }
        // Si es éxito, el servicio redirige automáticamente
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Error de conexión.');
        this.isLoading.set(false);
      }
    });
  }
}
