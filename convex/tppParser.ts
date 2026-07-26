// TPP Parser — Parse TPP event/contact/venue/menu/payment formats and map to ImportDataset field definitions.
// Handles data type conversions and field mappings defined in import-dataset.manifest.

import { v } from "convex/values";

/**
 * TPP field mapping types from ImportDataset manifest
 */
export enum TppMappingType {
  directCopy = "directCopy",
  transformValue = "transformValue",
  lookupReference = "lookupReference",
  computedField = "computedField",
  skipField = "skipField",
}

/**
 * TPP data formats by dataset type
 */
export interface TppEventRecord {
  EventID: string;
  EventName: string;
  EventType?: string;
  ServiceStyle?: string;
  EventDate: string;
  StartTime?: string;
  EndTime?: string;
  SetupTime?: string;
  TeardownTime?: string;
  GuaranteedCount?: number;
  ExpectedCount: number;
  ActualCount?: number;
  VenueID?: string;
  VenueName?: string;
  LocationAddress?: string;
  LocationCity?: string;
  LocationState?: string;
  LocationZip?: string;
  ClientID: string;
  PrimaryContactID?: string;
  SalespersonID?: string;
  TotalRevenue?: number;
  DepositAmount?: number;
  BudgetAmount?: number;
  EventStatus: string;
  Probability?: number;
  EventNotes?: string;
  SpecialRequirements?: string;
  AccessibilityNeeds?: string;
  CreatedDate?: string;
  ModifiedDate?: string;
}

export interface TppContactRecord {
  ContactID: string;
  FirstName: string;
  LastName: string;
  Email?: string;
  Phone?: string;
  Mobile?: string;
  Title?: string;
  CompanyID?: string;
  IsPrimary?: boolean;
  IsBilling?: boolean;
  Notes?: string;
  CreatedDate?: string;
}

export interface TppCompanyRecord {
  CompanyID: string;
  CompanyName: string;
  ClientType?: string;
  BillingAddress?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  TaxId?: string;
  PaymentTerms?: string;
  Notes?: string;
  CreatedDate?: string;
}

export interface TppLeadRecord {
  LeadID: string;
  OpportunityName: string;
  ClientID: string;
  PrimaryContactID?: string;
  Stage: string;
  Probability?: number;
  EstimatedValue?: number;
  EventDate?: string;
  Source?: string;
  ReferralSource?: string;
  SalespersonID?: string;
  ProposalID?: string;
  CreatedDate?: string;
  CloseDate?: string;
}

export interface TppVenueRecord {
  VenueID: string;
  VenueName: string;
  VenueType?: string;
  Address?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  Capacity?: number;
  ContactName?: string;
  ContactPhone?: string;
  ContactEmail?: string;
  AccessNotes?: string;
  CateringNotes?: string;
  LoadInInstructions?: string;
  ParkingInfo?: string;
  CreatedDate?: string;
}

export interface TppPaymentRecord {
  PaymentID: string;
  InvoiceID?: string;
  EventID?: string;
  PaymentDate: string;
  PaymentAmount: number;
  PaymentMethod: string;
  PaymentType?: string;
  Reference?: string;
  Notes?: string;
  Reconciled?: boolean;
  QuickBooksTransactionId?: string;
  CreatedDate?: string;
}

export interface TppMenuRecord {
  // The TPP dishes export (work/dishes.csv) carries no external id and no menu
  // grouping — the dish name is the only stable identity (slugified into
  // externalId). MenuItemID is kept for parity with sibling records + a future
  // real export. price_per_person / cost_per_person have no Dish field to land
  // on (Dish has no price) and are EMPTY in the source feed; they are preserved
  // on the link's rawSourceData rather than inventing a Menu+MenuDish graph.
  MenuItemID?: string;
  Name: string;
  RecipeName?: string;
  Description?: string;
  Category?: string;
  ServiceStyle?: string;
  // Free text like "75 servings" / "55 or 150 servings depending on event";
  // parsePortionSize extracts a leading int (default 1).
  PortionSizeDescription?: string;
  DietaryTags?: string;
  Allergens?: string;
  PricePerPerson?: number;
  CostPerPerson?: number;
  CreatedDate?: string;
}

/**
 * Parsed Capsule entity format
 */
