import { Link } from "react-router-dom";
import type { Doc } from "../../../lib/api";
import { formatDate, formatMoney } from "../../../lib/format";
import {
  useListClientContact,
  useListEventTimelineComment,
  useListInvoice,
} from "../../../lib/manifest-convex-react";
import { StatusChip } from "../../../ui/primitives";
import { OPEN_INVOICE_STATUSES } from "../../finance/invoiceBilling";
import { clientDisplayName } from "../clientName";
import { eventDetailPath } from "../eventRoutes";
import {
  MobileEmpty,
  MobileMore,
  MobileSectionCard,
} from "./MobileSectionCard";

type ClientRow = { _id: string } | null | undefined;

export function MobileClientCard({
  event,
  clients,
}: {
  readonly event: Doc<"events">;
  readonly clients: readonly ClientRow[] | undefined;
}) {
  const contacts = useListClientContact();
  const clientContacts = (contacts ?? []).filter(
    (row) => row.deletedAt == null && row.clientId === event.clientId,
  );
  const name = clientDisplayName(event.clientId, clients as never);
  return (
    <MobileSectionCard
      id="client"
      title="Client & contacts"
      seeAllTo={eventDetailPath(event._id, "client")}
    >
      <div className="mobile-row">
        <span className="mobile-row-main">
          <Link to={`/clients/${event.clientId}`} className="underline">
            {name}
          </Link>
          <span className="mobile-row-sub">Client</span>
        </span>
      </div>
      <ContactRow
        name={event.primaryContactName}
        title="Primary contact"
        phone={event.primaryContactPhone}
        email={event.primaryContactEmail}
      />
      {clientContacts.map((contact) => (
        <ContactRow
          key={contact._id}
          name={
            [contact.givenName, contact.familyName].filter(Boolean).join(" ") ||
            "Contact"
          }
          title={
            [
              contact.title,
              contact.isPrimary ? "primary" : "",
              contact.isBillingContact ? "billing" : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Contact"
          }
          phone={contact.mobile || contact.phone}
          email={contact.email}
        />
      ))}
    </MobileSectionCard>
  );
}

function ContactRow({
  name,
  title,
  phone,
  email,
}: {
  readonly name?: string | null;
  readonly title: string;
  readonly phone?: string | null;
  readonly email?: string | null;
}) {
  if (!name && !phone && !email) return null;
  return (
    <div className="mobile-row">
      <span className="mobile-row-main">
        <span className="block truncate">{name || "—"}</span>
        <span className="mobile-row-sub truncate">{title}</span>
      </span>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="flex min-h-11 shrink-0 items-center px-2 text-base font-semibold text-accent"
        >
          Call
        </a>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className="flex min-h-11 shrink-0 items-center px-2 text-base font-semibold text-accent"
        >
          Email
        </a>
      ) : null}
    </div>
  );
}

const COMMENT_LIMIT = 3;

export function MobileNotesCard({ event }: { readonly event: Doc<"events"> }) {
  const comments = useListEventTimelineComment();
  const eventComments = (comments ?? [])
    .filter((row) => row.eventId === event._id && row.deletedAt == null)
    .sort((a, b) => Number(b.postedAt ?? 0) - Number(a.postedAt ?? 0));
  const shown = eventComments.slice(0, COMMENT_LIMIT);
  const text = (value: unknown): string =>
    Array.isArray(value)
      ? value.join(", ")
      : typeof value === "string"
        ? value.trim()
        : "";
  const notes: Array<[string, string]> = (
    [
      ["Dietary / accessibility", text(event.accessibilityNeeds)],
      ["Service requirements", text(event.serviceRequirements)],
      ["Operational notes", text(event.operationalRequirements)],
    ] as Array<[string, string]>
  ).filter(([, value]) => value.length > 0);
  return (
    <MobileSectionCard
      id="notes"
      title="Notes"
      seeAllTo={`${eventDetailPath(event._id, "overview")}&full=1`}
    >
      {notes.length === 0 && eventComments.length === 0 ? (
        <MobileEmpty>No notes recorded for this event.</MobileEmpty>
      ) : null}
      {notes.map(([label, value]) => (
        <div key={label} className="pt-2">
          <p className="eyebrow">{label}</p>
          <p className="text-base whitespace-pre-wrap text-ink">{value}</p>
        </div>
      ))}
      {shown.length > 0 ? (
        <div className="pt-2">
          <p className="eyebrow">Staff discussion</p>
          {shown.map((row) => (
            <div key={row._id} className="mobile-row">
              <span className="mobile-row-main">
                <span className="block whitespace-pre-wrap">{row.body}</span>
                <span className="mobile-row-sub truncate">
                  {row.authorName} · {formatDate(row.postedAt)}
                </span>
              </span>
            </div>
          ))}
          <MobileMore count={eventComments.length - shown.length} />
        </div>
      ) : null}
    </MobileSectionCard>
  );
}

export function MobileMoneyCard({ event }: { readonly event: Doc<"events"> }) {
  const invoices = useListInvoice();
  const eventInvoices = (invoices ?? []).filter(
    (row) => row.deletedAt == null && row.eventId === event._id,
  );
  // Same rule as Finance: voided/draft/written-off invoices do not owe money.
  const open = (status: unknown) =>
    (OPEN_INVOICE_STATUSES as readonly string[]).includes(String(status));
  const balance = eventInvoices
    .filter((row) => open(row.status))
    .reduce((sum, row) => sum + (Number(row.amountDue) || 0), 0);
  const paid = eventInvoices
    .filter((row) => open(row.status) || String(row.status) === "paid")
    .reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
  const seeAllTo =
    eventInvoices.length === 1 && eventInvoices[0]
      ? `/finance/invoices/${eventInvoices[0]._id}`
      : "/finance/invoices";
  return (
    <MobileSectionCard id="money" title="Money" seeAllTo={seeAllTo}>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        <Money label="Quoted" value={event.quotedPrice} />
        <Money label="Paid" value={paid} />
        <Money label="Balance" value={balance} />
      </dl>
      {eventInvoices.length === 0 ? (
        <MobileEmpty>No invoice on this event yet.</MobileEmpty>
      ) : (
        eventInvoices.map((row) => (
          <div key={row._id} className="mobile-row">
            <span className="mobile-row-main">
              <span className="block truncate">
                Invoice {row.invoiceNumber || "—"}
              </span>
              <span className="mobile-row-sub truncate">
                {formatMoney(row.total)} total
                {row.dueDate != null ? ` · due ${formatDate(row.dueDate)}` : ""}
              </span>
            </span>
            <StatusChip status={String(row.status)} />
          </div>
        ))
      )}
    </MobileSectionCard>
  );
}

function Money({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | null | undefined;
}) {
  return (
    <div className="min-w-0 pt-1">
      <dt className="text-xs font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {label}
      </dt>
      <dd className="truncate font-mono text-lg text-ink">
        {formatMoney(value)}
      </dd>
    </div>
  );
}
