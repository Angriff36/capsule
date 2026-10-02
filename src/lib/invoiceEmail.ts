// The first email a client gets with an invoice (PL-OUTBOUND, AC-107): the
// invoice PDF and the balance, with no payment link — online card payment is
// not switched on yet. Payment reminders use invoiceReminderEmail.ts.

export interface InvoiceEmailInput {
  companyName: string;
  companyAddress?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  clientName: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  dueDate: number | null;
  eventTitle?: string | null;
}

/** Named on every send record. Raise the version when the wording or layout
 * of the email or its PDF changes, so a record says which one a client got. */
export const INVOICE_EMAIL_TEMPLATE = {
  id: "invoice",
  version: 1,
} as const;

export interface RenderedInvoiceEmail {
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

const normalizeColor = (value: unknown, fallback: string): string => {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/iu.test(candidate)
    ? candidate.toUpperCase()
    : fallback;
};

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const dateText = (value: number) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function renderInvoiceEmail(
  input: InvoiceEmailInput,
): RenderedInvoiceEmail {
  const primary = normalizeColor(input.primaryColor, "#233E35");
  const accent = normalizeColor(input.accentColor, "#BE773F");
  const companyName = input.companyName.trim() || "Catering company";
  const eventTitle = input.eventTitle?.trim() || null;
  const subject = eventTitle
    ? `Invoice ${input.invoiceNumber} for ${eventTitle}`
    : `Invoice ${input.invoiceNumber} from ${companyName}`;
  const paidInFull = input.amountDue <= 0;
  const lead = paidInFull
    ? `Your invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is attached for your records. It is paid in full — thank you.`
    : `Your invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is attached. The balance due is <strong>${escapeHtml(usd(input.amountDue))}</strong>.`;
  const leadText = paidInFull
    ? `Your invoice ${input.invoiceNumber} is attached for your records. It is paid in full — thank you.`
    : `Your invoice ${input.invoiceNumber} is attached. The balance due is ${usd(input.amountDue)}.`;
  const rows: Array<[string, string]> = [
    ["Invoice total", usd(input.total)],
    ["Balance due", usd(Math.max(0, input.amountDue))],
  ];
  if (input.dueDate != null && !paidInFull) {
    rows.unshift(["Due date", dateText(input.dueDate)]);
  }
  const address = input.companyAddress?.trim()
    ? escapeHtml(input.companyAddress).replaceAll("\n", "<br />")
    : "";
  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#6B675F;font-size:12px;">${escapeHtml(label)}</td><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#242B27;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(value)}</td></tr>`,
    )
    .join("\n              ");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background:#F3F0E9;color:#242B27;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F0E9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#FFFFFF;border:1px solid #DDD7CA;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(35,62,53,0.12);">
          <tr><td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:${primary};padding:30px 34px;color:#FFFFFF;">
            <p style="margin:0 0 22px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(companyName)}</p>
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">Invoice</p>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;line-height:37px;">${escapeHtml(subject)}</h1>
          </td></tr>
          <tr><td style="padding:32px 34px 34px;">
            <p style="margin:0 0 18px;color:#4E554F;font-size:15px;line-height:24px;">Hello ${escapeHtml(input.clientName)},</p>
            <p style="margin:0;color:#4E554F;font-size:15px;line-height:24px;">${lead} Reply to this email with any questions.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">
              ${rowHtml}
            </table>
          </td></tr>
          <tr><td style="border-top:1px solid #E7E2D8;padding:22px 34px 26px;color:#77736A;font-size:11px;line-height:18px;">
            ${address ? `<div>${address}</div>` : `<div>${escapeHtml(companyName)}</div>`}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    companyName,
    subject,
    `Hello ${input.clientName},`,
    `${leadText} Reply to this email with any questions.`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    input.companyAddress?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
