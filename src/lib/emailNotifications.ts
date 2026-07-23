export const EMAIL_NOTIFICATION_CATEGORIES = [
  "event_updates",
  "invoice_reminders",
  "low_stock_alerts",
  "shift_changes",
] as const;

export type EmailNotificationCategory =
  (typeof EMAIL_NOTIFICATION_CATEGORIES)[number];

export interface EmailNotificationPreferences {
  eventUpdates?: boolean | null;
  invoiceReminders?: boolean | null;
  lowStockAlerts?: boolean | null;
  shiftChanges?: boolean | null;
}

export interface EmailNotificationBranding {
  displayName: string;
  address?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}

export interface EmailSummaryItem {
  label: string;
  value: string;
}

export interface EmailNotificationSummaryInput {
  category: EmailNotificationCategory;
  title: string;
  summary: string;
  actionLabel: string;
  deepLinkPath: string;
  appOrigin: string;
  branding: EmailNotificationBranding;
  items?: readonly EmailSummaryItem[];
}

export interface RenderedEmailNotification {
  subject: string;
  html: string;
  text: string;
  deepLink: string;
}

export const EMAIL_NOTIFICATION_CATEGORY_DETAILS: Record<
  EmailNotificationCategory,
  {
    label: string;
    description: string;
    cadence: string;
    preferenceField: keyof EmailNotificationPreferences;
  }
> = {
  event_updates: {
    label: "Event updates",
    description: "Stage changes, approvals, and important event edits.",
    cadence: "As events change",
    preferenceField: "eventUpdates",
  },
  invoice_reminders: {
    label: "Invoice reminders",
    description: "Due dates, overdue balances, and payment follow-ups.",
    cadence: "When action is due",
    preferenceField: "invoiceReminders",
  },
  low_stock_alerts: {
    label: "Low-stock alerts",
    description: "Ingredients that fall below their operating threshold.",
    cadence: "When stock runs low",
    preferenceField: "lowStockAlerts",
  },
  shift_changes: {
    label: "Shift changes",
    description: "Schedule changes, conflicts, and reassignment notices.",
    cadence: "As schedules move",
    preferenceField: "shiftChanges",
  },
};

/** Missing preference rows and fields preserve the existing default: subscribed. */
export function isEmailNotificationSubscribed(
  preferences: EmailNotificationPreferences | null | undefined,
  category: EmailNotificationCategory,
): boolean {
  if (!preferences) return true;
  const field = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category].preferenceField;
  return preferences[field] !== false;
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
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
};

export function resolveEmailDeepLink(
  appOrigin: string,
  deepLinkPath: string,
): string {
  const origin = new URL(appOrigin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new TypeError("Email links require an HTTP(S) application origin.");
  }
  if (
    !deepLinkPath.startsWith("/") ||
    deepLinkPath.startsWith("//") ||
    deepLinkPath.includes("\\")
  ) {
    throw new TypeError("Email deep links must be app-relative paths.");
  }
  const target = new URL(deepLinkPath, origin.origin);
  if (target.origin !== origin.origin) {
    throw new TypeError(
      "Email deep links must stay on the application origin.",
    );
  }
  return target.toString();
}

export function renderEmailNotificationSummary(
  input: EmailNotificationSummaryInput,
): RenderedEmailNotification {
  const primary = normalizeColor(input.branding.primaryColor, "#233E35");
  const accent = normalizeColor(input.branding.accentColor, "#BE773F");
  const company = input.branding.displayName.trim() || "Catering company";
  const category = EMAIL_NOTIFICATION_CATEGORY_DETAILS[input.category];
  const deepLink = resolveEmailDeepLink(input.appOrigin, input.deepLinkPath);
  const preferencesLink = resolveEmailDeepLink(
    input.appOrigin,
    "/settings/email",
  );
  const rows = (input.items ?? [])
    .slice(0, 8)
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#6B675F;font-size:12px;line-height:18px;">${escapeHtml(label)}</td>
          <td style="padding:12px 0;border-bottom:1px solid #E7E2D8;color:#242B27;font-size:13px;font-weight:700;line-height:18px;text-align:right;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  const address = input.branding.address?.trim()
    ? escapeHtml(input.branding.address).replaceAll("\n", "<br />")
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
  <body style="margin:0;background:#F3F0E9;color:#242B27;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.summary)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F0E9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#FFFFFF;border:1px solid #DDD7CA;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(35,62,53,0.12);">
          <tr><td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:${primary};padding:30px 34px;color:#FFFFFF;">
            <p style="margin:0 0 22px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFFFFF;">${escapeHtml(company)}</p>
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">${escapeHtml(category.label)}</p>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;line-height:37px;color:#FFFFFF;">${escapeHtml(input.title)}</h1>
          </td></tr>
          <tr><td style="padding:32px 34px 14px;">
            <p style="margin:0;color:#4E554F;font-size:15px;line-height:24px;">${escapeHtml(input.summary)}</p>
            ${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">${rows}</table>` : ""}
          </td></tr>
          <tr><td style="padding:20px 34px 34px;">
            <a href="${escapeHtml(deepLink)}" style="display:inline-block;background:${accent};border-radius:999px;color:#FFFFFF;font-size:13px;font-weight:700;line-height:18px;padding:13px 22px;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>
          </td></tr>
          <tr><td style="border-top:1px solid #E7E2D8;padding:22px 34px 26px;color:#77736A;font-size:11px;line-height:18px;">
            ${address ? `<div style="margin-bottom:8px;">${address}</div>` : ""}
            <div>You receive this category because it is enabled in Capsule. <a href="${escapeHtml(preferencesLink)}" style="color:${primary};font-weight:700;">Choose which emails you receive</a>.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const textRows = (input.items ?? [])
    .slice(0, 8)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
  const text = [
    company,
    category.label,
    input.title,
    input.summary,
    textRows,
    `${input.actionLabel}: ${deepLink}`,
    `Email preferences: ${preferencesLink}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: `${company}: ${input.title}`,
    html,
    text,
    deepLink,
  };
}
