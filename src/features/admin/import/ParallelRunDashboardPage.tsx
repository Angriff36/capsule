// Parallel Run Dashboard — Daily comparison of TPP vs Capsule data for migration validation
// Spec §6.5: Compare record counts, event totals, status distribution, revenue, salesperson, occasion, service style, venue

import { useMemo } from "react";
import {
  useListEvent,
  useListImportRun,
  useListExternalRecordLink,
  useListServiceStyle,
  useListOccasion,
  useListVenue,
} from "../../../lib/manifest-convex-react";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import { StatusChip, TableSkeleton } from "../../../ui/primitives";
import { Link } from "react-router-dom";
import { importRunDetailPath } from "./importRoutes";
import { eventDetailPath } from "../../../features/events/eventRoutes";

// Source system labels
const SOURCE_SYSTEM_LABELS: Record<string, string> = {
  tpp_legacy: "TPP Legacy",
  csv_export: "CSV Export",
  api_sync: "API Sync",
};

// Dataset type labels
const DATASET_TYPE_LABELS: Record<string, string> = {
  events: "Events",
  contacts: "Contacts",
  leads: "Leads",
  menus: "Menus",
  venues: "Venues",
  payments: "Payments",
  pack_list: "Pack Lists",
};

// This dashboard compares the events dataset — events are the spine every
// other imported record hangs off, so they are the §6.5 parallel-run gate.
const COMPARISON_DATASET = "events";

// Comparison window: the last 30 days.
const COMPARISON_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Event stage labels for comparison
const STAGE_LABELS: Record<string, string> = {
  quote: "Quote",
  planning: "Planning",
  pending_approval: "Pending Approval",
  approved: "Approved",
  sales_lock: "Sales Lock",
  executing: "Executing",
  final: "Final",
  completed: "Completed",
  cancelled: "Cancelled",
  closed_out: "Closed Out",
};

interface ComparisonMetric {
  label: string;
  capsuleCount: number;
  tppCount: number;
  diff: number;
  diffPercent: number;
  status: "match" | "warning" | "error";
}

