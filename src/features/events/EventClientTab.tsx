import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import {
  useListClient,
  useListClientContact,
  useListEvent,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import { ClientCommunicationPanel } from "../clients/ClientCommunicationPanel";
import { clientDisplayName } from "./clientName";
import { EventClientBillingPanel } from "./EventClientBillingPanel";
import { EventClientContactsPanel } from "./EventClientContactsPanel";
import { EventClientHistoryPanel } from "./EventClientHistoryPanel";

type Props = {
  eventId: Id<"events">;
  eventTitle: string;
  clientId: string;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  accessibilityNeeds?: string | null;
  serviceRequirements?: string | null;
  operationalRequirements?: string | null;
};

/** Two initials for the client mark — a letterform, never a fake logo. */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || "—";
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-0.5 text-base text-ink">{value}</div>
    </div>
  );
}

export function EventClientTab({
  eventId,
  eventTitle,
  clientId,
  primaryContactName,
  primaryContactEmail,
  primaryContactPhone,
  accessibilityNeeds,
  serviceRequirements,
  operationalRequirements,
}: Props) {
  const clients = useListClient();
  const clientContacts = useListClientContact();
  const events = useListEvent();
  const client = clients?.find((row) => row._id === clientId);
  const name = clientDisplayName(clientId, clients);

  const contacts = useMemo(
    () =>
      (clientContacts ?? [])
        .filter(
          (row) =>
            row.clientId === clientId &&
            row.deletedAt == null &&
            row.status !== "removed",
        )
        .sort(
          (left, right) =>
            Number(right.isPrimary) - Number(left.isPrimary) ||
            `${left.givenName ?? ""} ${left.familyName ?? ""}`.localeCompare(
              `${right.givenName ?? ""} ${right.familyName ?? ""}`,
            ),
        ),
    [clientContacts, clientId],
  );

  const clientEvents = useMemo(
    () =>
      (events ?? [])
        .filter((row) => row.clientId === clientId && row.deletedAt == null)
        .sort((left, right) => Number(left.startsAt) - Number(right.startsAt)),
    [clientId, events],
  );

  const locality = [client?.city, client?.region].filter(Boolean).join(", ");

  return (
    <section
      className="flex flex-col gap-4 lg:flex-row lg:items-start"
      data-testid="event-client-tab"
    >
      <div className="min-w-0 flex-1 space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-start gap-4">
            <span
              aria-hidden="true"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-brand font-display text-2xl text-on-brand"
            >
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl text-ink">{name}</h2>
              <p className="mt-0.5 text-base text-ink-2">
                {client?.clientType === "company"
                  ? "Company account"
                  : client
                    ? "Individual account"
                    : "Client record not found"}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-ink-2">
                {locality ? <span>{locality}</span> : null}
                {client?.website ? (
                  <a
                    className="link"
                    href={client.website}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {client.website}
                  </a>
                ) : null}
              </p>
            </div>
            {client ? (
              <Link className="btn btn-ghost" to={`/clients/${client._id}`}>
                Open client record
              </Link>
            ) : null}
          </div>
          {client ? (
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label="Client since"
                value={
                  client.registeredAt != null
                    ? formatDate(client.registeredAt)
                    : "Not recorded"
                }
              />
              <Fact label="Events booked" value={String(clientEvents.length)} />
              <Fact
                label="Payment terms"
                value={`Net ${client.paymentTermsDays}`}
              />
              <Fact
                label="Account status"
                value={<StatusChip status={String(client.status)} />}
              />
            </div>
          ) : null}
        </div>

        <EventClientContactsPanel
          eventContact={{
            name: primaryContactName,
            email: primaryContactEmail,
            phone: primaryContactPhone,
          }}
          contacts={contacts}
        />

        <section className="card p-4">
          <div className="section-rule">
            <span>Requirements for this event</span>
            <i />
            <em>Edited on the Overview tab</em>
          </div>
          <dl className="mt-3.5 grid gap-4">
            <div>
              <dt className="eyebrow">Dietary / accessibility</dt>
              <dd className="mt-0.5 text-base whitespace-pre-wrap text-ink">
                {accessibilityNeeds || "None recorded for this event."}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Service requirements</dt>
              <dd className="mt-0.5 text-base whitespace-pre-wrap text-ink">
                {serviceRequirements || "—"}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Operational notes</dt>
              <dd className="mt-0.5 text-base whitespace-pre-wrap text-ink">
                {operationalRequirements || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <EventClientBillingPanel client={client} />

        <EventClientHistoryPanel
          events={clientEvents}
          currentEventId={eventId}
        />

        <ClientCommunicationPanel
          target={{
            kind: "event",
            eventId,
            eventTitle,
          }}
        />
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
        <div className="card p-4">
          <p className="eyebrow">Client notes</p>
          {client?.notes ? (
            <p className="mt-2 text-base whitespace-pre-wrap text-ink-2 italic">
              {client.notes}
            </p>
          ) : (
            <p className="mt-2 text-base text-ink-3">
              No notes on the client record yet.
            </p>
          )}
          {client ? (
            <Link
              className="text-link mt-3 inline-flex"
              to={`/clients/${client._id}`}
            >
              Edit on the client record
            </Link>
          ) : null}
        </div>

        <div className="card p-4">
          <p className="eyebrow">Where this is owned</p>
          <p className="mt-2 text-base text-ink-2">
            Contact and requirement edits for this booking live on the Overview
            tab. Company, billing, and roster edits live on the client record.
          </p>
        </div>
      </aside>
    </section>
  );
}
