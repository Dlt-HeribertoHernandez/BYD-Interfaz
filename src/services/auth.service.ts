
import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, delay, of, Observable, catchError, map } from 'rxjs';
import { LoginCredentials, AuthResponse, User } from '../models/app.types';
import { EndpointConfigService } from './endpoint-config.service';
import { NotificationService } from './notification.service';
import { ApiService } from './api.service';

/**
 * AuthService
 * -----------
 * Gestiona el ciclo de vida de la autenticación: Login, Logout, Persistencia de Token.
 * Soporta modo MOCK para desarrollo y modo LIVE para producción.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private configService = inject(EndpointConfigService);
  private notification = inject(NotificationService);
  private apiService = inject(ApiService); // Para saber si estamos en mock

  // ESTADO
  private currentUserSignal = signal<User | null>(null);
  private tokenSignal = signal<string | null>(null);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());

  constructor() {
    this.restoreSession();
  }

  /**
   * Intenta restaurar la sesión desde LocalStorage al iniciar la app.
   */
  private restoreSession() {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (storedToken && storedUser) {
      this.tokenSignal.set(storedToken);
      this.currentUserSignal.set(JSON.parse(storedUser));
    }
  }

  /**
   * Inicia sesión (Mock o Live).
   */
  login(credentials: LoginCredentials): Observable<boolean> {
    
    // 1. MODO MOCK (Simulación inmediata)
    if (this.apiService.useMockData()) {
      return of(true).pipe(
        delay(1000), // Simular latencia de red
        map(() => {
          // Usuario Mock Dummy
          const mockUser: User = {
            id: 'mock-001',
            name: 'Demo Admin User',
            email: credentials.email,
            role: 'Admin',
            avatarUrl: 'https://ui-avatars.com/api/?name=Admin+User&background=random'
          };
          this.handleAuthSuccess('mock-jwt-token-12345', mockUser);
          return true;
        })
      );
    }

    // 2. MODO LIVE (Petición Real)
    const config = this.configService.getConfig('Auth Login');
    if (!config || !config.computedUrl) {
      this.notification.show('Error: Endpoint de Login no configurado.', 'error');
      return of(false);
    }

    return this.http.post<AuthResponse>(config.computedUrl, credentials).pipe(
      map(response => {
        if (response && response.token) {
          this.handleAuthSuccess(response.token, response.user);
          return true;
        }
        return false;
      }),
      catchError(err => {
        console.error('Auth Error:', err);
        this.notification.show('Credenciales incorrectas o error de servidor.', 'error');
        return of(false);
      })
    );
  }

  /**
   * Cierra sesión y limpia almacenamiento.
   */
  logout() {
    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    this.router.navigate(['/login']);
    this.notification.show('Sesión finalizada.', 'info');
  }

  /**
   * Retorna el token actual (usado por el Interceptor).
   */
  getToken(): string | null {
    return this.tokenSignal();
  }

  // --- HELPERS PRIVADOS ---

  private handleAuthSuccess(token: string, user: User) {
    this.tokenSignal.set(token);
    this.currentUserSignal.set(user);
    
    // Persistencia
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    
    this.notification.show(`Bienvenido, ${user.name}`, 'success');
    this.router.navigate(['/dashboard']);
  }
}
