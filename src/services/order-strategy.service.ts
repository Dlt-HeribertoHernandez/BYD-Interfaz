
import { Injectable, signal } from '@angular/core';
import { OrderTypeConfig } from '../models/app.types';

@Injectable({
  providedIn: 'root'
})
export class OrderStrategyService {

  // Definition of supported Order Types and their Rules
  private definitions = signal<OrderTypeConfig[]>([
    {
      code: 'OS', // The Dalton DMS code for Repair Orders
      label: 'Repair Order (RO)',
      icon: 'fa-tools',
      colorClass: 'blue',
      rules: {
        allowLinking: true,
        autoProcessing: true,
        requiresApproval: false,
        visibleInList: true
      }
    },
    {
      code: 'WAR', // Future: Warranty
      label: 'Warranty Claim',
      icon: 'fa-shield-alt',
      colorClass: 'green',
      rules: {
        allowLinking: true,
        autoProcessing: false, // Maybe needs manual review
        requiresApproval: true,
        visibleInList: true
      }
    },
    {
      code: 'INT', // Future: Internal
      label: 'Internal Service',
      icon: 'fa-building',
      colorClass: 'gray',
      rules: {
        allowLinking: false, // Internal might not map to BYD standard codes
        autoProcessing: false,
        requiresApproval: false,
        visibleInList: true
      }
    },
    {
      code: 'PDI', // Future: Pre-Delivery Inspection
      label: 'PDI',
      icon: 'fa-check-double',
      colorClass: 'purple',
      rules: {
        allowLinking: true,
        autoProcessing: true,
        requiresApproval: false,
        visibleInList: true
      }
    }
  ]);

  readonly supportedTypes = this.definitions.asReadonly();

  /**
   * Returns the configuration strategy for a given document type code.
   * Falls back to a generic "Unknown" type if not found.
   */
  getStrategy(docType: string): OrderTypeConfig {
    const found = this.definitions().find(d => d.code === docType);
    if (found) return found;

    // Fallback Strategy
    return {
      code: docType,
      label: `Other (${docType})`,
      icon: 'fa-file-alt',
      colorClass: 'gray',
      rules: {
        allowLinking: false,
        autoProcessing: false,
        requiresApproval: false,
        visibleInList: true
      }
    };
  }

  /**
   * Quick helper to get Tailwind classes for the badge
   */
  getBadgeClass(docType: string): string {
    const config = this.getStrategy(docType);
    const color = config.colorClass;
    return `bg-${color}-50 text-${color}-700 border-${color}-200 border`;
  }
}
