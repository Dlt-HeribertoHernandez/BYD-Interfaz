
import { Routes } from '@angular/router';
import { MappingLinkerComponent } from './components/mapping-linker.component';
import { ServiceOrdersComponent } from './components/service-orders/service-orders.component';
import { EndpointConfigComponent } from './components/endpoint-config/endpoint-config.component';
import { LogMonitorComponent } from './components/log-monitor/log-monitor.component';
import { BusinessLogicComponent } from './components/business-logic/business-logic.component';
import { DealerManagerComponent } from './components/dealer-manager/dealer-manager.component';
import { OrderTypeMapperComponent } from './components/order-type-mapper/order-type-mapper.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  // Ruta pública
  { path: 'login', component: LoginComponent },
  
  // Rutas protegidas (Requieren autenticación)
  { 
    path: '', 
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'mapping', component: MappingLinkerComponent },
      { path: 'orders', component: ServiceOrdersComponent },
      { path: 'logs', component: LogMonitorComponent },
      { path: 'config', component: EndpointConfigComponent },
      { path: 'rules', component: BusinessLogicComponent },
      { path: 'dealers', component: DealerManagerComponent },
      { path: 'order-types', component: OrderTypeMapperComponent },
    ]
  },
  
  // Wildcard redirect
  { path: '**', redirectTo: 'login' }
];