export interface ParsedCapsuleEvent {
  externalId: string;
  title: string;
  occasionId?: string;
  serviceStyleId?: string;
  startsAt?: number;
  endsAt?: number;
  guaranteedHeadcount?: number;
  expectedHeadcount: number;
  actualHeadcount?: number;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  clientId: string;
  primaryContactId?: string;
  assignedToId?: string;
  quotedRevenue?: number;
  depositAmount?: number;
  budgetAmount?: number;
  stage: string;
  probability?: number;
  notes?: string;
  operationalRequirements?: string;
  accessibilityNeeds?: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ParsedCapsuleContact {
  externalId: string;
  givenName: string;
  familyName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  companyId?: string;
  isPrimary?: boolean;
  isBillingContact?: boolean;
  notes?: string;
  createdAt?: number;
}

export interface ParsedCapsuleVenue {
  externalId: string;
  name: string;
  venueType?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  capacity?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  accessNotes?: string;
  cateringNotes?: string;
  createdAt?: number;
}

export interface ParsedCapsulePayment {
  externalId: string;
  invoiceId?: string;
  eventId?: string;
  recordedAt?: number;
  amount: number;
  method: string;
  notes?: string;
}

export interface ParsedCapsuleLead {
  externalId: string;
  opportunityName: string;
  source: string;
  estimatedValue: number;
  // capture hardcodes stage "new" (no stage arg); the mapped TPP stage is
  // preserved on the link's rawSourceData for parallel-run reconciliation.
  stage: string;
  probability?: number;
  // external TPP ClientID — preserved on the link, NOT resolved at create
  // (a Lead is the pre-client inquiry; conversion is a separate operator step).
  clientId?: string;
  referralSource?: string;
  eventDate?: number;
  closeDate?: number;
}

export interface ParsedCapsuleMenu {
  externalId: string; // slugified Name (or MenuItemID when present)
  name: string;
  description?: string;
  category?: string;
  serviceStyle?: string;
  portionSize: number; // leading int from PortionSizeDescription, default 1
  portionUnit: string; // "portion"
  dietaryTags: string[];
  allergenSummary: string[]; // normalized to the AllergenCode enum
  // Raw source text preserved on the link (§6.1 "Legacy source fields are
  // visible for reconciliation") — the normalized allergenSummary / portionSize
  // alone would lose the original free text.
  rawAllergens?: string;
  rawPortionDescription?: string;
  // Preserved for fidelity (Dish has no price field); EMPTY in the real feed.
  pricePerPerson?: number;
  costPerPerson?: number;
}

/**
 * Parser result with metadata
 */
export interface ParserResult<T> {
  success: boolean;
  records: T[];
  errors: Array<{ recordIndex: number; field: string; message: string }>;
  warnings: Array<{ recordIndex: number; field: string; message: string }>;
  totalCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Date/time parsing utilities
 */
export function parseTppDateTime(
  dateStr?: string,
  timeStr?: string,
): number | undefined {
  if (!dateStr) return undefined;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;

    if (timeStr) {
      const [hours, minutes] = timeStr.split(":").map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        date.setHours(hours, minutes, 0, 0);
      }
    }

    return date.getTime();
  } catch {
    return undefined;
  }
}

/**
 * Parse money string to number
 */
export function parseTppMoney(value?: string | number): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse boolean string
 */
export function parseTppBoolean(value?: string | boolean): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (!value) return undefined;

  const lower = String(value).toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return undefined;
}

/**
 * Map TPP EventStatus to Capsule stage
 */
export function mapTppEventStage(status: string): string {
  const stageMap: Record<string, string> = {
    Quote: "quote",
    Planning: "planning",
    "Pending Approval": "pending_approval",
    Approved: "approved",
    "Sales Lock": "sales_lock",
    Executing: "executing",
    Final: "final",
    Complete: "completed",
    Cancelled: "cancelled",
    "Closed Out": "closed_out",
  };
  return stageMap[status] ?? "planning";
}

/**
 * Map TPP Lead Stage to Capsule stage
 */
export function mapTppLeadStage(stage: string): string {
  const stageMap: Record<string, string> = {
    New: "new",
    Qualified: "qualified",
    "Proposal Sent": "proposalSent",
    Negotiating: "negotiating",
  };
  return stageMap[stage] ?? "new";
}

/**
 * Map TPP PaymentMethod to Capsule method
 */
export function mapTppPaymentMethod(method: string): string {
  const methodMap: Record<string, string> = {
    "Credit Card": "card",
    Check: "check",
    Cash: "cash",
    ACH: "ach",
  };
  return methodMap[method] ?? "other";
}

/**
 * Map TPP VenueType to Capsule venueType
 */
