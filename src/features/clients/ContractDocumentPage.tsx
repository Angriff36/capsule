import type { CSSProperties, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGetClient,
  useGetContract,
  useGetEvent,
} from "../../lib/manifest-convex-react";
import { formatDate, formatMoney, formatTime } from "../../lib/format";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { useTenantBranding } from "../admin/tenantBranding";

// ponytail: browser print → "Save as PDF" instead of a PDF library; add
// @react-pdf/renderer only if programmatic PDF bytes (email attachment) land.
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  .contract-document, .contract-document * { visibility: visible; }
  .contract-document { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  .contract-no-print { display: none !important; }
}
`;

const clientLabel = (row: {
  clientType?: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}) => {
  if (row.clientType === "person") {
    return `${row.givenName ?? ""} ${row.familyName ?? ""}`.trim() || "Client";
  }
  return row.companyName?.trim() || "Client";
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="border-b border-line-2 pb-1 text-[13px] font-semibold uppercase tracking-wide">
        {label}
      </h2>
      <div className="mt-2 text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-44 shrink-0 text-ink-2">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SignatureBlock({
  role,
  name,
  signedAt,
}: {
  role: string;
  name?: string | null;
  signedAt?: number | null;
}) {
  return (
    <div className="mt-6">
      <p className="text-[12px] uppercase tracking-wide text-ink-2">{role}</p>
      <div className="mt-8 border-b border-ink" />
      <div className="mt-1 flex justify-between text-[12px]">
        <span>Signature{name ? `: ${name}` : ""}</span>
        <span>Date{signedAt != null ? `: ${formatDate(signedAt)}` : ""}</span>
      </div>
      <div className="mt-6 border-b border-ink" />
      <p className="mt-1 text-[12px]">Printed name</p>
    </div>
  );
}

/** Print-ready contract document — Export PDF uses the browser print dialog. */
export function ContractDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { branding, loading: brandingLoading } = useTenantBranding();
  const contract = useGetContract(id ?? "skip");
  const event = useGetEvent(
    contract?.eventId ? String(contract.eventId) : "skip",
  );
  const client = useGetClient(
    contract?.clientId ? String(contract.clientId) : "skip",
  );

  if (!id) {
    return (
      <ErrorState
        title="Contract not found"
        detail="The address is missing a contract id."
      />
    );
  }
  if (contract === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <TableSkeleton rows={6} />
      </div>
    );
  }
  if (contract === null) {
    return (
      <ErrorState
        title="Contract not found"
        detail="This contract is missing or belongs to another tenant."
      />
    );
  }

  const loadingRelated =
    event === undefined || client === undefined || brandingLoading;
  const clientAddress = client
    ? [
        client.addressLine1,
        client.addressLine2,
        [client.city, client.region, client.postalCode]
          .filter(Boolean)
          .join(", "),
        client.countryCode,
      ]
        .filter((part) => part && String(part).trim().length > 0)
        .join(" · ")
    : "";
  const signed = String(contract.status) === "signed";

  return (
    <div className="operations-stage supply-stage">
      <style>{PRINT_STYLE}</style>
      <header className="supply-masthead contract-no-print">
        <div>
          <p className="eyebrow">Clients · Contracts · Document</p>
          <h1 className="display-title mt-2">Contract document</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Review the agreement, then export it as a PDF (choose “Save as PDF”
            in the print dialog). Send it to your client for signature, then log
            the signature when it comes back.
          </p>
        </div>
        <div className="supply-row-actions">
          <Link className="btn btn-ghost" to={CLIENTS_ROUTES.contracts}>
            Back to contracts
          </Link>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => window.print()}
          >
            Export PDF
          </button>
        </div>
      </header>

      <article
        className="contract-document mx-auto mt-6 max-w-200 bg-white p-8 text-ink"
        style={
          {
            "--document-primary": branding.primaryColor,
            "--document-accent": branding.accentColor,
          } as CSSProperties
        }
      >
        <header className="mb-8 flex items-start justify-between gap-6 border-b-2 border-[var(--document-primary)] pb-5">
          <div>
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                className="mb-3 max-h-13 max-w-44 object-contain object-left"
              />
            ) : null}
            <p className="font-display text-xl text-[var(--document-primary)]">
              {branding.displayName}
            </p>
            {branding.address ? (
              <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-ink-2">
                {branding.address}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold tracking-[0.16em] text-[var(--document-accent)] uppercase">
              Catering agreement
            </p>
            <h1 className="mt-2 text-xl font-semibold">{contract.title}</h1>
            <p className="mt-1 text-[13px] text-ink-2">
              Contract{" "}
              {contract.contractNumber
                ? `#${contract.contractNumber}`
                : `ref ${contract._id}`}
            </p>
            <div className="mt-3 flex justify-end">
              <StatusChip status={String(contract.status)} />
            </div>
          </div>
        </header>

        {loadingRelated ? (
          <TableSkeleton rows={4} />
        ) : (
          <>
            <Section label="Parties">
              <Row label="Service provider" value={branding.displayName} />
              {branding.address ? (
                <Row
                  label="Provider address"
                  value={
                    <span className="whitespace-pre-line">
                      {branding.address}
                    </span>
                  }
                />
              ) : null}
              <Row
                label="Client"
                value={client ? clientLabel(client) : "Client"}
              />
              {client?.email ? (
                <Row label="Client email" value={String(client.email)} />
              ) : null}
              {client?.phone ? (
                <Row label="Client phone" value={String(client.phone)} />
              ) : null}
              {clientAddress ? (
                <Row label="Client address" value={clientAddress} />
              ) : null}
            </Section>

            <Section label="Service scope">
              {event ? (
                <>
                  <Row label="Event" value={String(event.title || "—")} />
                  <Row
                    label="Event type"
                    value={String(event.eventType || "—")}
                  />
                  <Row
                    label="Date"
                    value={
                      event.startsAt != null
                        ? `${formatDate(event.startsAt)} ${formatTime(event.startsAt)}` +
                          (event.endsAt != null
                            ? ` – ${formatTime(event.endsAt)}`
                            : "")
                        : "—"
                    }
                  />
                  <Row
                    label="Venue"
                    value={
                      [event.venueName, event.venueAddress]
                        .filter(Boolean)
                        .join(", ") || "—"
                    }
                  />
                  <Row
                    label="Expected headcount"
                    value={String(event.expectedHeadcount ?? "—")}
                  />
                  {event.serviceRequirements ? (
                    <Row
                      label="Service requirements"
                      value={String(event.serviceRequirements)}
                    />
                  ) : null}
                  {event.operationalRequirements ? (
                    <Row
                      label="Operational requirements"
                      value={String(event.operationalRequirements)}
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-ink-2">Linked event unavailable.</p>
              )}
            </Section>

            <Section label="Pricing schedule">
              <Row
                label="Quoted price"
                value={
                  event ? formatMoney(Number(event.quotedPrice ?? 0)) : "—"
                }
              />
              <Row
                label="Payment terms"
                value={
                  client
                    ? `Net ${Number(client.paymentTermsDays ?? 30)} days from invoice`
                    : "—"
                }
              />
              {client?.taxExempt ? (
                <Row label="Tax status" value="Tax exempt" />
              ) : null}
              <p className="mt-2 text-ink-2">
                The quoted price covers the service scope above. Changes to
                headcount, menu, or venue may revise the final invoice.
              </p>
            </Section>

            <Section label="Terms">
              {contract.notes ? (
                <p className="whitespace-pre-wrap">{String(contract.notes)}</p>
              ) : (
                <p className="text-ink-2">
                  No additional terms recorded on this contract.
                </p>
              )}
              {contract.expiresAt != null ? (
                <p className="mt-2">
                  This offer expires on {formatDate(contract.expiresAt)} if not
                  signed.
                </p>
              ) : null}
              {contract.documentUrl ? (
                <p className="mt-2">
                  Supplemental document: {String(contract.documentUrl)}
                </p>
              ) : null}
            </Section>

            <Section label="Cancellation policy">
              <p>
                Either party may cancel with written notice. Cancellations more
                than 30 days before the event date incur no charge beyond
                non-recoverable costs already committed. Cancellations within 30
                days of the event are billed for committed costs and up to 50%
                of the quoted price; within 7 days, up to the full quoted price.
                Rescheduling by mutual agreement replaces cancellation charges
                where feasible.
              </p>
            </Section>

            <Section label="Signatures">
              <p className="text-ink-2">
                By signing, the parties agree to the service scope, pricing, and
                terms above.
              </p>
              <div className="grid grid-cols-2 gap-10">
                <SignatureBlock
                  role="Client"
                  name={signed ? contract.signedBy : null}
                  signedAt={signed ? contract.signedAt : null}
                />
                <SignatureBlock role="Service provider (countersignature)" />
              </div>
              {signed ? (
                <p className="mt-4 text-[12px] text-ink-2">
                  Signature recorded in Capsule by {String(contract.signedBy)}{" "}
                  on {formatDate(contract.signedAt)}.
                </p>
              ) : null}
            </Section>

            <footer className="mt-8 border-t border-line-2 pt-2 text-[11px] text-ink-2">
              {branding.displayName} · Contract ref {contract._id} · Drafted{" "}
              {formatDate(contract.draftedAt ?? contract._creationTime)}
            </footer>
          </>
        )}
      </article>

      <div className="contract-no-print">
        <AttachmentsSection parentType="contract" parentId={contract._id} />
      </div>
    </div>
  );
}
