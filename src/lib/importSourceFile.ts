// An old-system report file -> the rows an import run reads (PL-SOURCE-DATASETS).
// The import run read only rows pasted as a code list; the real TPP reports
// are spreadsheets with printed headings ("First Name", "Zip"). Each heading
// is matched to the dataset's documented field name (src/lib/tppFieldDisposition.ts)
// without spaces or case; a heading with no field keeps its own name, so the
// whole row is still kept on the import link as received.
import { TPP_FIELD_DISPOSITIONS } from "./tppFieldDisposition";

const DATASET_BLOCKS: Record<string, string[]> = {
  contacts: ["TPP_CONTACT_MAPPINGS", "TPP_COMPANY_MAPPINGS"],
  events: ["TPP_EVENT_MAPPINGS"],
  leads: ["TPP_LEAD_MAPPINGS"],
  venues: ["TPP_VENUE_MAPPINGS"],
  payments: ["TPP_PAYMENT_MAPPINGS"],
  history: ["TPP_HISTORY_MAPPINGS"],
};

/** Printed headings that name a documented field in other words. */
const ALIASES: Record<string, string> = {
  zip: "ZipCode",
  postalcode: "ZipCode",
  emailaddress: "Email",
  phonenumber: "Phone",
  cell: "Mobile",
  cellphone: "Mobile",
  mobilephone: "Mobile",
};

/** Contacts only: the TPP Address / Phone List prints the person's company as "Company". */
const CONTACT_ALIASES: Record<string, string> = {
  company: "CompanyName",
};

/**
 * Events only: TPP's event list report prints the event number as "Invoice
 * No" (TPP's invoice number is the event number), has no event name, and
 * names the client instead of giving its id.
 */
const EVENT_ALIASES: Record<string, string> = {
  invoiceno: "EventID",
  invoicenumber: "EventID",
  eventtitle: "EventName",
  guestcount: "ExpectedCount",
  eventtotal: "TotalRevenue",
  contactcompanyname: "ClientCompanyName",
  contactfirstname: "ClientFirstName",
  contactlastname: "ClientLastName",
  occasion: "Occasion",
  referredfrom: "ReferredFrom",
  salesperson: "SalesPersonName",
  venuestate: "LocationState",
};

/**
 * AC-057: printed headings of the real TPP Address / Phone List that have no
 * field, and why each one stays with the row on the import link as written.
 */
export const TPP_ADDRESS_LIST_KEPT: Readonly<Record<string, string>> = {
  Type: "The old client group (Social, Corporate); Capsule tells a person from a company by the row itself.",
  Inactive:
    "Every imported client starts active; the old flag stays on the import.",
  Account:
    "The old account number (on 680 of 3,314 rows); no other file uses it, so it never joins two people.",
};

const key = (heading: string) =>
  heading.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The datasets whose rows can come from a report file. */
export const datasetReadsFile = (datasetType: string) =>
  datasetType in DATASET_BLOCKS;

function fieldFor(datasetType: string): (heading: string) => string | null {
  const fields = new Map<string, string>();
  for (const block of DATASET_BLOCKS[datasetType] ?? [])
    for (const field of Object.keys(TPP_FIELD_DISPOSITIONS[block] ?? {}))
      fields.set(key(field), field);
  const aliases = {
    ...ALIASES,
    ...(datasetType === "contacts" ? CONTACT_ALIASES : {}),
    ...(datasetType === "events" ? EVENT_ALIASES : {}),
  };
  return (heading) => {
    const plain = key(heading);
    return fields.get(plain) ?? aliases[plain] ?? null;
  };
}

export type SourceFileRows = {
  rows: Record<string, string>[];
  /** Printed heading -> the field it fills. */
  matched: { heading: string; field: string }[];
  /** Headings with no field: kept on the import as written. */
  keptAsWritten: string[];
};

/**
 * Rows of a report grid keyed by field name. The heading row is the first of
 * the top ten rows where two or more headings name a field; blank rows are
 * left out.
 */
export function sourceRowsFromGrid(
  grid: ReadonlyArray<ReadonlyArray<string>>,
  datasetType: string,
): SourceFileRows {
  const fieldOf = fieldFor(datasetType);
  const headerIndex = grid
    .slice(0, 10)
    .findIndex(
      (cells) => cells.filter((cell) => fieldOf(cell) != null).length >= 2,
    );
  if (headerIndex < 0) return { rows: [], matched: [], keptAsWritten: [] };
  const headings = grid[headerIndex]!.map((cell) => cell.trim());
  const names = headings.map((heading) => fieldOf(heading) ?? heading);
  const rows: Record<string, string>[] = [];
  for (const cells of grid.slice(headerIndex + 1)) {
    if (!cells.some((cell) => cell.trim() !== "")) continue;
    const row: Record<string, string> = {};
    names.forEach((name, index) => {
      const value = (cells[index] ?? "").trim();
      if (name && value) row[name] = value;
    });
    rows.push(row);
  }
  return {
    rows,
    matched: headings.flatMap((heading) => {
      const field = fieldOf(heading);
      return field ? [{ heading, field }] : [];
    }),
    keptAsWritten: headings.filter(
      (heading) => heading && fieldOf(heading) == null,
    ),
  };
}
