/**
 * PL-INBOX: every company's Capsule inbox address for client emails is
 * "<company key>@<RESEND_INBOUND_DOMAIN>". Nothing is set up per company;
 * with no receiving domain, client emails are not set up and there is none.
 */
export function inboundDomain(): string | null {
  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim()
    .replace(/^@/, "")
    .toLowerCase();
  return domain || null;
}

/** The part before the @ for a company: its company key, in safe letters. */
export function inboxLocalPart(tenantId: string): string {
  return tenantId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The company's Capsule inbox address, or null when email in is not set up. */
export function companyInboxAddress(tenantId: string): string | null {
  const domain = inboundDomain();
  const local = inboxLocalPart(tenantId);
  return domain && local ? `${local}@${domain}` : null;
}
