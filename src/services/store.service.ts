
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ApiService } from './api.service';
import { MappingItem } from '../models/app.types';

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private api = inject(ApiService);

  // State Signals
  private mappingsSignal = signal<MappingItem[]>([]);
  
  readonly mappings = this.mappingsSignal.asReadonly();
  
  // Computed stats
  readonly stats = computed(() => {
    const list = this.mappingsSignal();
    return {
      total: list.length,
      linked: list.filter(i => i.status === 'Linked').length,
      labor: list.filter(i => i.bydType === 'Labor').length,
      repair: list.filter(i => i.bydType === 'Repair').length,
    };
  });

  constructor() {
    // Reload mappings whenever the Mock Mode changes
    effect(() => {
       this.api.useMockData(); // Dependency
       this.loadMappings();
    });
  }

  loadMappings() {
    this.api.getMappings().subscribe(data => {
      this.mappingsSignal.set(data);
    });
  }

  addMapping(item: Omit<MappingItem, 'id' | 'status'>) {
    const newItem: MappingItem = {
      ...item,
      id: crypto.randomUUID(),
      status: 'Linked'
    };
    
    this.api.createMapping(newItem).subscribe(() => {
      this.mappingsSignal.update(current => [newItem, ...current]);
    });
  }

  addBatchMappings(items: Omit<MappingItem, 'id' | 'status'>[]) {
    // handling batch as individual calls for this demo, or a batch endpoint in real life
    items.forEach(item => this.addMapping(item));
  }

  removeMapping(id: string) {
    this.api.deleteMapping(id).subscribe(() => {
      this.mappingsSignal.update(current => current.filter(i => i.id !== id));
    });
  }
}
