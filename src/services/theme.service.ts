
import { Injectable, signal, effect } from '@angular/core';

/**
 * Servicio para gestionar el Modo Oscuro/Claro.
 * Persiste la preferencia en localStorage y aplica la clase 'dark' al elemento HTML raíz.
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  isDark = signal<boolean>(false);

  constructor() {
    // 1. Verificar almacenamiento local o preferencia del sistema
    const stored = localStorage.getItem('theme');
    if (stored) {
      this.isDark.set(stored === 'dark');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.isDark.set(true);
    }
    
    // 2. Efecto secundario: Manipular el DOM cuando la señal cambie
    effect(() => {
      if (this.isDark()) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  toggle() {
    this.isDark.update(v => !v);
  }
}