export function mapTppVenueType(type?: string): string | undefined {
  if (!type) return undefined;

  const typeMap: Record<string, string> = {
    "On Premise": "client_site",
    "Off Premise": "banquet_hall",
    Outdoor: "outdoor",
    Office: "office",
    "Private Home": "private_home",
  };
  return typeMap[type] ?? "other";
}

/**
 * Extract a leading integer from free-text portion strings like "75 servings"
 * or "55 or 150 servings depending on event". Defaults to 1 (Dish.portionSize
 * must be > 0).
 */
export function parsePortionSize(value?: string): number {
  if (!value) return 1;
  const match = String(value).match(/\d+/);
  return match ? Math.max(1, parseInt(match[0], 10)) : 1;
}

/**
 * Normalize semicolon-separated TPP allergen display names
 * (Eggs, Shellfish, Dairy, Wheat/Gluten, Tree Nuts, ...) to the Capsule
 * AllergenCode enum (eggs, crustacean_shellfish, milk, wheat, tree_nuts, ...).
 * Unknown values are dropped (the enum is closed; do not invent codes).
 */
export function mapTppAllergens(value?: string): string[] {
  if (!value) return [];
  const map: Record<string, string> = {
    eggs: "eggs",
    milk: "milk",
    dairy: "milk",
    fish: "fish",
    shellfish: "crustacean_shellfish",
    "tree nuts": "tree_nuts",
    peanuts: "peanuts",
    wheat: "wheat",
    "wheat/gluten": "wheat",
    gluten: "wheat",
    soybeans: "soybeans",
    soy: "soybeans",
    sesame: "sesame",
  };
  const out: string[] = [];
  for (const raw of value.split(/[;,]/)) {
    const key = raw.trim().toLowerCase();
    const code = map[key];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Parse TPP Event record to Capsule format
 */
export function parseTppEvent(record: TppEventRecord): ParsedCapsuleEvent {
  const startsAt = parseTppDateTime(record.EventDate, record.StartTime);
  const endsAt = parseTppDateTime(record.EventDate, record.EndTime);

  return {
    externalId: record.EventID,
    title: record.EventName,
    occasionId: record.EventType
      ? record.EventType.toLowerCase().replace(/\s+/g, "_")
      : undefined,
    serviceStyleId: record.ServiceStyle?.toLowerCase().replace(/\s+/g, "_"),
    startsAt,
    endsAt,
    guaranteedHeadcount: record.GuaranteedCount,
    expectedHeadcount: record.ExpectedCount || 0,
    actualHeadcount: record.ActualCount,
    venueId: record.VenueID,
    venueName: record.VenueName,
    venueAddress: [
      record.LocationAddress,
      record.LocationCity,
      record.LocationState,
      record.LocationZip,
    ]
      .filter(Boolean)
      .join(", "),
    clientId: record.ClientID,
    primaryContactId: record.PrimaryContactID,
    assignedToId: record.SalespersonID,
    quotedRevenue: parseTppMoney(record.TotalRevenue),
    depositAmount: parseTppMoney(record.DepositAmount),
    budgetAmount: parseTppMoney(record.BudgetAmount),
    stage: mapTppEventStage(record.EventStatus),
    probability: record.Probability,
    notes: record.EventNotes,
    operationalRequirements: record.SpecialRequirements,
    accessibilityNeeds:
      record.AccessibilityNeeds?.split(",").map((s) => s.trim()) || [],
    createdAt: parseTppDateTime(record.CreatedDate),
    updatedAt: parseTppDateTime(record.ModifiedDate),
  };
}

/**
 * Parse TPP Contact record to Capsule format
 */
export function parseTppContact(
  record: TppContactRecord,
): ParsedCapsuleContact {
  return {
    externalId: record.ContactID,
    givenName: record.FirstName,
    familyName: record.LastName,
    email: record.Email,
    phone: record.Phone,
    mobile: record.Mobile,
    title: record.Title,
    companyId: record.CompanyID,
    isPrimary: parseTppBoolean(record.IsPrimary),
    isBillingContact: parseTppBoolean(record.IsBilling),
    notes: record.Notes,
    createdAt: parseTppDateTime(record.CreatedDate),
  };
}

/**
 * Parse TPP Venue record to Capsule format
 */
export function parseTppVenue(record: TppVenueRecord): ParsedCapsuleVenue {
  return {
    externalId: record.VenueID,
    name: record.VenueName,
    venueType: mapTppVenueType(record.VenueType),
    addressLine1: record.Address,
    city: record.City,
    region: record.State,
    postalCode: record.ZipCode,
    capacity: record.Capacity,
    contactName: record.ContactName,
    contactPhone: record.ContactPhone,
    contactEmail: record.ContactEmail,
    accessNotes: record.AccessNotes,
    cateringNotes: record.CateringNotes,
    createdAt: parseTppDateTime(record.CreatedDate),
  };
}

/**
 * Parse TPP Payment record to Capsule format
 */
export function parseTppPayment(
  record: TppPaymentRecord,
): ParsedCapsulePayment {
  return {
    externalId: record.PaymentID,
    invoiceId: record.InvoiceID,
    eventId: record.EventID,
    recordedAt: parseTppDateTime(record.PaymentDate),
    amount: parseTppMoney(record.PaymentAmount) || 0,
    method: mapTppPaymentMethod(record.PaymentMethod),
    notes: [record.Reference, record.Notes].filter(Boolean).join(" | "),
  };
}

/**
 * Parse TPP Lead record to Capsule format
 */
export function parseTppLead(record: TppLeadRecord): ParsedCapsuleLead {
  return {
    externalId: record.LeadID,
    opportunityName: record.OpportunityName,
    source: record.Source || "TPP Import",
    estimatedValue: parseTppMoney(record.EstimatedValue) ?? 0,
    stage: mapTppLeadStage(record.Stage),
    probability: record.Probability,
    clientId: record.ClientID,
    referralSource: record.ReferralSource,
    eventDate: parseTppDateTime(record.EventDate),
    closeDate: parseTppDateTime(record.CloseDate),
  };
}

/** Slugify a dish name into a stable external id (no id column in the TPP feed). */
function slugifyMenuName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || name;
}

/**
 * Parse TPP menu (dish catalog) record to Capsule Dish format.
 *
 * Accepts BOTH the PascalCase TppMenuRecord shape (parity with the other
 * datasets' interfaces) AND the literal snake_case columns of the real TPP
 * dishes.csv export (name/description/category/service_style/
 * portion_size_description/dietary_tags/allergens/price_per_person/
 * cost_per_person), so an operator can paste either form — the first present,
 * non-null key wins. Without this, a raw dishes.csv row (snake_case) would
 * surface `undefined` for every field and `name.trim()` would throw, so the
 * menus import would materialize nothing from the real feed.
 */
export function parseTppMenu(record: TppMenuRecord): ParsedCapsuleMenu {
  const r = record as unknown as Record<string, unknown>;
  const get = (...keys: string[]): unknown => {
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  const rawName = get("Name", "name");
  const name = (typeof rawName === "string" ? rawName : "").trim();
  const portionText = get(
    "PortionSizeDescription",
    "portion_size_description",
  ) as string | undefined;
  const allergenText = get("Allergens", "allergens") as string | undefined;
  const dietaryText = get("DietaryTags", "dietary_tags") as string | undefined;
  return {
    externalId:
      (get("MenuItemID", "menu_item_id") as string | undefined)?.trim() ||
      slugifyMenuName(name),
    name,
    description: get("Description", "description") as string | undefined,
    category: get("Category", "category") as string | undefined,
    serviceStyle: get("ServiceStyle", "service_style") as string | undefined,
    portionSize: parsePortionSize(portionText),
    portionUnit: "portion",
    dietaryTags: dietaryText
      ? dietaryText
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    allergenSummary: mapTppAllergens(allergenText),
    // Preserve the raw source text on the link via JSON.stringify(menu)
    // (§6.1 reconciliation visibility).
    rawAllergens: allergenText,
    rawPortionDescription: portionText,
    pricePerPerson: parseTppMoney(
      get("PricePerPerson", "price_per_person") as string | number | undefined,
    ),
    costPerPerson: parseTppMoney(
      get("CostPerPerson", "cost_per_person") as string | number | undefined,
    ),
  };
}

/**
 * Batch parse TPP events
 */
export function parseTppEvents(
  records: TppEventRecord[],
): ParserResult<ParsedCapsuleEvent> {
  const result: ParsedCapsuleEvent[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppEvent(record);

      // Validate required fields
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "EventID",
          message: "EventID is required",
        });
        return;
      }
      if (!parsed.title) {
        errors.push({
          recordIndex: index,
          field: "EventName",
          message: "EventName is required",
        });
        return;
      }
      if (!parsed.clientId) {
        errors.push({
          recordIndex: index,
          field: "ClientID",
          message: "ClientID is required",
        });
        return;
      }
      if (!parsed.expectedHeadcount) {
        warnings.push({
          recordIndex: index,
          field: "ExpectedCount",
          message: "ExpectedCount missing, defaulting to 0",
        });
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}

/**
 * Batch parse TPP contacts
 */
export function parseTppContacts(
  records: TppContactRecord[],
): ParserResult<ParsedCapsuleContact> {
  const result: ParsedCapsuleContact[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppContact(record);

      // Validate required fields
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "ContactID",
          message: "ContactID is required",
        });
        return;
      }
      if (!parsed.givenName) {
        errors.push({
          recordIndex: index,
          field: "FirstName",
          message: "FirstName is required",
        });
        return;
      }
      if (!parsed.familyName) {
        errors.push({
          recordIndex: index,
          field: "LastName",
          message: "LastName is required",
        });
        return;
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}

