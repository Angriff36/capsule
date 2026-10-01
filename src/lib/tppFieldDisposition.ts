// PL-SOURCE-DATASETS (AC-057, AC-274, AC-281, AC-374): where each field of the
// documented TPP field maps (src/import/import-dataset.manifest, the
// TPP_*_MAPPINGS blocks) lands in Capsule. Every documented field is either
// written to a Capsule record field, or kept on the import link (the row as
// received) with the reason it is not on the record. Nothing here may name a
// TPP field the documented map does not have; tests/tpp-mapping-doc-parity.test.ts
// holds the two lists together.

export type FieldDisposition =
  { to: "record"; entity: string; field: string } | { to: "link"; why: string };

type DatasetDispositions = Record<string, FieldDisposition>;

const rec = (entity: string, field: string): FieldDisposition => ({
  to: "record",
  entity,
  field,
});
const link = (why: string): FieldDisposition => ({ to: "link", why });

const OLD_ID = link("The old system's id is the import link's source id.");
const OLD_DATES = link(
  "Capsule stamps its own created and changed times; the old dates stay on the import.",
);

const EVENT: DatasetDispositions = {
  EventID: OLD_ID,
  EventName: rec("Event", "title"),
  EventType: rec("Event", "eventType"),
  ServiceStyle: rec("Event", "serviceStyleId"),
  EventDate: rec("Event", "startsAt"),
  StartTime: rec("Event", "startsAt"),
  EndTime: rec("Event", "endsAt"),
  SetupTime: link(
    "Capsule plans setup time from its own timing rules; the old setup time stays on the import for checking.",
  ),
  TeardownTime: link(
    "Capsule plans clean-up time from its own timing rules; the old time stays on the import for checking.",
  ),
  GuaranteedCount: link(
    "An event has one planned guest count in Capsule; the guaranteed count stays on the import.",
  ),
  ExpectedCount: rec("Event", "expectedHeadcount"),
  ActualCount: link(
    "Actual guests are counted at closeout; the old count stays on the import.",
  ),
  VenueID: rec("Event", "venueId"),
  VenueName: rec("Event", "venueName"),
  LocationAddress: rec("Event", "venueAddress"),
  LocationCity: rec("Event", "venueAddress"),
  LocationState: rec("Event", "venueAddress"),
  LocationZip: rec("Event", "venueAddress"),
  ClientID: rec("Event", "clientId"),
  PrimaryContactID: link(
    "The event's contact name comes from its imported client; the old contact id stays on the import.",
  ),
  SalespersonID: link(
    "Old salesperson ids are not Capsule people; the id stays on the import until the staff list is matched.",
  ),
  TotalRevenue: rec("Event", "quotedPrice"),
  DepositAmount: link(
    "A deposit is a payment on an invoice in Capsule; the old amount stays on the import as a reference.",
  ),
  BudgetAmount: rec("Event", "budgetAmount"),
  EventStatus: link(
    "Kept word for word for the side-by-side check; a Capsule event changes stage only through its own steps.",
  ),
  Probability: link(
    "Chance of booking belongs to the lead, not the event; it stays on the import.",
  ),
  EventNotes: rec("Event", "operationalRequirements"),
  SpecialRequirements: rec("Event", "operationalRequirements"),
  AccessibilityNeeds: rec("Event", "accessibilityNeeds"),
  CreatedDate: OLD_DATES,
  ModifiedDate: OLD_DATES,
};

const CONTACT: DatasetDispositions = {
  ContactID: OLD_ID,
  FirstName: rec("Client", "givenName"),
  LastName: rec("Client", "familyName"),
  Email: rec("Client", "email"),
  Phone: rec("Client", "phone"),
  Mobile: rec("Client", "phone"),
  Title: rec("Client", "notes"),
  CompanyID: rec("Client", "companyName"),
  IsPrimary: link(
    "Each imported contact is its own client; the primary flag stays on the import.",
  ),
  IsBilling: link(
    "Each imported contact is its own client; the billing flag stays on the import.",
  ),
  Notes: rec("Client", "notes"),
  CreatedDate: OLD_DATES,
  Address: rec("Client", "addressLine1"),
  City: rec("Client", "city"),
  State: rec("Client", "region"),
  ZipCode: rec("Client", "postalCode"),
  Birthday: rec("Client", "birthday"),
};

