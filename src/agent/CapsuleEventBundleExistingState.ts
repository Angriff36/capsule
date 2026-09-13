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

/**
 * Records already in the tenant that the bundle should reuse instead of
 * creating twins: the client, the venue, and catalog dishes keyed by
 * `dishKey(menu item name)`. Chosen by a person on the import review screen.
 */
export interface CapsuleEventBundleCatalogMatch {
  clientId?: string;
  venueId?: string;
  dishIds?: Record<string, string>;
}

export interface CapsuleEventBundleContext {
  directory?: CapsuleEventBundleDirectory;
  existing?: CapsuleEventBundleExistingEvent;
  catalog?: CapsuleEventBundleCatalogMatch;
  /**
   * Staff rows that match no person become open shifts (EventStaffNeed) with
   * the printed role and times, instead of a "match no person" warning. TPP
   * prints unfilled roles as "*Unassigned*", so this is how those come in.
   */
  unmatchedStaffAsOpenShifts?: boolean;
  /**
   * Raise a ReviewFlag on the event for each report disagreement, and on each
   * menu line whose servings are out of step with the guest count, so the
   * Ops Final Lock walk-through starts with the anomalies already listed.
   */
  raiseReviewFlags?: boolean;
}
