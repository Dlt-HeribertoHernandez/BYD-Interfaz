
import { Component, inject, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IntegrationLog } from '../../models/app.types';
import { HttpClient } from '@angular/common/http';
import { EndpointConfigService } from '../../services/endpoint-config.service';

/**
 * Componente de monitoreo de Logs de Integración.
 * Permite visualizar el historial de transacciones con la planta.
 */
@Component({
  selector: 'app-log-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './log-monitor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogMonitorComponent {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private configService = inject(EndpointConfigService);

  logs = signal<IntegrationLog[]>([]);
  isLoading = signal(false);
  
  // Filtros
  searchTerm = signal('');
  showErrorsOnly = signal(false);

  // --- COMPUTED: Filtrado Reactivo ---
  filteredLogs = computed(() => {
    let list = this.logs();
    const term = this.searchTerm().toLowerCase();
    const onlyErrors = this.showErrorsOnly();

    if (onlyErrors) {
      list = list.filter(l => l.isError);
    }

    if (term) {
      list = list.filter(l => 
        l.vchOrdenServicio.toLowerCase().includes(term) ||
        l.VIN.toLowerCase().includes(term) ||
        l.vchMessage.toLowerCase().includes(term) ||
        l.labourcode.toLowerCase().includes(term)
      );
    }

    return list;
  });
  
  // Datos Mock locales para demostración si falla API
  private mockLogs: IntegrationLog[] = [
    { id: '1', vchOrdenServicio: 'XCL00435', vchLog: '1 -> 190802', dtmcreated: '19/11/2025', txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"Warranty activation date for VIN... mismatch"}', VIN: 'LGXC74C46S5105961', labourcode: 'WSA3HAC02101GH00', Cod_TpAut: 'SOPL25BD', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true },
    { id: '2', vchOrdenServicio: 'XCL00455', vchLog: '1 -> 190586', dtmcreated: '19/11/2025', txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"labour code and vehicle series not match"}', VIN: 'LGXC74C47S001793', labourcode: 'WSATJ00101GH00', Cod_TpAut: 'SOPL25BD', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true },
    { id: '3', vchOrdenServicio: 'XCL00451', vchLog: '1 -> 188748', dtmcreated: '18/11/2025', txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"Part does not match vehicle series"}', VIN: 'LPE19W2A8SF02716', labourcode: 'original45', Cod_TpAut: 'SHAR25BY', Desc_TpAut: 'SHARK 2025 BC', isError: true },
    { id: '4', vchOrdenServicio: 'XCL00449', vchLog: '1 -> 188357', dtmcreated: '18/11/2025', txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"labour code and vehicle series not match"}', VIN: 'LGXC74C41S502550', labourcode: 'SONG_PLUS_DMI_...', Cod_TpAut: 'SOPR25BL', Desc_TpAut: 'SONG PRO 2025 BL', isError: true },
    { id: '5', vchOrdenServicio: 'XCL00448', vchLog: '1 -> 188222', dtmcreated: '18/11/2025', txtDataJson: '{"dealerCode":"MEX02231...}', vchMessage: '{"success":true,"message":"labour code and vehicle series not match"}', VIN: 'LGXC74C46S006118', labourcode: 'WSATJ00101GH00', Cod_TpAut: 'SOPL25BD', Desc_TpAut: 'SONG PLUS 2025 BL', isError: true }
  ];

  constructor() {
    effect(() => {
       this.api.useMockData();
       this.loadLogs();
    });
  }

  loadLogs() {
    this.isLoading.set(true);
    if (this.api.useMockData()) {
       setTimeout(() => {
         this.logs.set(this.mockLogs);
         this.isLoading.set(false);
       }, 600);
    } else {
       // Live Load
       const config = this.configService.getConfig('Logs') || { url: 'https://api.daltonsoft-integration.com/api/logs' };
       this.http.get<IntegrationLog[]>(config.url).subscribe({
         next: (data) => {
            this.logs.set(data.map(l => ({...l, isError: l.vchMessage.includes('not match') || l.vchMessage.includes('error')})));
            this.isLoading.set(false);
         },
         error: () => {
            this.logs.set([]);
            this.isLoading.set(false);
         }
       });
    }
  }
}