const COMPANY: DatasetDispositions = {
  CompanyID: OLD_ID,
  CompanyName: rec("Client", "companyName"),
  ClientType: link(
    "A company row is always a company client; the old client type stays on the import.",
  ),
  BillingAddress: rec("Client", "addressLine1"),
  City: rec("Client", "city"),
  State: rec("Client", "region"),
  ZipCode: rec("Client", "postalCode"),
  TaxId: rec("Client", "taxId"),
  PaymentTerms: rec("Client", "paymentTermsDays"),
  Notes: rec("Client", "notes"),
  CreatedDate: OLD_DATES,
};

const LEAD: DatasetDispositions = {
  LeadID: OLD_ID,
  OpportunityName: rec("Lead", "companyName"),
  ClientID: rec("Lead", "notes"),
  PrimaryContactID: link(
    "A lead links to its client contact when it is converted; the old id stays on the import.",
  ),
  Stage: rec("Lead", "sourceStage"),
  Probability: rec("Lead", "probability"),
  EstimatedValue: rec("Lead", "estimatedValue"),
  EventDate: rec("Lead", "eventDate"),
  Source: rec("Lead", "source"),
  ReferralSource: link(
    "Old referral names are not matched to Capsule referral sources yet; the name stays on the import.",
  ),
  SalespersonID: link(
    "Old salesperson ids are not Capsule people; the id stays on the import until the staff list is matched.",
  ),
  ProposalID: link(
    "Old proposals are not imported; the id stays on the import.",
  ),
  CreatedDate: OLD_DATES,
  CloseDate: rec("Lead", "closedAt"),
};

const VENUE: DatasetDispositions = {
  VenueID: OLD_ID,
  VenueName: rec("Venue", "name"),
  VenueType: rec("Venue", "venueType"),
  Address: rec("Venue", "addressLine1"),
  City: rec("Venue", "city"),
  State: rec("Venue", "region"),
  ZipCode: rec("Venue", "postalCode"),
  Capacity: rec("Venue", "capacity"),
  ContactName: rec("Venue", "contactName"),
  ContactPhone: rec("Venue", "contactPhone"),
  ContactEmail: rec("Venue", "contactEmail"),
  AccessNotes: rec("Venue", "accessNotes"),
  CateringNotes: rec("Venue", "cateringNotes"),
  LoadInInstructions: rec("Venue", "loadInInstructions"),
  ParkingInfo: rec("Venue", "logisticsNotes"),
  CreatedDate: OLD_DATES,
};

const PAYMENT_REFERENCE = link(
  "Imported payments are references a person matches to a Capsule payment; the old row is kept as received.",
);
const PAYMENT: DatasetDispositions = Object.fromEntries(
  [
    "PaymentID",
    "InvoiceID",
    "EventID",
    "PaymentDate",
    "PaymentAmount",
    "PaymentMethod",
    "PaymentType",
    "Reference",
    "Notes",
    "Reconciled",
    "QuickBooksTransactionId",
    "CreatedDate",
  ].map((field) => [field, PAYMENT_REFERENCE]),
);

const HISTORY: DatasetDispositions = {
  HistoryID: OLD_ID,
  ContactID: rec("ClientCommunication", "clientId"),
  CompanyID: rec("ClientCommunication", "clientId"),
  EventID: rec("ClientCommunication", "eventId"),
  HistoryDate: rec("ClientCommunication", "occurredAt"),
  HistoryType: rec("ClientCommunication", "medium"),
  Subject: rec("ClientCommunication", "summary"),
  Notes: rec("ClientCommunication", "summary"),
  CreatedBy: rec("ClientCommunication", "authorName"),
  DueDate: rec("ClientCommunication", "dueAt"),
  CompletedDate: rec("ClientCommunication", "completedAt"),
  Status: rec("ClientCommunication", "taskDone"),
};

/** Keyed by the documented block name in import-dataset.manifest. */
export const TPP_FIELD_DISPOSITIONS: Record<string, DatasetDispositions> = {
  TPP_EVENT_MAPPINGS: EVENT,
  TPP_CONTACT_MAPPINGS: CONTACT,
  TPP_COMPANY_MAPPINGS: COMPANY,
  TPP_LEAD_MAPPINGS: LEAD,
  TPP_VENUE_MAPPINGS: VENUE,
  TPP_PAYMENT_MAPPINGS: PAYMENT,
  TPP_HISTORY_MAPPINGS: HISTORY,
};
