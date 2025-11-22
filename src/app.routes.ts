
import { Routes } from '@angular/router';
import { MappingLinkerComponent } from './components/mapping-linker.component';
import { ServiceOrdersComponent } from './components/service-orders/service-orders.component';
import { EndpointConfigComponent } from './components/endpoint-config/endpoint-config.component';
import { LogMonitorComponent } from './components/log-monitor/log-monitor.component';
import { BusinessLogicComponent } from './components/business-logic/business-logic.component';
import { DealerManagerComponent } from './components/dealer-manager/dealer-manager.component';
import { OrderTypeMapperComponent } from './components/order-type-mapper/order-type-mapper.component';

export const routes: Routes = [
  { path: '', redirectTo: 'mapping', pathMatch: 'full' },
  { path: 'mapping', component: MappingLinkerComponent },
  { path: 'orders', component: ServiceOrdersComponent },
  { path: 'logs', component: LogMonitorComponent },
  { path: 'config', component: EndpointConfigComponent },
  { path: 'rules', component: BusinessLogicComponent },
  { path: 'dealers', component: DealerManagerComponent },
  { path: 'order-types', component: OrderTypeMapperComponent },
];
