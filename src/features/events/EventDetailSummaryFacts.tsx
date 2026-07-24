import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatTime,
} from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import { clientDisplayName } from "./clientName";
import { EventTabPanel } from "./EventTabPanel";

type ClientRow = { _id: string } | null | undefined;

type Props = {
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly expectedHeadcount?: number | null;
  readonly budgetAmount?: number | null;
  readonly quotedPrice?: number | null;
  readonly venue?: { name: string } | null;
  readonly clientId: string;
  readonly clients: readonly ClientRow[] | undefined;
  readonly primaryContactName?: string | null;
  readonly stage: string;
};

/** At-a-glance facts on the Event Overview tab. */
export function EventDetailSummaryFacts({
  startsAt,
  endsAt,
  expectedHeadcount,
  budgetAmount,
  quotedPrice,
  venue,
  clientId,
  clients,
  primaryContactName,
  stage,
}: Props) {
  return (
    <EventTabPanel
      eyebrow="At a glance"
      title="Event facts"
      description="Timing, headcount, venue, client, and commercial snapshot for this event."
      testId="event-summary-facts"
    >
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Start">
          {formatDate(startsAt)} {formatTime(startsAt)}
        </Fact>
        <Fact label="End">
          {formatDate(endsAt)} {formatTime(endsAt)}
        </Fact>
        <Fact label="Headcount">{formatCount(expectedHeadcount)}</Fact>
        <Fact label="Budget / quoted">
          {formatMoney(budgetAmount)} / {formatMoney(quotedPrice)}
        </Fact>
        <Fact label="Venue">
          {venue ? (
            <Link to="/facilities" className="underline">
              {venue.name}
            </Link>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Client">
          <Link to={`/clients/${clientId}`} className="underline">
            {clientDisplayName(clientId, clients as never)}
          </Link>
        </Fact>
        <Fact label="Primary contact">{primaryContactName || "—"}</Fact>
        <Fact label="Status">
          <StatusChip status={stage} />
        </Fact>
      </dl>
    </EventTabPanel>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-line-2 bg-panel px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[13px] text-ink">{children}</dd>
    </div>
  );
}
