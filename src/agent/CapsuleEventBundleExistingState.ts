/**
 * Tenant records the bundle planners match against so a run adds what is
 * missing instead of creating twins. Loaded live by
 * `CapsuleEventBundleStateLoader`; tests build it by hand.
 */

export interface CapsuleEventBundleDirectory {
  /** The tenant's own names. TPP lists in-house items under the caterer. */
  organizationNames: string[];
  people: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
  ingredients: Array<{ id: string; name: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string }>;
  /** Payments on the tenant's invoices, amounts in cents. */
  payments: Array<{
    id: string;
    invoiceId: string;
    amountCents: number;
    status: string;
  }>;
  proposals: Array<{ id: string; proposalNumber: string; status: string }>;
  vendorOrderNumbers: string[];
}

/** An event that already exists. The run attaches to it. */
export interface CapsuleEventBundleExistingEvent {
  eventId: string;
  clientId: string;
  venueId?: string;
  event: {
    quotedPrice: number;
    primaryContactName?: string;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
    serviceRequirements?: string | null;
    operationalRequirements?: string | null;
  };
  client: { email?: string | null; phone?: string | null };
  clientContactNames: string[];
  eventDishes: Array<{ id: string; dishName: string; course?: string | null }>;
  timelineNames: string[];
  prepTasks: Array<{ dishName: string; name: string }>;
  packList?: { id: string; itemDescriptions: string[] };
  assignedPersonIds: string[];
}

export interface CapsuleEventBundleContext {
  directory?: CapsuleEventBundleDirectory;
  existing?: CapsuleEventBundleExistingEvent;
}
