
import { Injectable, signal } from '@angular/core';
import { ToastNotification } from '../models/app.types';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSignal = signal<ToastNotification[]>([]);
  readonly notifications = this.notificationsSignal.asReadonly();

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 5000) {
    const id = crypto.randomUUID();
    const toast: ToastNotification = { id, message, type, duration };
    
    this.notificationsSignal.update(current => [...current, toast]);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  remove(id: string) {
    this.notificationsSignal.update(current => current.filter(t => t.id !== id));
  }
}
