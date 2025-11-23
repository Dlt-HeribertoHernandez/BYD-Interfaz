
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../services/notification.service';
import { BydOrderType, BydRepairType, BydServiceDetail, EquivalenceRule, DaltonFolioType, DaltonServiceConcept } from '../../models/app.types';

/**
 * OrderTypeMapperComponent (Integral CRUD Update)
 * -----------------------------------------------
 * Command Center de 4 Paneles con gestión completa de Catálogos (CRUD) en cada nivel.
 * Flujo Jerárquico: Order Type -> Repair Type -> Service Detail -> [Dalton Catalog + Link].
 * Incorpora: Buscadores locales, validación de estado y breadcrumbs.
 */
@Component({
  selector: 'app-order-type-mapper',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-type-mapper.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTypeMapperComponent {
  private api = inject(ApiService);
  private notification = inject(NotificationService);

  // --- ESTADO DE DATOS (Catálogos Completos) ---
  allOrderTypes = signal<BydOrderType[]>([]);
  allRepairTypes = signal<BydRepairType[]>([]);
  allServiceDetails = signal<BydServiceDetail[]>([]);
  
  // Catálogos Dalton (Panel 4)
  daltonFolios = signal<DaltonFolioType[]>([]);
  daltonConcepts = signal<DaltonServiceConcept[]>([]);
  
  // Reglas Existentes (Matriz Final)
  existingRules = signal<EquivalenceRule[]>([]);

  // --- ESTADO DE SELECCIÓN (Flow) ---
  selectedOrderType = signal<BydOrderType | null>(null);
  selectedRepairType = signal<BydRepairType | null>(null);
  selectedServiceDetail = signal<BydServiceDetail | null>(null);

  // --- FILTROS DE BÚSQUEDA LOCAL (UX Enhancement) ---
  searchOt = signal('');
  searchRt = signal('');
  searchSd = signal('');

  // --- ESTADOS DE EDICIÓN / CREACIÓN (CRUD Inline) ---
  isCreatingOrderType = signal(false);
  isCreatingRepairType = signal(false);
  isCreatingServiceDetail = signal(false);
  
  // Panel 4 Dalton Editors
  isCreatingFolio = signal(false);
  isCreatingConcept = signal(false);

  // Form Models (Inputs Temporales)
  newOt = signal({ code: '', name: '' });
  newRt = signal({ code: '', name: '' });
  newSd = signal({ description: '', laborCode: '', standardHours: 0 });
  
  newFolio = signal({ prefix: '', description: '' });
  newConcept = signal({ internalClass: '', description: '' });

  // Panel 4 Link Selection
  selectedDaltonFolio = signal<DaltonFolioType | null>(null);
  selectedDaltonConcept = signal<DaltonServiceConcept | null>(null);

  isLoading = signal(false);
  isSaving = signal(false);

  // --- COMPUTED SIGNALS (Filtrado en Cascada + Búsqueda) ---
  
  // 1. Order Types (Nivel 1): Solo filtra por texto
  filteredOrderTypes = computed(() => {
     const term = this.searchOt().toLowerCase();
     return this.allOrderTypes().filter(ot => 
        ot.name.toLowerCase().includes(term) || ot.code.toLowerCase().includes(term)
     );
  });

  // 2. Repair Types (Nivel 2): Filtra por Padre (OT) + Texto
  filteredRepairTypes = computed(() => {
    const ot = this.selectedOrderType();
    const term = this.searchRt().toLowerCase();
    
    if (!ot) return []; // Empty state si no hay padre
    
    return this.allRepairTypes().filter(rt => {
       const matchesParent = rt.orderTypeId === ot.id;
       const matchesText = rt.name.toLowerCase().includes(term) || rt.code.toLowerCase().includes(term);
       return matchesParent && matchesText;
    });
  });

  // 3. Service Details (Nivel 3): Filtra por Padre (RT) + Texto
  filteredServiceDetails = computed(() => {
    const rt = this.selectedRepairType();
    const term = this.searchSd().toLowerCase();

    if (!rt) return []; // Empty state si no hay padre

    return this.allServiceDetails().filter(sd => {
       const matchesParent = sd.repairTypeId === rt.id;
       const matchesText = sd.description.toLowerCase().includes(term) || sd.laborCode.toLowerCase().includes(term);
       return matchesParent && matchesText;
    });
  });

  // Breadcrumb Summary for Footer
  ruleSummary = computed(() => {
     const ot = this.selectedOrderType();
     const rt = this.selectedRepairType();
     const sd = this.selectedServiceDetail();
     const folio = this.selectedDaltonFolio();
     const concept = this.selectedDaltonConcept();

     const part1 = folio && concept ? `[${folio.prefix}] ${concept.internalClass}` : '...';
     const part2 = ot ? ot.name : '...';
     const part3 = rt ? rt.code : '...';
     const part4 = sd ? sd.laborCode : '...';

     const isReady = !!(ot && rt && sd && folio && concept);

     return {
        text: `SI ES ${part1}  -->  ENTONCES ASIGNAR BYD: ${part2} / ${part3} / ${part4}`,
        isReady
     };
  });

  constructor() {
    effect(() => {
      const dealer = this.api.selectedDealerCode();
      this.api.useMockData(); // Trigger dependency
      
      if (dealer) {
        this.loadAllData(dealer);
      } else {
        this.resetAll();
      }
    });
  }

  resetAll() {
    this.allOrderTypes.set([]);
    this.allRepairTypes.set([]);
    this.allServiceDetails.set([]);
    this.daltonFolios.set([]);
    this.daltonConcepts.set([]);
    this.existingRules.set([]);
    this.resetSelections();
  }

  resetSelections() {
    this.selectedOrderType.set(null);
    this.selectedRepairType.set(null);
    this.selectedServiceDetail.set(null);
    this.selectedDaltonFolio.set(null);
    this.selectedDaltonConcept.set(null);
  }

  loadAllData(dealerCode: string) {
    this.isLoading.set(true);
    // Carga paralela simulada (en prod usar forkJoin)
    this.api.getBydOrderTypes().subscribe(ot => {
       this.allOrderTypes.set(ot);
       this.api.getBydRepairTypes().subscribe(rt => {
          this.allRepairTypes.set(rt);
          this.api.getBydServiceDetails().subscribe(sd => {
             this.allServiceDetails.set(sd);
             this.loadDaltonContext(dealerCode);
          });
       });
    });
  }

  loadDaltonContext(dealerCode: string) {
     this.api.getDaltonFolios(dealerCode).subscribe(f => {
        this.daltonFolios.set(f);
        this.api.getDaltonConcepts(dealerCode).subscribe(c => {
           this.daltonConcepts.set(c);
           this.api.getEquivalenceRules(dealerCode).subscribe(r => {
              this.existingRules.set(r);
              this.isLoading.set(false);
           });
        });
     });
  }

  // --- CRUD PANEL 1: ORDER TYPE ---

  startCreateOrderType() {
     this.isCreatingOrderType.set(true);
     this.newOt.set({ code: '', name: '' });
  }

  saveOrderType() {
     const val = this.newOt();
     if(!val.code || !val.name) return;
     this.isSaving.set(true);
     this.api.createBydOrderType({code: val.code, name: val.name}).subscribe(ok => {
        if(ok) {
           this.api.getBydOrderTypes().subscribe(d => this.allOrderTypes.set(d));
           this.isCreatingOrderType.set(false);
           this.notification.show('Order Type creado', 'success');
        }
        this.isSaving.set(false);
     });
  }

  deleteOrderType(id: string) {
     if(!confirm('¿Eliminar Order Type y TODOS sus dependientes?')) return;
     this.api.deleteBydOrderType(id).subscribe(ok => {
        if(ok) {
           this.api.getBydOrderTypes().subscribe(d => this.allOrderTypes.set(d));
           this.resetSelections();
        }
     });
  }

  selectOrderType(ot: BydOrderType) {
    if (this.selectedOrderType()?.id === ot.id) return; // Avoid redundant updates
    this.selectedOrderType.set(ot);
    this.selectedRepairType.set(null);
    this.selectedServiceDetail.set(null);
    this.isCreatingRepairType.set(false);
    this.searchRt.set(''); // Reset child filters
  }

  // --- CRUD PANEL 2: REPAIR TYPE ---

  startCreateRepairType() {
     this.isCreatingRepairType.set(true);
     this.newRt.set({ code: '', name: '' });
  }

  saveRepairType() {
     const ot = this.selectedOrderType();
     const val = this.newRt();
     if(!ot || !val.code || !val.name) return;
     
     this.isSaving.set(true);
     this.api.createBydRepairType({ orderTypeId: ot.id, code: val.code, name: val.name }).subscribe(ok => {
        if(ok) {
           this.api.getBydRepairTypes().subscribe(d => this.allRepairTypes.set(d));
           this.isCreatingRepairType.set(false);
           this.notification.show('Repair Type creado', 'success');
        }
        this.isSaving.set(false);
     });
  }

  deleteRepairType(id: string) {
     if(!confirm('¿Eliminar Repair Type?')) return;
     this.api.deleteBydRepairType(id).subscribe(ok => {
        if(ok) {
           this.api.getBydRepairTypes().subscribe(d => this.allRepairTypes.set(d));
           this.selectedServiceDetail.set(null);
        }
     });
  }

  selectRepairType(rt: BydRepairType) {
    if (this.selectedRepairType()?.id === rt.id) return;
    this.selectedRepairType.set(rt);
    this.selectedServiceDetail.set(null);
    this.isCreatingServiceDetail.set(false);
    this.searchSd.set('');
  }

  // --- CRUD PANEL 3: SERVICE DETAIL (LABOR) ---

  startCreateServiceDetail() {
     this.isCreatingServiceDetail.set(true);
     this.newSd.set({ description: '', laborCode: '', standardHours: 0 });
  }

  saveServiceDetail() {
     const rt = this.selectedRepairType();
     const val = this.newSd();
     if(!rt || !val.laborCode || !val.description) return;

     this.isSaving.set(true);
     this.api.createBydServiceDetail({ 
        repairTypeId: rt.id, 
        description: val.description, 
        laborCode: val.laborCode, 
        standardHours: val.standardHours 
     }).subscribe(ok => {
        if(ok) {
           this.api.getBydServiceDetails().subscribe(d => this.allServiceDetails.set(d));
           this.isCreatingServiceDetail.set(false);
           this.notification.show('Labor Code agregado', 'success');
        }
        this.isSaving.set(false);
     });
  }

  deleteServiceDetail(id: string) {
     if(!confirm('¿Eliminar Detalle de Servicio?')) return;
     this.api.deleteBydServiceDetail(id).subscribe(ok => {
        if(ok) {
           this.api.getBydServiceDetails().subscribe(d => this.allServiceDetails.set(d));
           if (this.selectedServiceDetail()?.id === id) this.selectedServiceDetail.set(null);
        }
     });
  }
  
  selectServiceDetail(sd: BydServiceDetail) {
     this.selectedServiceDetail.set(sd);
  }

  // --- CRUD PANEL 4 (A): DALTON CATALOGS ---

  // Folios
  saveDaltonFolio() {
     const dealer = this.api.selectedDealerCode();
     const val = this.newFolio();
     if(!dealer || !val.prefix) return;
     
     this.isSaving.set(true);
     this.api.createDaltonFolio({ dealerCode: dealer, prefix: val.prefix, description: val.description }).subscribe(ok => {
        if(ok) {
           this.api.getDaltonFolios(dealer).subscribe(d => this.daltonFolios.set(d));
           this.isCreatingFolio.set(false);
           this.newFolio.set({ prefix: '', description: '' });
           this.notification.show('Folio guardado', 'success');
        }
        this.isSaving.set(false);
     });
  }

  deleteDaltonFolio(id: string) {
     if(!confirm('¿Eliminar este Folio?')) return;
     this.api.deleteDaltonFolio(id).subscribe(ok => {
        if(ok) {
           const d = this.api.selectedDealerCode();
           if(d) this.api.getDaltonFolios(d).subscribe(x => this.daltonFolios.set(x));
        }
     });
  }

  // Concepts
  saveDaltonConcept() {
     const dealer = this.api.selectedDealerCode();
     const val = this.newConcept();
     if(!dealer || !val.internalClass) return;
     
     this.isSaving.set(true);
     this.api.createDaltonConcept({ dealerCode: dealer, internalClass: val.internalClass, description: val.description }).subscribe(ok => {
        if(ok) {
           this.api.getDaltonConcepts(dealer).subscribe(d => this.daltonConcepts.set(d));
           this.isCreatingConcept.set(false);
           this.newConcept.set({ internalClass: '', description: '' });
           this.notification.show('Concepto guardado', 'success');
        }
        this.isSaving.set(false);
     });
  }

  deleteDaltonConcept(id: string) {
     if(!confirm('¿Eliminar este Concepto?')) return;
     this.api.deleteDaltonConcept(id).subscribe(ok => {
        if(ok) {
           const d = this.api.selectedDealerCode();
           if(d) this.api.getDaltonConcepts(d).subscribe(x => this.daltonConcepts.set(x));
        }
     });
  }

  // --- PANEL 4 (B): LINKING ---

  saveRule() {
    const dealer = this.api.selectedDealerCode();
    const sd = this.selectedServiceDetail();
    const folio = this.selectedDaltonFolio();
    const concept = this.selectedDaltonConcept();

    if (!dealer || !sd || !folio || !concept) {
      this.notification.show('Selecciona todos los elementos para vincular.', 'warning');
      return;
    }

    // Check duplicate
    const duplicate = this.existingRules().find(r => 
      r.dealerCode === dealer && 
      r.daltonPrefix === folio.prefix && 
      r.internalClass === concept.internalClass
    );

    if (duplicate) {
      this.notification.show('Esta combinación Dalton ya tiene una equivalencia registrada.', 'error');
      return;
    }

    this.isSaving.set(true);
    const newRule: EquivalenceRule = {
      id: '',
      dealerCode: dealer,
      daltonPrefix: folio.prefix,
      internalClass: concept.internalClass,
      serviceDetailId: sd.id
    };

    this.api.createEquivalenceRule(newRule).subscribe(success => {
      if (success) {
        this.notification.show('¡Vinculación creada exitosamente!', 'success');
        this.api.getEquivalenceRules(dealer).subscribe(rules => this.existingRules.set(rules));
      } else {
        this.notification.show('Error al guardar regla.', 'error');
      }
      this.isSaving.set(false);
    });
  }

  deleteRule(id: string) {
    if (!confirm('¿Desvincular regla?')) return;
    this.api.deleteEquivalenceRule(id).subscribe(ok => {
       if(ok) {
          const d = this.api.selectedDealerCode();
          if(d) this.api.getEquivalenceRules(d).subscribe(r => this.existingRules.set(r));
          this.notification.show('Regla eliminada', 'info');
       }
    });
  }
}