/**
 * Batch parse TPP venues
 */
export function parseTppVenues(
  records: TppVenueRecord[],
): ParserResult<ParsedCapsuleVenue> {
  const result: ParsedCapsuleVenue[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppVenue(record);

      // Validate required fields
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "VenueID",
          message: "VenueID is required",
        });
        return;
      }
      if (!parsed.name) {
        errors.push({
          recordIndex: index,
          field: "VenueName",
          message: "VenueName is required",
        });
        return;
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}

/**
 * Batch parse TPP payments
 */
export function parseTppPayments(
  records: TppPaymentRecord[],
): ParserResult<ParsedCapsulePayment> {
  const result: ParsedCapsulePayment[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppPayment(record);

      // Validate required fields
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "PaymentID",
          message: "PaymentID is required",
        });
        return;
      }
      if (!parsed.amount) {
        errors.push({
          recordIndex: index,
          field: "PaymentAmount",
          message: "PaymentAmount is required",
        });
        return;
      }
      if (!parsed.method) {
        errors.push({
          recordIndex: index,
          field: "PaymentMethod",
          message: "PaymentMethod is required",
        });
        return;
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}

/**
 * Batch parse TPP leads
 */
export function parseTppLeads(
  records: TppLeadRecord[],
): ParserResult<ParsedCapsuleLead> {
  const result: ParsedCapsuleLead[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppLead(record);

      // Validate required fields
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "LeadID",
          message: "LeadID is required",
        });
        return;
      }
      if (!parsed.opportunityName || !parsed.opportunityName.trim()) {
        errors.push({
          recordIndex: index,
          field: "OpportunityName",
          message: "OpportunityName is required",
        });
        return;
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}

