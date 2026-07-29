import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { useListClient } from "../../lib/manifest-convex-react";
import { ClientCommunicationPanel } from "../clients/ClientCommunicationPanel";
import { clientDisplayName } from "./clientName";

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
  const client = clients?.find((row) => row._id === clientId);
  const name = clientDisplayName(clientId, clients);

  return (
    <section className="space-y-4" data-testid="event-client-tab">
      <div>
        <h2 className="font-display text-lg">Client information</h2>
        <p className="text-[13px] text-ink-2">
          Event-specific contacts and hospitality notes. Full CRM records stay
          linked.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Client
          </dt>
          <dd>
            {client ? (
              <Link
                to={`/clients/${client._id}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Primary contact
          </dt>
          <dd>{primaryContactName || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Email
          </dt>
          <dd>
            {primaryContactEmail ? (
              <a href={`mailto:${primaryContactEmail}`} className="underline">
                {primaryContactEmail}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Phone
          </dt>
          <dd>
            {primaryContactPhone ? (
              <a href={`tel:${primaryContactPhone}`} className="underline">
                {primaryContactPhone}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Dietary / accessibility
          </dt>
          <dd className="whitespace-pre-wrap text-[13px]">
            {accessibilityNeeds || "None recorded for this event."}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Service requirements
          </dt>
          <dd className="whitespace-pre-wrap text-[13px]">
            {serviceRequirements || "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-ink-3">
            Operational notes
          </dt>
          <dd className="whitespace-pre-wrap text-[13px]">
            {operationalRequirements || "—"}
          </dd>
        </div>
      </dl>
      <p className="text-[12px] text-ink-3">
        Edit the contact and requirements on the Overview tab.
      </p>
      <ClientCommunicationPanel
        target={{
          kind: "event",
          eventId,
          eventTitle,
        }}
      />
    </section>
  );
}
