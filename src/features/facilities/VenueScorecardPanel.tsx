import { useMemo } from "react";
import { useListEvent } from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";

// Venue scorecard metrics — spec §8.1 ("…and scorecard metrics").
//
// Derived read-side, not stored: every number here is recomputed from the
// events already linked to this venue, so it can never drift from the event
// spine the way a denormalized rating column would. Convex `computed.ts` is
// not consumed by generated queries, so the derivation lives in the page.

const COMPLETED_STAGES = new Set(["completed", "closed_out", "final"]);
const CANCELLED_STAGES = new Set(["cancelled"]);

interface VenueMetrics {
  totalEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  upcomingEvents: number;
  totalBookedValue: number;
  averageEventValue: number;
  averageHeadcount: number;
  largestHeadcount: number;
  cancellationRate: number;
  lastEventAt: number | null;
}

const EMPTY: VenueMetrics = {
  totalEvents: 0,
  completedEvents: 0,
  cancelledEvents: 0,
  upcomingEvents: 0,
  totalBookedValue: 0,
  averageEventValue: 0,
  averageHeadcount: 0,
  largestHeadcount: 0,
  cancellationRate: 0,
  lastEventAt: null,
};

function money(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function when(value: number | null): string {
  return value == null
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function VenueScorecardPanel({ venueId }: { venueId: string }) {
  const events = useListEvent();

  const metrics = useMemo<VenueMetrics | null>(() => {
    if (events === undefined) return null;
    const mine = (events ?? []).filter(
      (row) => String(row.venueId ?? "") === venueId && row.deletedAt == null,
    );
    if (mine.length === 0) return EMPTY;

    const now = Date.now();
    let completed = 0;
    let cancelled = 0;
    let upcoming = 0;
    let bookedValue = 0;
    let headcountTotal = 0;
    let largestHeadcount = 0;
    let lastEventAt: number | null = null;

    for (const row of mine) {
      const stage = String(row.stage);
      if (COMPLETED_STAGES.has(stage)) completed += 1;
      if (CANCELLED_STAGES.has(stage)) cancelled += 1;

      const startsAt =
        typeof row.startsAt === "number" && Number.isFinite(row.startsAt)
          ? row.startsAt
          : null;
      if (startsAt != null) {
        if (startsAt > now && !CANCELLED_STAGES.has(stage)) upcoming += 1;
        if (lastEventAt == null || startsAt > lastEventAt)
          lastEventAt = startsAt;
      }

      // Cancelled events are excluded from booked value — they never earned.
      if (!CANCELLED_STAGES.has(stage)) {
        const quoted = Number(row.quotedPrice);
        if (Number.isFinite(quoted)) bookedValue += quoted;
      }

      const headcount = Number(row.expectedHeadcount);
      if (Number.isFinite(headcount)) {
        headcountTotal += headcount;
        if (headcount > largestHeadcount) largestHeadcount = headcount;
      }
    }

    const valued = mine.length - cancelled;
    return {
      totalEvents: mine.length,
      completedEvents: completed,
      cancelledEvents: cancelled,
      upcomingEvents: upcoming,
      totalBookedValue: bookedValue,
      averageEventValue: valued > 0 ? bookedValue / valued : 0,
      averageHeadcount: mine.length > 0 ? headcountTotal / mine.length : 0,
      largestHeadcount,
      cancellationRate: mine.length > 0 ? cancelled / mine.length : 0,
      lastEventAt,
    };
  }, [events, venueId]);

  return (
    <Section title="Venue scorecard">
      <div className="p-4">
        {metrics == null ? (
          <p className="text-sm text-ink-3">Loading event history…</p>
        ) : metrics.totalEvents === 0 ? (
          <p className="text-sm text-ink-3">
            No events have been booked at this venue yet. Metrics appear once
            events reference it.
          </p>
        ) : (
          <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm sm:grid-cols-2 sm:gap-x-8">
            <Metric label="Events booked" value={String(metrics.totalEvents)} />
            <Metric label="Completed" value={String(metrics.completedEvents)} />
            <Metric label="Upcoming" value={String(metrics.upcomingEvents)} />
            <Metric
              label="Cancelled"
              value={`${metrics.cancelledEvents} (${Math.round(metrics.cancellationRate * 100)}%)`}
            />
            <Metric
              label="Booked value"
              value={money(metrics.totalBookedValue)}
            />
            <Metric
              label="Average event value"
              value={money(metrics.averageEventValue)}
            />
            <Metric
              label="Average headcount"
              value={String(Math.round(metrics.averageHeadcount))}
            />
            <Metric
              label="Largest headcount"
              value={String(metrics.largestHeadcount)}
            />
            <Metric
              label="Most recent event"
              value={when(metrics.lastEventAt)}
            />
          </dl>
        )}
      </div>
    </Section>
  );
}
