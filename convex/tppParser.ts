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
 * Generate record counts summary
 */
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
