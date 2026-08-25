/**
 * Normalized shape of one TPP event export bundle.
 *
 * Seven reports describe the same event from different angles. Each parser
 * fills the part it owns; `mergeEventBundle` reconciles them into this shape.
 * Nothing here is Capsule-specific — the mapping to commands happens in the
 * agent coordinator.
 */

export type EventBundleSource =
  | "beo"
  | "eventWorksheet"
  | "proposal"
  | "packList"
  | "orderList"
  | "productionWorksheet"
  | "battleBoard";

export interface BundleHeader {
  /** TPP invoice number. The stable identity of the event across reports. */
  invoiceNumber?: string;
  title?: string;
  /** Calendar date, "YYYY-MM-DD". */
  eventDate?: string;
  /** Minutes after midnight. */
  startMinutes?: number;
  endMinutes?: number;
  guestCount?: number;
  serviceStyle?: string;
  occasion?: string;
  eventType?: string;
  /** TPP status text, for example "2- Sales Lock". */
  status?: string;
  salespersonName?: string;
  salespersonEmail?: string;
}

export interface BundlePerson {
  name?: string;
  email?: string;
  phone?: string;
  /** "Groom", "Photos", "Mother of Groom" and similar labels. */
  role?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

export interface BundleVenue {
  name?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  phone?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface BundleTimelineEntry {
  name: string;
  /** Minutes after midnight. */
  minutes: number;
  notes?: string;
  /** Battle-board category, for example "BUFFET", "STRIKE". */
  category?: string;
  team?: string;
  staff?: string;
}

export interface BundleMenuItem {
  name: string;
  /** Menu section, for example "Cocktail Hour", "Mexican Grill Buffet". */
  course?: string;
  quantityServings?: number;
  description?: string;
  /** Service note, printed with "**" in TPP. */
  specialInstructions?: string;
  unitPriceCents?: number;
  totalPriceCents?: number;
}

export interface BundlePrepTask {
  /** Verbatim TPP category, for example "Finish at Kitchen". */
  category: string;
  /** Menu item the task produces. */
  dishName: string;
  /** Task line, for example "Make Carne Asada (Finished Weight)". */
  name: string;
  quantity?: number;
  unit?: string;
  specialInstructions?: string;
  /** Servings printed on the parent item, for example "P: 59.00 Serving". */
  parentServings?: number;
}

export interface BundlePackListItem {
  /** Pack-list grouping, for example "GREEN: FOH - To Buffet (Utensils)". */
  classification: string;
  name: string;
  quantity?: number;
  unit?: string;
  /** TPP equipment code, for example "B04". */
  code?: string;
  /** Menu items or notes the item serves. */
  forItems: string[];
  notes?: string;
}

export interface BundleOrderLine {
  vendor: string;
  inventoryItem: string;
  stockNumber?: string;
  /** Production task the purchase serves. */
  forItem?: string;
  orderQuantity?: number;
  orderUnit?: string;
  purchaseQuantity?: number;
  purchaseUnit?: string;
}

export interface BundleStaffAssignment {
  name: string;
  role?: string;
  team?: string;
  station?: string;
}

export interface BundlePayment {
  /** Calendar date, "YYYY-MM-DD". */
  date?: string;
  method?: string;
  reference?: string;
  amountCents?: number;
  note?: string;
}

export interface BundleTotals {
  chargesCents?: number;
  serviceChargeCents?: number;
  taxCents?: number;
  eventTotalCents?: number;
  perPersonCents?: number;
  balanceDueCents?: number;
  depositCents?: number;
  /** Calendar date, "YYYY-MM-DD". */
  depositDueDate?: string;
  finalBalanceDueDate?: string;
}

export interface BundleNotes {
  eventOverview?: string;
  menuNotes?: string;
  operationsNotes?: string;
  serviceSetup?: string;
  cateringKitchen?: string;
  equipmentRentals?: string;
  decor?: string;
  additionalTasks?: string;
}

export interface EventBundle {
  header: BundleHeader;
  client: BundlePerson;
  otherContacts: BundlePerson[];
  venue: BundleVenue;
  timeline: BundleTimelineEntry[];
  menu: BundleMenuItem[];
  prepTasks: BundlePrepTask[];
  packList: BundlePackListItem[];
  orderLines: BundleOrderLine[];
  staff: BundleStaffAssignment[];
  payments: BundlePayment[];
  totals: BundleTotals;
  notes: BundleNotes;
  /** Which reports contributed. */
  sources: EventBundleSource[];
  /** Anything a human should check before the bundle is entered. */
  warnings: string[];
}

/** A bundle with nothing in it, used as the merge starting point. */
export function emptyEventBundle(): EventBundle {
  return {
    header: {},
    client: {},
    otherContacts: [],
    venue: {},
    timeline: [],
    menu: [],
    prepTasks: [],
    packList: [],
    orderLines: [],
    staff: [],
    payments: [],
    totals: {},
    notes: {},
    sources: [],
    warnings: [],
  };
}

/** What one report contributes. Every field is optional by design. */
export type EventBundlePart = Partial<Omit<EventBundle, "sources">> & {
  source: EventBundleSource;
};