/**
 * Batch parse TPP menus (dish catalog rows)
 */
export function parseTppMenus(
  records: TppMenuRecord[],
): ParserResult<ParsedCapsuleMenu> {
  const result: ParsedCapsuleMenu[] = [];
  const errors: Array<{ recordIndex: number; field: string; message: string }> =
    [];
  const warnings: Array<{
    recordIndex: number;
    field: string;
    message: string;
  }> = [];

  records.forEach((record, index) => {
    try {
      const parsed = parseTppMenu(record);

      // Validate required fields — the dish name is the only identity in the
      // TPP feed (no id column), so it doubles as the external id.
      if (!parsed.name || !parsed.name.trim()) {
        errors.push({
          recordIndex: index,
          field: "Name",
          message: "Name is required",
        });
        return;
      }
      if (!parsed.externalId) {
        errors.push({
          recordIndex: index,
          field: "Name",
          message: "Name is required (used as the external id)",
        });
        return;
      }

      result.push(parsed);
    } catch (error) {
      errors.push({
        recordIndex: index,
        field: "unknown",
        message:
          error instanceof Error ? error.message : "Unknown parsing error",
      });
    }
  });

  return {
    success: errors.length === 0,
    records: result,
    errors,
    warnings,
    totalCount: records.length,
    successCount: result.length,
    failureCount: errors.length,
  };
}
export function generateRecordCounts(
  results: Record<string, ParserResult<unknown>>,
): string {
  const counts: Record<string, number> = {};

  for (const [dataset, result] of Object.entries(results)) {
    counts[dataset] = result.successCount;
  }

  return JSON.stringify(counts);
}

/**
 * Schema definitions for Convex validation
 */
export const TppParseArgs = {
  importRunId: v.id("importRuns"),
  datasetType: v.string(),
  rawData: v.array(v.any()),
  actorId: v.optional(v.string()),
} as const;

export const TppValidationArgs = {
  importRunId: v.id("importRuns"),
  parsedData: v.array(v.any()),
  actorId: v.optional(v.string()),
} as const;
