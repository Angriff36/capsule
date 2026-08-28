import type { Doc } from "../../lib/api";

type Props = { client?: Doc<"clients"> };

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 text-base text-ink">{value}</p>
    </div>
  );
}

function postalAddress(client: Doc<"clients">): string {
  const street = [client.addressLine1, client.addressLine2]
    .filter(Boolean)
    .join(", ");
  const locality = [client.city, client.region, client.postalCode]
    .filter(Boolean)
    .join(" ");
  return (
    [street, locality, client.countryCode].filter(Boolean).join(", ") ||
    "Not recorded"
  );
}

/**
 * Billing facts as the client record holds them. This tab reads them; the
 * client workspace owns the edits, so nothing here writes.
 */
export function EventClientBillingPanel({ client }: Props) {
  if (!client) return null;
  return (
    <section className="card p-4">
      <div className="section-rule">
        <span>Billing information</span>
        <i />
        <em>Owned by the client record</em>
      </div>
      <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
        <Fact
          label="Company"
          value={
            client.companyName ||
            [client.givenName, client.familyName].filter(Boolean).join(" ") ||
            "Not recorded"
          }
        />
        <Fact
          label="Payment terms"
          value={
            Number.isFinite(client.paymentTermsDays)
              ? `Net ${client.paymentTermsDays}`
              : "Not recorded"
          }
        />
        <Fact label="Address" value={postalAddress(client)} />
        <Fact label="Tax ID" value={client.taxId || "Not recorded"} />
        <div>
          <p className="eyebrow">Tax exempt status</p>
          <p className="mt-0.5 flex items-center gap-2 text-base text-ink">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                client.taxExempt ? "bg-ok" : "bg-line-2"
              }`}
            />
            {client.taxExempt ? "Tax exempt" : "Not tax exempt"}
          </p>
        </div>
      </div>
    </section>
  );
}
