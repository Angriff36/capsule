import { reminderOffsetLabel } from "./invoiceReminderSchedule";

export interface InvoiceReminderEmailInput {
  companyName: string;
  companyAddress?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  clientName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: number;
  offsetDays: number;
  paymentUrl: string;
}

export interface RenderedInvoiceReminderEmail {
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

function subjectFor(input: InvoiceReminderEmailInput): string {
  if (input.offsetDays === 0) {
    return `Invoice ${input.invoiceNumber} is due today`;
  }
  if (input.offsetDays > 0) {
    return `Invoice ${input.invoiceNumber} is due in ${input.offsetDays} day${input.offsetDays === 1 ? "" : "s"}`;
  }
  const overdueDays = Math.abs(input.offsetDays);
  return `Invoice ${input.invoiceNumber} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

export function renderInvoiceReminderEmail(
  input: InvoiceReminderEmailInput,
): RenderedInvoiceReminderEmail {
  const primary = normalizeColor(input.primaryColor, "#233E35");
  const accent = normalizeColor(input.accentColor, "#BE773F");
  const subject = subjectFor(input);
  const companyName = input.companyName.trim() || "Catering company";
  const summary = `${usd(input.amountDue)} remains due ${reminderOffsetLabel(input.offsetDays)}.`;
  const address = input.companyAddress?.trim()
    ? escapeHtml(input.companyAddress).replaceAll("\n", "<br />")
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background:#F3F0E9;color:#242B27;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(summary)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F0E9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#FFFFFF;border:1px solid #DDD7CA;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(35,62,53,0.12);">
          <tr><td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:${primary};padding:30px 34px;color:#FFFFFF;">
            <p style="margin:0 0 22px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(companyName)}</p>
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">Invoice reminder</p>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;line-height:37px;">${escapeHtml(subject)}</h1>
          </td></tr>
          <tr><td style="padding:32px 34px 14px;">
            <p style="margin:0 0 18px;color:#4E554F;font-size:15px;line-height:24px;">Hello ${escapeHtml(input.clientName)},</p>
            <p style="margin:0;color:#4E554F;font-size:15px;line-height:24px;">This is a friendly reminder that <strong>${escapeHtml(usd(input.amountDue))}</strong> remains due on invoice <strong>${escapeHtml(input.invoiceNumber)}</strong>. A current PDF copy is attached.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">
              <tr><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#6B675F;font-size:12px;">Due date</td><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#242B27;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(dateText(input.dueDate))}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#6B675F;font-size:12px;">Balance due</td><td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#242B27;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(usd(input.amountDue))}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 34px 34px;">
            <a href="${escapeHtml(input.paymentUrl)}" style="display:inline-block;background:${accent};border-radius:999px;color:#FFFFFF;font-size:13px;font-weight:700;line-height:18px;padding:13px 22px;text-decoration:none;">Pay invoice securely</a>
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
    `This is a friendly reminder that ${usd(input.amountDue)} remains due on invoice ${input.invoiceNumber}. A current PDF copy is attached.`,
    `Due date: ${dateText(input.dueDate)}`,
    `Pay invoice securely: ${input.paymentUrl}`,
    input.companyAddress?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