export function ParallelRunDashboardPage() {
  const capsuleEvents = useListEvent();
  const importRuns = useListImportRun();
  const externalLinks = useListExternalRecordLink();
  const serviceStyles = useListServiceStyle();
  const occasions = useListOccasion();
  const venues = useListVenue();

  // Computed once per mount so downstream memos are stable across renders.
  const selectedDateRange = useMemo(
    () => ({
      start: new Date(Date.now() - COMPARISON_WINDOW_MS),
      end: new Date(),
    }),
    [],
  );

  // Filter events by date range
  const filteredEvents = useMemo(() => {
    if (!capsuleEvents) return [];
    return capsuleEvents.filter((event) => {
      const startsAt = event.startsAt ? new Date(event.startsAt) : null;
      if (!startsAt) return false;
      return (
        startsAt >= selectedDateRange.start && startsAt <= selectedDateRange.end
      );
    });
  }, [capsuleEvents, selectedDateRange]);

  // Get completed import runs for TPP data
  const completedImportRuns = useMemo(() => {
    if (!importRuns) return [];
    return importRuns.filter(
      (run) =>
        run.status === "completed" &&
        run.datasetType === COMPARISON_DATASET &&
        run.startTime &&
        new Date(run.startTime) >= selectedDateRange.start &&
        new Date(run.startTime) <= selectedDateRange.end,
    );
  }, [importRuns, selectedDateRange]);

  // Get latest completed import run for TPP comparison
  const latestTppImport = useMemo(() => {
    if (completedImportRuns.length === 0) return null;
    return completedImportRuns.sort((a, b) => {
      const timeA = a.startTime ?? 0;
      const timeB = b.startTime ?? 0;
      return timeB - timeA;
    })[0];
  }, [completedImportRuns]);

  // Parse TPP record counts from JSON string
  const tppRecordCounts = useMemo(() => {
    if (!latestTppImport?.recordCounts) return {};
    try {
      return JSON.parse(latestTppImport.recordCounts) as Record<string, number>;
    } catch {
      return {};
    }
  }, [latestTppImport]);

  // Calculate comparison metrics
  const comparisonMetrics = useMemo((): ComparisonMetric[] => {
    if (!filteredEvents.length && !latestTppImport) return [];

    const metrics: ComparisonMetric[] = [];

    // Total records
    const capsuleTotal = filteredEvents.length;
    const tppTotal = tppRecordCounts.total ?? 0;
    const diff = capsuleTotal - tppTotal;
    const diffPercent = tppTotal > 0 ? (diff / tppTotal) * 100 : 0;

    metrics.push({
      label: "Total Events",
      capsuleCount: capsuleTotal,
      tppCount: tppTotal,
      diff,
      diffPercent,
      status:
        diff === 0 ? "match" : Math.abs(diffPercent) > 5 ? "error" : "warning",
    });

    // Status distribution comparison
    const capsuleStages: Record<string, number> = {};
    filteredEvents.forEach((event) => {
      const stage = String(event.stage);
      capsuleStages[stage] = (capsuleStages[stage] ?? 0) + 1;
    });

    // TPP status counts (if available in recordCounts)
    const tppStages =
      (tppRecordCounts.byStatus as unknown as
        Record<string, number> | undefined) ?? {};

    Object.keys(STAGE_LABELS).forEach((stage) => {
      const capsuleCount = capsuleStages[stage] ?? 0;
      const tppCount =
        typeof tppStages === "object" && tppStages !== null
          ? (tppStages[stage] ?? 0)
          : 0;
      const stageDiff = capsuleCount - tppCount;
      const stageDiffPercent = tppCount > 0 ? (stageDiff / tppCount) * 100 : 0;

      metrics.push({
        label: `Status: ${STAGE_LABELS[stage]}`,
        capsuleCount,
        tppCount,
        diff: stageDiff,
        diffPercent: stageDiffPercent,
        status:
          stageDiff === 0
            ? "match"
            : Math.abs(stageDiffPercent) > 10
              ? "error"
              : "warning",
      });
    });

    return metrics;
  }, [filteredEvents, tppRecordCounts]);

  // Revenue comparison
  const revenueMetric = useMemo((): ComparisonMetric | null => {
    const capsuleRevenue = filteredEvents.reduce(
      (sum, event) => sum + (event.quotedPrice ?? 0),
      0,
    );
    const tppRevenue = (tppRecordCounts.totalRevenue as number) ?? 0;
    const diff = capsuleRevenue - tppRevenue;
    const diffPercent = tppRevenue > 0 ? (diff / tppRevenue) * 100 : 0;

    return {
      label: "Total Revenue",
      capsuleCount: capsuleRevenue,
      tppCount: tppRevenue,
      diff,
      diffPercent,
      status:
        diff === 0 ? "match" : Math.abs(diffPercent) > 5 ? "error" : "warning",
    };
  }, [filteredEvents, tppRecordCounts]);

  // Salesperson breakdown
  const salespersonBreakdown = useMemo(() => {
    const breakdown: Record<string, { capsule: number; tpp: number }> = {};
    filteredEvents.forEach((event) => {
      if (event.assignedToId) {
        const key = String(event.assignedToId);
        breakdown[key] = breakdown[key] ?? { capsule: 0, tpp: 0 };
        breakdown[key].capsule++;
      }
    });

    // TPP salesperson counts (if available)
    const tppSalespeople =
      (tppRecordCounts.bySalesperson as unknown as
        Record<string, number> | undefined) ?? {};
    Object.entries(
      typeof tppSalespeople === "object" && tppSalespeople !== null
        ? tppSalespeople
        : {},
    ).forEach(([id, count]) => {
      breakdown[id] = breakdown[id] ?? { capsule: 0, tpp: 0 };
      breakdown[id].tpp = count;
    });

    return Object.entries(breakdown).map(([id, counts]) => ({
      id,
      capsule: counts.capsule,
      tpp: counts.tpp,
      diff: counts.capsule - counts.tpp,
    }));
  }, [filteredEvents, tppRecordCounts]);

  // Occasion breakdown
  const occasionBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      { capsule: number; tpp: number; name: string }
    > = {};
    filteredEvents.forEach((event) => {
      if (event.occasionId) {
        const key = String(event.occasionId);
        const occasion = occasions?.find((o) => o._id === event.occasionId);
        breakdown[key] = breakdown[key] ?? {
          capsule: 0,
          tpp: 0,
          name: occasion?.name ?? "Unknown",
        };
        breakdown[key].capsule++;
      }
    });

    // TPP occasion counts (if available)
    const tppOccasions =
      (tppRecordCounts.byOccasion as unknown as
        Record<string, number> | undefined) ?? {};
    Object.entries(
      typeof tppOccasions === "object" && tppOccasions !== null
        ? tppOccasions
        : {},
    ).forEach(([id, count]) => {
      const occasion = occasions?.find((o) => o._id === id);
      const name = occasion?.name ?? id;
      breakdown[id] = breakdown[id] ?? { capsule: 0, tpp: 0, name };
      breakdown[id].tpp = count;
    });

    return Object.entries(breakdown).map(([id, data]) => ({
      id,
      name: data.name,
      capsule: data.capsule,
      tpp: data.tpp,
      diff: data.capsule - data.tpp,
    }));
  }, [filteredEvents, tppRecordCounts, occasions]);

  // Service Style breakdown
  const serviceStyleBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      { capsule: number; tpp: number; name: string }
    > = {};
    filteredEvents.forEach((event) => {
      if (event.serviceStyleId) {
        const key = String(event.serviceStyleId);
        const style = serviceStyles?.find(
          (s) => s._id === event.serviceStyleId,
        );
        breakdown[key] = breakdown[key] ?? {
          capsule: 0,
          tpp: 0,
          name: style?.name ?? "Unknown",
        };
        breakdown[key].capsule++;
      }
    });

    // TPP service style counts (if available)
    const tppServiceStyles =
      (tppRecordCounts.byServiceStyle as unknown as
        Record<string, number> | undefined) ?? {};
    Object.entries(
      typeof tppServiceStyles === "object" && tppServiceStyles !== null
        ? tppServiceStyles
        : {},
    ).forEach(([id, count]) => {
      const style = serviceStyles?.find((s) => s._id === id);
      const name = style?.name ?? id;
      breakdown[id] = breakdown[id] ?? { capsule: 0, tpp: 0, name };
      breakdown[id].tpp = count;
    });

    return Object.entries(breakdown).map(([id, data]) => ({
      id,
      name: data.name,
      capsule: data.capsule,
      tpp: data.tpp,
      diff: data.capsule - data.tpp,
    }));
  }, [filteredEvents, tppRecordCounts, serviceStyles]);

  // Venue breakdown
  const venueBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      { capsule: number; tpp: number; name: string }
    > = {};
    filteredEvents.forEach((event) => {
      const venueId = event.venueId ?? event.venueName ?? "Unknown";
      const key = typeof venueId === "string" ? venueId : String(venueId);
      const venue =
        typeof event.venueId === "string" && event.venueId !== "Unknown"
          ? venues?.find((v) => v._id === event.venueId)
          : null;
      breakdown[key] = breakdown[key] ?? {
        capsule: 0,
        tpp: 0,
        name: venue?.name ?? event.venueName ?? "Unknown",
      };
      breakdown[key].capsule++;
    });

    // TPP venue counts (if available)
    const tppVenues =
      (tppRecordCounts.byVenue as unknown as
        Record<string, number> | undefined) ?? {};
    Object.entries(
      typeof tppVenues === "object" && tppVenues !== null ? tppVenues : {},
    ).forEach(([id, count]) => {
      const venue = venues?.find((v) => v._id === id);
      const name = venue?.name ?? id;
      breakdown[id] = breakdown[id] ?? { capsule: 0, tpp: 0, name };
      breakdown[id].tpp = count;
    });

    return Object.entries(breakdown).map(([id, data]) => ({
      id,
      name: data.name,
      capsule: data.capsule,
      tpp: data.tpp,
      diff: data.capsule - data.tpp,
    }));
  }, [filteredEvents, tppRecordCounts, venues]);

  // Unresolved mappings (ExternalRecordLinks with verified=false)
  const unresolvedMappings = useMemo(() => {
    if (!externalLinks) return [];
    return externalLinks.filter(
      (link) =>
        !link.verified &&
        link.capsuleEntity === "event_record" &&
        link.sourceSystem === "tpp_legacy" &&
        link.conflictStatus !== "resolved",
    );
  }, [externalLinks]);

  // Recently created/changed events
  const recentChanges = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return filteredEvents.filter((event) => {
      const updatedAt = event.updatedAt ?? event.createdAt ?? 0;
      return updatedAt >= oneDayAgo && updatedAt <= now;
    });
  }, [filteredEvents]);

  const loading =
    capsuleEvents === undefined ||
    importRuns === undefined ||
    externalLinks === undefined ||
    serviceStyles === undefined ||
    occasions === undefined ||
    venues === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <h1 className="display-title">Parallel Run Dashboard</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            A daily side-by-side of TPP and Capsule events over the last 30
            days, so you can confirm everything came over correctly before
            switching for good. Dig into any differences below.
          </p>
        </div>
      </header>

      <AdminWorkspaceNav />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          {/* Summary Cards */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-4 mt-6">
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">Capsule Events</h3>
              <p className="text-xl font-bold">{filteredEvents.length}</p>
              <p className="text-2xs text-ink-3">
                {selectedDateRange.start.toLocaleDateString()} -{" "}
                {selectedDateRange.end.toLocaleDateString()}
              </p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">TPP Events</h3>
              <p className="text-xl font-bold">
                {tppRecordCounts.total ?? "—"}
              </p>
              <p className="text-2xs text-ink-3">
                {latestTppImport
                  ? `Imported ${new Date(latestTppImport.startTime ?? 0).toLocaleDateString()}`
                  : "No recent import"}
              </p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">Difference</h3>
              <p
                className={`text-xl font-bold ${
                  filteredEvents.length - (tppRecordCounts.total ?? 0) === 0
                    ? "text-ok"
                    : "text-warn"
                }`}
              >
                {filteredEvents.length - (tppRecordCounts.total ?? 0)}
              </p>
              <p className="text-2xs text-ink-3">Events variance</p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">
                Unresolved Mappings
              </h3>
              <p
                className={`text-xl font-bold ${
                  unresolvedMappings.length === 0 ? "text-ok" : "text-warn"
                }`}
              >
                {unresolvedMappings.length}
              </p>
              <p className="text-2xs text-ink-3">
                {unresolvedMappings.length === 0
                  ? "All verified"
                  : "Need resolution"}
              </p>
            </div>
          </section>

          {/* Comparison Metrics Table */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Record Counts Comparison</h2>
              </div>
              <span>{comparisonMetrics.length} metrics</span>
            </div>

            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Capsule</th>
                    <th>TPP</th>
                    <th>Difference</th>
                    <th>Diff %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonMetrics.map((metric) => (
                    <tr key={metric.label}>
                      <td>{metric.label}</td>
                      <td>{metric.capsuleCount.toLocaleString()}</td>
                      <td>{metric.tppCount.toLocaleString()}</td>
                      <td
                        className={metric.diff === 0 ? "text-ok" : "text-warn"}
                      >
                        {metric.diff > 0 ? "+" : ""}
                        {metric.diff.toLocaleString()}
                      </td>
                      <td
                        className={
                          metric.diffPercent === 0 ? "text-ok" : "text-warn"
                        }
                      >
                        {metric.diffPercent.toFixed(1)}%
                      </td>
                      <td>
                        <StatusChip status={metric.status} />
                      </td>
                    </tr>
                  ))}
                  {revenueMetric && (
                    <tr className="font-semibold border-t-2">
                      <td>{revenueMetric.label}</td>
                      <td>${revenueMetric.capsuleCount.toLocaleString()}</td>
                      <td>${revenueMetric.tppCount.toLocaleString()}</td>
                      <td
                        className={
                          revenueMetric.diff === 0 ? "text-ok" : "text-warn"
                        }
                      >
                        {revenueMetric.diff > 0 ? "+" : ""}$
                        {revenueMetric.diff.toLocaleString()}
                      </td>
                      <td
                        className={
                          revenueMetric.diffPercent === 0
                            ? "text-ok"
                            : "text-warn"
                        }
                      >
                        {revenueMetric.diffPercent.toFixed(1)}%
                      </td>
                      <td>
                        <StatusChip status={revenueMetric.status} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-6">
            {/* Salesperson Breakdown */}
            <section className="working-ledger">
              <div className="ledger-heading">
                <div>
                  <h2>By Salesperson</h2>
                </div>
                <span>{salespersonBreakdown.length} people</span>
              </div>
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Salesperson ID</th>
                      <th>Capsule</th>
                      <th>TPP</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salespersonBreakdown.map((item) => (
                      <tr key={item.id}>
                        <td className="font-mono text-xs">
                          {item.id.slice(0, 8)}...
                        </td>
                        <td>{item.capsule}</td>
                        <td>{item.tpp}</td>
                        <td
                          className={item.diff === 0 ? "text-ok" : "text-warn"}
                        >
                          {item.diff > 0 ? "+" : ""}
                          {item.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Occasion Breakdown */}
            <section className="working-ledger">
              <div className="ledger-heading">
                <div>
                  <h2>By Occasion</h2>
                </div>
                <span>{occasionBreakdown.length} types</span>
              </div>
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Occasion</th>
                      <th>Capsule</th>
                      <th>TPP</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occasionBreakdown.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.capsule}</td>
                        <td>{item.tpp}</td>
                        <td
                          className={item.diff === 0 ? "text-ok" : "text-warn"}
                        >
                          {item.diff > 0 ? "+" : ""}
                          {item.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Service Style Breakdown */}
            <section className="working-ledger">
              <div className="ledger-heading">
                <div>
                  <h2>By Service Style</h2>
                </div>
                <span>{serviceStyleBreakdown.length} styles</span>
              </div>
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Service Style</th>
                      <th>Capsule</th>
                      <th>TPP</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceStyleBreakdown.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.capsule}</td>
                        <td>{item.tpp}</td>
                        <td
                          className={item.diff === 0 ? "text-ok" : "text-warn"}
                        >
                          {item.diff > 0 ? "+" : ""}
                          {item.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Venue Breakdown */}
            <section className="working-ledger">
              <div className="ledger-heading">
                <div>
                  <h2>By Venue</h2>
                </div>
                <span>{venueBreakdown.length} venues</span>
              </div>
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Venue</th>
                      <th>Capsule</th>
                      <th>TPP</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venueBreakdown.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.capsule}</td>
                        <td>{item.tpp}</td>
                        <td
                          className={item.diff === 0 ? "text-ok" : "text-warn"}
                        >
                          {item.diff > 0 ? "+" : ""}
                          {item.diff}
                        </td>
                      </tr>
                    ))}
                    {venueBreakdown.length > 10 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-center text-xs text-ink-3"
                        >
                          +{venueBreakdown.length - 10} more venues
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Recent Changes */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Recently Changed Events (Last 24 Hours)</h2>
              </div>
              <span>{recentChanges.length} events</span>
            </div>
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChanges.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-ink-3">
                        No recent changes
                      </td>
                    </tr>
                  ) : (
                    recentChanges.slice(0, 20).map((event) => (
                      <tr key={event._id}>
                        <td>
                          <strong>{event.title}</strong>
                        </td>
                        <td>
                          {event.startsAt
                            ? new Date(event.startsAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          <StatusChip status={String(event.stage)} />
                        </td>
                        <td>
                          {event.updatedAt
                            ? new Date(event.updatedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td>
                          <Link
                            to={eventDetailPath(event._id)}
                            className="btn btn-ghost btn-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Unresolved Mappings */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Records still to match</h2>
                <p className="text-xs text-ink-2">
                  Imported records that still need to be checked or matched up.
                </p>
              </div>
              <span>{unresolvedMappings.length} records</span>
            </div>
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Old system</th>
                    <th>Type</th>
                    <th>Reference in the old system</th>
                    <th>Capsule record</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedMappings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-ok">
                        ✓ All mappings verified
                      </td>
                    </tr>
                  ) : (
                    unresolvedMappings.slice(0, 50).map((link) => (
                      <tr key={link._id}>
                        <td>
                          {SOURCE_SYSTEM_LABELS[link.sourceSystem] ??
                            link.sourceSystem}
                        </td>
                        <td>{link.recordType}</td>
                        <td
                          className="font-mono text-xs text-ink-3"
                          title={link.externalId}
                        >
                          {link.externalId.slice(0, 16)}…
                        </td>
                        <td title={link.capsuleId || undefined}>
                          {link.capsuleId ? "Linked" : "Unmapped"}
                        </td>
                        <td>
                          <StatusChip status={String(link.conflictStatus)} />
                        </td>
                        <td>
                          {link.capsuleEntity === "event_record" &&
                          link.capsuleId ? (
                            <Link
                              to={eventDetailPath(
                                link.capsuleId as `${string}/${string}`,
                              )}
                              className="btn btn-ghost btn-sm"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-3">
                              No action
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {unresolvedMappings.length > 50 && (
              <p className="mt-3 text-xs text-center text-ink-3">
                Showing 50 of {unresolvedMappings.length} unresolved mappings
              </p>
            )}
          </section>

          {/* Import Runs Reference */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Recent Import Runs</h2>
                <p className="text-xs text-ink-2">
                  The imports these comparisons are based on.
                </p>
              </div>
              <span>{completedImportRuns.length} runs</span>
            </div>
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Dataset</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Records</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {completedImportRuns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-ink-3">
                        No completed imports in date range
                      </td>
                    </tr>
                  ) : (
                    completedImportRuns.map((run) => {
                      const recordCount = (() => {
                        try {
                          const counts = JSON.parse(run.recordCounts);
                          return counts.total ?? 0;
                        } catch {
                          return 0;
                        }
                      })();
                      return (
                        <tr key={run._id}>
                          <td>
                            {SOURCE_SYSTEM_LABELS[run.sourceSystem] ??
                              run.sourceSystem}
                          </td>
                          <td>
                            {DATASET_TYPE_LABELS[run.datasetType] ??
                              run.datasetType}
                          </td>
                          <td>
                            <StatusChip status={String(run.status)} />
                          </td>
                          <td>
                            {run.startTime
                              ? new Date(run.startTime).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>{recordCount.toLocaleString()}</td>
                          <td>
                            <Link
                              to={importRunDetailPath(run._id)}
                              className="btn btn-ghost btn-sm"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Help Text */}
          <section className="mt-6 p-4 bg-info-soft border border-info/40 rounded-sm">
            <h3 className="font-semibold text-info">
              Understanding the Dashboard
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-info">
              <li>
                • <strong>Match status</strong>: Capsule and TPP counts are
                identical
              </li>
              <li>
                • <strong>Warning status</strong>: Minor variance (&lt;5-10%) -
                review recommended
              </li>
              <li>
                • <strong>Error status</strong>: Significant variance
                (&gt;5-10%) - investigation required
              </li>
              <li>
                • <strong>Records still to match</strong>: Imported records to
                double-check before the final switch
              </li>
              <li>
                • <strong>Recent changes</strong>: Events modified in the last
                24 hours for review
              </li>
              <li>
                • <strong>Drill-down</strong>: Click "View" links to inspect
                individual records
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
