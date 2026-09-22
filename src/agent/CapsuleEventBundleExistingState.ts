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
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    /**
     * Deposit already on the invoice, in cents (null when none). Undefined
     * means the loader did not read it; the planner then leaves it alone.
     */
    depositAmountCents?: number | null;
    depositPaid?: boolean;
  }>;
  /** Payments on the tenant's invoices, amounts in cents. */
  payments: Array<{
    id: string;
    invoiceId: string;
    amountCents: number;
    status: string;
  }>;
  proposals: Array<{
    id: string;
    proposalNumber: string;
    status: string;
    /**
     * Descriptions of the lines already on the proposal. Undefined means the
     * loader did not read them; the planner then adds no lines to a proposal
     * it did not draft. A partially entered proposal resumes only when the
     * lines are known.
     */
    lineDescriptions?: string[];
  }>;
  vendorOrderNumbers: string[];
  /**
   * Vendor orders with the ingredient each line orders, so a run that opened
   * an order but never finished its lines adds only the missing ones.
   * Undefined means the loader did not read them.
   */
  vendorOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    lineIngredientIds: string[];
  }>;
}

/** An event that already exists. The run attaches to it. */
export interface CapsuleEventBundleExistingEvent {
  eventId: string;
  clientId: string;
  venueId?: string;
  /** The venue's stored fields (decrypted by the list query), for fill-in. */
  venue?: Record<string, unknown>;
  event: {
    /**
     * Header values a newer BEO overwrites (optional: a loader that does not
     * read them leaves the header alone).
     */
    stage?: string;
    eventNumber?: string | null;
    startsAt?: number | null;
    endsAt?: number | null;
    expectedHeadcount?: number | null;
    serviceStyleId?: string | null;
    venueName?: string | null;
    venueAddress?: string | null;
    venueCapacity?: number | null;
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
  /**
   * Live pack lists of the event that can no longer take items (packed,
   * loaded, dispatched, cancelled). A later BEO then opens a new list under
   * a new idempotency key instead of replaying the closed one.
   */
  closedPackLists?: number;
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
   * The tenant's active service styles. The BEO prints the style as text
   * ("Buffet - Cook Onsite"); the event stores the matching style's id, which
   * is what the Event workbook and the Final Lock checks read.
   */
  serviceStyles?: Array<{ id: string; name: string }>;
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
