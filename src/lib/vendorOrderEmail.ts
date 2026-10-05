// "Email this order to the vendor" (PL-ROUTE-STATES, AC-054 sweep task): the
// order a buyer sends a supplier. It lists what to bring and how much, with
// the vendor's own item number when Capsule knows it. Prices are left off:
// Capsule's prices are estimates and the vendor bills its own.

export interface VendorOrderEmailLine {
  name: string;
  itemCode: string | null;
  quantity: number;
  unit: string;
}

export interface VendorOrderEmailInput {
  companyName: string;
  companyAddress?: string | null;
  vendorName: string;
  contactName: string | null;
  orderNumber: string;
  /** Start of the week the order is for, when it is a weekly order. */
  weekStart: number | null;
  notes: string | null;
  lines: VendorOrderEmailLine[];
}

/** Named on every send record. Raise the version when the wording changes. */
export const VENDOR_ORDER_EMAIL_TEMPLATE = {
  id: "vendor-order",
  version: 1,
} as const;

export interface RenderedVendorOrderEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const quantityText = (line: VendorOrderEmailLine): string => {
  const amount = Number.isInteger(line.quantity)
    ? String(line.quantity)
    : line.quantity.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
  return `${amount} ${line.unit.replaceAll("_", " ")}`;
};

const dateText = (value: number) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function renderVendorOrderEmail(
  input: VendorOrderEmailInput,
): RenderedVendorOrderEmail {
  const subject = `Order ${input.orderNumber} from ${input.companyName}`;
  const greeting = `Hello ${input.contactName?.trim() || input.vendorName},`;
  const intro = input.weekStart
    ? `Please send the items below for the week of ${dateText(input.weekStart)}.`
    : "Please send the items below.";
  const lineText = input.lines.map(
    (line) =>
      `- ${line.name}${line.itemCode ? ` (item ${line.itemCode})` : ""}: ${quantityText(line)}`,
  );
  const text = [
    greeting,
    "",
    intro,
    "",
    `Order ${input.orderNumber}`,
    ...lineText,
    ...(input.notes?.trim() ? ["", `Notes: ${input.notes.trim()}`] : []),
    "",
    "Reply to this email to confirm or to tell us about anything you cannot send.",
    "",
    input.companyName,
    ...(input.companyAddress ? [input.companyAddress] : []),
  ].join("\n");

  const rows = input.lines
    .map(
      (line) =>
        `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(line.name)}</td>` +
        `<td style="padding:4px 12px 4px 0">${escapeHtml(line.itemCode ?? "")}</td>` +
        `<td style="padding:4px 0;text-align:right">${escapeHtml(quantityText(line))}</td></tr>`,
    )
    .join("");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p><strong>Order ${escapeHtml(input.orderNumber)}</strong></p>`,
    `<table style="border-collapse:collapse">`,
    `<tr><th style="text-align:left;padding:4px 12px 4px 0">Item</th>`,
    `<th style="text-align:left;padding:4px 12px 4px 0">Your item number</th>`,
    `<th style="text-align:right;padding:4px 0">Amount</th></tr>`,
    rows,
    `</table>`,
    input.notes?.trim()
      ? `<p>Notes: ${escapeHtml(input.notes.trim())}</p>`
      : "",
    `<p>Reply to this email to confirm or to tell us about anything you cannot send.</p>`,
    `<p>${escapeHtml(input.companyName)}${
      input.companyAddress ? `<br>${escapeHtml(input.companyAddress)}` : ""
    }</p>`,
  ].join("");

  return { subject, html, text };
}
