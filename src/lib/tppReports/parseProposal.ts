import type {
  BundleMenuItem,
  BundlePayment,
  BundlePerson,
  BundleTotals,
  EventBundlePart,
} from "./eventBundle";
import { findLabelledValue } from "./csvRows";
import {
  parseAddressBlob,
  parseCount,
  parseEmail,
  parseMoneyCents,
  parsePhone,
  splitNameAndEmail,
  parseReportDate,
} from "./reportValues";

/**
 * Parses the TPP proposal — the client-facing, priced view of the event.
 *
 * It is the only report that carries money, the payment history, and the
 * secondary contacts. The contract prose at the end is not extracted.
 */

/**
 * Roles TPP prints in the "Other Contacts" blob, which has no separators.
 * The longer "Mother of Groom" form is listed first so it wins over "Groom".
 */
const CONTACT_ROLES =
  /(?:Mother of [A-Za-z]+|Father of [A-Za-z]+|Groom|Bride|Photographer|Photos|Planner|Coordinator|Venue|DJ|Officiant|Baker|Florist|Cake|Rentals)(?=\s*[-:])/g;

/** Cut the blob at each role word. Split with a lookahead is unreliable here. */
function splitAtRoles(blob: string): string[] {
  const starts: number[] = [];
  for (const match of blob.matchAll(CONTACT_ROLES)) {
    const start = match.index;
    // Skip a role word that belongs to the role before it, as the "Groom" in
    // "Mother of Groom".
    if (blob.slice(Math.max(0, start - 3), start).toLowerCase() === "of ") {
      continue;
    }
    starts.push(start);
  }
  if (starts.length === 0) return [blob];

  return starts.map((start, index) =>
    blob.slice(start, starts[index + 1] ?? blob.length).trim(),
  );
}

const PRICE_ROW_HEADER = "Qty";

function readOtherContacts(blob: string | undefined): BundlePerson[] {
  if (blob === undefined || blob.trim().length === 0) return [];

  return splitAtRoles(blob)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const role = segment.split(/\s*-\s*/)[0]?.trim();
      const email = parseEmail(segment);
      const phone = parsePhone(
        segment.match(/(?:Cell|Home|Work|Phone)\s*:\s*([\d()\-. ]{7,})/i)?.[1],
      );
      const afterRole = segment
        .slice(role?.length ?? 0)
        .replace(/^\s*-\s*/, "");
      const named = splitNameAndEmail(afterRole);

      const person: BundlePerson = {};
      if (role) person.role = role;
      if (named.name !== undefined) person.name = named.name;
      if (email) person.email = email;
      if (phone) person.phone = phone;
      return person;
    })
    .filter(
      (person) => person.name !== undefined || person.email !== undefined,
    );
}

/**
 * Priced line items, which repeat the menu with money attached.
 * A row is "98, Guacamole and Salsa Bar, T,S, $4.95, $485.10".
 */
function readPricedItems(rows: readonly string[][]): BundleMenuItem[] {
  const items: BundleMenuItem[] = [];
  let active = false;

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    if (first === PRICE_ROW_HEADER) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (/subtotal/i.test(row[1] ?? "")) {
      active = false;
      continue;
    }

    const quantity = parseCount(first);
    const name = (row[1] ?? "").trim();
    if (quantity === undefined || name.length === 0) continue;

    const money = row
      .slice(2)
      .map((cell) => parseMoneyCents(cell))
      .filter((cents): cents is number => cents !== undefined);
    const item: BundleMenuItem = { name, quantityServings: quantity };
    if (money.length > 0) item.unitPriceCents = money[0];
    if (money.length > 1) item.totalPriceCents = money.at(-1);
    items.push(item);
  }
  return items;
}

function readPayments(rows: readonly string[][]): BundlePayment[] {
  const payments: BundlePayment[] = [];
  let active = false;

  for (const row of rows) {
    if (
      (row[0] ?? "").trim() === "Date" &&
      (row[1] ?? "").trim() === "Method"
    ) {
      active = true;
      continue;
    }
    if (!active) continue;
    const date = parseReportDate(row[0]);
    if (date === undefined) {
      if ((row[0] ?? "").trim().length > 0) active = false;
      continue;
    }

    const payment: BundlePayment = { date };
    const method = (row[1] ?? "").trim();
    if (method.length > 0) payment.method = method;
    const reference = (row[2] ?? "").trim();
    if (reference.length > 0) payment.reference = reference;
    const note = (row[3] ?? "").trim();
    if (note.length > 0) payment.note = note;
    const amount = parseMoneyCents(row.at(-1));
    if (amount !== undefined) payment.amountCents = amount;
    payments.push(payment);
  }
  return payments;
}

function readTotals(rows: readonly string[][]): BundleTotals {
  const label = (name: string) => findLabelledValue(rows, name);
  const money = (name: string) => parseMoneyCents(label(name));

  const serviceChargeRow = rows.find((row) =>
    /service charge/i.test(row[0] ?? ""),
  );
  const taxRow = rows.find((row) => /sales tax/i.test(row[0] ?? ""));

  return {
    chargesCents: money("Charges"),
    serviceChargeCents: parseMoneyCents(serviceChargeRow?.[1]),
    taxCents: parseMoneyCents(taxRow?.[1]),
    eventTotalCents: money("Event Total") ?? money("Post-Tax Subtotal"),
    perPersonCents: money("Per Person"),
    balanceDueCents: money("Balance Due"),
    depositCents: money("Deposit Amount") ?? money("Deposit"),
    depositDueDate: parseReportDate(label("Deposit Due")),
    finalBalanceDueDate: parseReportDate(label("Final Balance Due")),
  };
}

/** Parse a proposal CSV into its bundle contribution. */
export function parseProposal(rows: string[][]): EventBundlePart {
  const label = (name: string) => findLabelledValue(rows, name);
  const clientAddress = parseAddressBlob(label("Address"));
  const venueBlob = label("Venue");
  const venueName = venueBlob?.split(/\s*\d/)[0]?.trim();
  const venueAddress = parseAddressBlob(
    venueName === undefined ? venueBlob : venueBlob?.slice(venueName.length),
  );
  const salesperson = splitNameAndEmail(label("Salesperson"));

  return {
    source: "proposal",
    header: {
      invoiceNumber: label("Invoice #") ?? label("Contract #"),
      title: label("Event Title"),
      eventDate: parseReportDate(label("Event Date")),
      guestCount: parseCount(label("Guest Count")),
      serviceStyle: label("Service Style"),
      occasion: label("Occasion"),
      eventType: label("Event Type"),
      salespersonName: salesperson.name,
      salespersonEmail: salesperson.email,
    },
    client: {
      name: label("Prepared For"),
      email: parseEmail(label("Email")),
      phone: parsePhone(label("Phone")),
      addressLine1: clientAddress?.addressLine1,
      city: clientAddress?.city,
      region: clientAddress?.region,
      postalCode: clientAddress?.postalCode,
    },
    otherContacts: readOtherContacts(label("Other Contacts")),
    venue: {
      name: venueName,
      addressLine1: venueAddress?.addressLine1,
      city: venueAddress?.city,
      region: venueAddress?.region,
      postalCode: venueAddress?.postalCode,
    },
    menu: readPricedItems(rows),
    payments: readPayments(rows),
    totals: readTotals(rows),
  };
}
