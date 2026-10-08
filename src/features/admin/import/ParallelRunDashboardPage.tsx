// Parallel Run Dashboard — Daily comparison of TPP vs Capsule data for migration validation
// Spec §6.5: Compare record counts, event totals, status distribution, revenue, salesperson, occasion, service style, venue
// Both sides' numbers come from the daily comparison (convex/parallelRun.ts):
// TPP's side is read from the import's own saved rows, Capsule's from the
// events, and every field difference is listed for a person to settle.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useWholeDishList } from "../../../lib/useDishesByIds";
import {
  useExternalRecordLinksFor,
  useMenuLinkStats,
} from "../../../lib/useExternalRecordLinkLists";
import { formatCountNoun, formatDateTime } from "../../../lib/format";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import { StatusChip, TableSkeleton } from "../../../ui/primitives";
import { Link } from "react-router-dom";
import { importRunDetailPath } from "./importRoutes";
import { eventDetailPath } from "../../../features/events/eventRoutes";
import { ParallelRunDifferences } from "./ParallelRunDifferences";
import { ParallelRunPeriodCheck } from "./ParallelRunPeriodCheck";
import { useActionFailure } from "../../../ui/action-result";
import { classifyCommandFailure } from "../../events/CommandFailure";
import { FailureBanner } from "../../events/FailureBanner";
import { useEventsInRange } from "../../facilities/useEventsById";

/** One row of a "by ..." table: both sides' counts under one name. */
function breakdownRows(
  tpp: Record<string, number> | undefined,
  capsule: Record<string, number> | undefined,
) {
  const names = new Set([
    ...Object.keys(tpp ?? {}),
    ...Object.keys(capsule ?? {}),
  ]);
  return [...names]
    .map((name) => {
      const capsuleCount = capsule?.[name] ?? 0;
      const tppCount = tpp?.[name] ?? 0;
      return {
        id: name,
        name: name.replace(/_/g, " "),
        capsule: capsuleCount,
        tpp: tppCount,
        diff: capsuleCount - tppCount,
      };
    })
    .sort((a, b) => b.tpp + b.capsule - (a.tpp + a.capsule));
}

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
  history: "Messages and tasks",
};

// Item type labels
const RECORD_TYPE_LABELS: Record<string, string> = {
  event_record: "Event",
  contact: "Contact",
  lead: "Lead",
  menu: "Menu",
  venue: "Venue",
  payment: "Payment",
  invoice: "Invoice",
  contract: "Contract",
  proposal: "Proposal",
  client: "Client",
  vendor: "Vendor",
  person: "Person",
  task: "Task",
  batch: "Batch",
  order: "Order",
  delivery: "Delivery",
  stock: "Stock",
  location: "Location",
  pack_list: "Pack List",
  client_communication: "Message or task",
};

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
  // Only the comparison window's events (PL-SCALE), not every event. The
  // window is fixed when the page opens, like selectedDateRange below.
  const [windowEnd] = useState(() => Date.now());
  const capsuleEvents = useEventsInRange({
    from: windowEnd - COMPARISON_WINDOW_MS,
    to: windowEnd + 1,
  });
  const capsuleDishes = useWholeDishList();
  // Runs of the comparison window only. A run gets its start time when it
  // is created, so its creation time is inside the window too.
  const importRuns = useQuery(api.adminWindow.importRunsSince, {
    since: windowEnd - COMPARISON_WINDOW_MS,
  });
  // The full link list is too long for one read: the menu check is counted
  // on the server, and only links to imported events are listed.
  const menuStats = useMenuLinkStats();
  const externalLinks = useExternalRecordLinksFor({
    capsuleEntities: ["event_record"],
  });
  const overview = useQuery(api.parallelRun.overview, {});
  const compareNow = useMutation(api.parallelRun.compareNow);
  const [comparing, setComparing] = useState(false);
  const { error: compareError, setError: setCompareError } = useActionFailure();
  const comparison = overview?.comparison ?? null;
  const summary = comparison?.summary ?? null;

  const handleCompareNow = async () => {
    setComparing(true);
    setCompareError(null);
    try {
      await compareNow({});
    } catch (err) {
      const failure = classifyCommandFailure(err);
      setCompareError(`${failure.title}: ${failure.detail}`);
    } finally {
      setComparing(false);
    }
  };

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

  // Get completed import runs for TPP data. The events comparison uses the
  // events subset; the Recent Import Runs table shows every completed dataset.
  const completedImportRuns = useMemo(() => {
    if (!importRuns) return [];
    return importRuns.filter(
      (run) =>
        run.status === "completed" &&
        run.startTime &&
        new Date(run.startTime) >= selectedDateRange.start &&
        new Date(run.startTime) <= selectedDateRange.end,
    );
  }, [importRuns, selectedDateRange]);

  const menuCatalogComparison = useMemo(() => {
    const menuRuns = completedImportRuns.filter(
      (run) => run.datasetType === "menus",
    );
    // Active TPP→Capsule menu links are the imported catalog, counted on the
    // server (menuLinkStats): a link is resolved only when its dish exists.
    // capsuleDishes === null means the read was denied, NOT an empty catalog.
    const dishesKnown = capsuleDishes !== null;
    const linkedDishIds = new Set(menuStats?.linkedDishIds ?? []);
    const tppTotal = menuStats?.tppTotal ?? 0;
    const unresolvedLinks = menuStats?.unresolvedLinks ?? 0;
    const capsuleTotal = capsuleDishes?.length ?? 0;
    const dishesWithoutLink = capsuleDishes
      ? capsuleDishes.filter((dish) => !linkedDishIds.has(dish._id)).length
      : 0;
    const matched = tppTotal - unresolvedLinks;
    const diff = capsuleTotal - tppTotal;
    const diffPercent = tppTotal > 0 ? (diff / tppTotal) * 100 : 0;
    return {
      dishesKnown,
      capsuleTotal,
      tppTotal,
      unresolvedLinks,
      dishesWithoutLink,
      matched,
      diff,
      diffPercent,
      status:
        diff === 0 && unresolvedLinks === 0 && dishesWithoutLink === 0
          ? ("match" as const)
          : Math.abs(diffPercent) > 5 ||
              unresolvedLinks > 0 ||
              dishesWithoutLink > 0
            ? ("error" as const)
            : ("warning" as const),
      runCount: menuRuns.length,
    };
  }, [completedImportRuns, capsuleDishes, menuStats]);

  // Both sides from the newest daily comparison (same rows as the list of
  // differences below).
  const comparisonMetrics = useMemo((): ComparisonMetric[] => {
    if (!summary) return [];
    const metric = (
      label: string,
      capsuleCount: number,
      tppCount: number,
      tolerance: number,
    ): ComparisonMetric => {
      const diff = capsuleCount - tppCount;
      const diffPercent = tppCount > 0 ? (diff / tppCount) * 100 : 0;
      return {
        label,
        capsuleCount,
        tppCount,
        diff,
        diffPercent,
        status:
          diff === 0
            ? "match"
            : Math.abs(diffPercent) > tolerance
              ? "error"
              : "warning",
      };
    };
    const metrics = [
      metric("Total Events", summary.capsule.events, summary.tpp.events, 5),
    ];
    const stages = new Set([
      ...Object.keys(STAGE_LABELS),
      ...Object.keys(summary.tpp.byStage),
      ...Object.keys(summary.capsule.byStage),
    ]);
    for (const stage of stages) {
      metrics.push(
        metric(
          `Status: ${STAGE_LABELS[stage] ?? stage}`,
          summary.capsule.byStage[stage] ?? 0,
          summary.tpp.byStage[stage] ?? 0,
          10,
        ),
      );
    }
    metrics.push(
      metric("Only in TPP (not matched yet)", 0, summary.onlyInTpp, 100),
      metric("Only in Capsule (made here)", summary.onlyInCapsule, 0, 100),
    );
    return metrics;
  }, [summary]);

  const revenueMetric = useMemo((): ComparisonMetric | null => {
    if (!summary) return null;
    const capsuleRevenue = summary.capsule.revenue;
    const tppRevenue = summary.tpp.revenue;
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
  }, [summary]);

  const salespersonBreakdown = useMemo(
    () =>
      breakdownRows(summary?.tpp.bySalesperson, summary?.capsule.bySalesperson),
    [summary],
  );
  const occasionBreakdown = useMemo(
    () => breakdownRows(summary?.tpp.byOccasion, summary?.capsule.byOccasion),
    [summary],
  );
  const serviceStyleBreakdown = useMemo(
    () =>
      breakdownRows(
        summary?.tpp.byServiceStyle,
        summary?.capsule.byServiceStyle,
      ),
    [summary],
  );
  const venueBreakdown = useMemo(
    () => breakdownRows(summary?.tpp.byVenue, summary?.capsule.byVenue),
    [summary],
  );

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
    capsuleDishes === undefined ||
    importRuns === undefined ||
    externalLinks === undefined ||
    menuStats === undefined ||
    overview === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <h1 className="display-title">Compare with TPP</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            A daily side-by-side of TPP and Capsule events from 30 days back
            onward, so you can confirm everything came over correctly before
            switching for good. Dig into any differences below.
          </p>
          <p className="mt-2 text-xs text-ink-3">
            {comparison
              ? `Last compared ${formatDateTime(comparison.comparedAt)}${
                  comparison.nextRunAt
                    ? ` · next check ${formatDateTime(comparison.nextRunAt)}`
                    : " · daily checks are off"
                }`
              : "Not compared yet. Compare now starts the daily check."}
          </p>
        </div>
        {overview !== null && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={comparing}
            onClick={() => void handleCompareNow()}
          >
            {comparing ? "Comparing…" : "Compare now"}
          </button>
        )}
      </header>
      {compareError && (
        <FailureBanner
          failure={classifyCommandFailure(new Error(compareError))}
        />
      )}

      <AdminWorkspaceNav />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          {/* Summary Cards */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-4 mt-6">
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">Capsule Events</h3>
              <p className="text-xl font-bold">
                {summary ? summary.capsule.events : "—"}
              </p>
              <p className="text-2xs text-ink-3">
                {summary
                  ? `From ${new Date(summary.windowStart).toLocaleDateString()} onward`
                  : "Not compared yet"}
              </p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">TPP Events</h3>
              <p className="text-xl font-bold">
                {summary ? summary.tpp.events : "—"}
              </p>
              <p className="text-2xs text-ink-3">
                {comparison
                  ? `${comparison.comparedCount} checked one by one`
                  : "Not compared yet"}
              </p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">
                Differences to settle
              </h3>
              <p
                className={`text-xl font-bold ${
                  (comparison?.openCount ?? 0) === 0 ? "text-ok" : "text-warn"
                }`}
              >
                {comparison ? comparison.openCount : "—"}
              </p>
              <p className="text-2xs text-ink-3">
                {comparison
                  ? `${comparison.newCount} new, ${comparison.clearedCount} agree now`
                  : "Not compared yet"}
              </p>
            </div>
            <div className="bg-white p-4 rounded-sm shadow">
              <h3 className="text-xs font-medium text-ink-3">
                Not matched yet
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
                <h2>How the counts compare</h2>
              </div>
              <span>{formatCountNoun(comparisonMetrics.length, "metric")}</span>
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

          {overview && (
            <ParallelRunDifferences
              differences={overview.differences}
              total={overview.totalDifferences}
            />
          )}
          {overview && <ParallelRunPeriodCheck last={overview.periodCheck} />}

          {/* Menu catalog comparison */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Menu Catalog Comparison</h2>
                <p className="text-xs text-ink-2">
                  Dishes imported from the TPP menu catalog vs the dish list in
                  Capsule.
                </p>
              </div>
              <span>
                {menuCatalogComparison.runCount} menu import
                {menuCatalogComparison.runCount === 1 ? "" : "s"}
              </span>
            </div>
            {menuCatalogComparison.tppTotal === 0 &&
            menuCatalogComparison.capsuleTotal === 0 ? (
              <p className="p-4 text-center text-ink-3 text-sm">
                No menu catalog imported yet.
              </p>
            ) : !menuCatalogComparison.dishesKnown ? (
              <p className="p-4 text-center text-ink-3 text-sm">
                Dish counts unavailable for your role — link totals shown only.
              </p>
            ) : (
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Capsule</th>
                      <th>TPP imported</th>
                      <th>Difference</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Total dishes</td>
                      <td>
                        {menuCatalogComparison.capsuleTotal.toLocaleString()}
                      </td>
                      <td>{menuCatalogComparison.tppTotal.toLocaleString()}</td>
                      <td
                        className={
                          menuCatalogComparison.capsuleTotal -
                            menuCatalogComparison.tppTotal ===
                          0
                            ? "text-ok"
                            : "text-warn"
                        }
                      >
                        {menuCatalogComparison.capsuleTotal -
                          menuCatalogComparison.tppTotal >=
                        0
                          ? "+"
                          : ""}
                        {(
                          menuCatalogComparison.capsuleTotal -
                          menuCatalogComparison.tppTotal
                        ).toLocaleString()}
                      </td>
                      <td>
                        <StatusChip status={menuCatalogComparison.status} />
                      </td>
                    </tr>
                    <tr>
                      <td>TPP items linked to a Capsule dish</td>
                      <td>{menuCatalogComparison.matched.toLocaleString()}</td>
                      <td>{menuCatalogComparison.tppTotal.toLocaleString()}</td>
                      <td
                        className={
                          menuCatalogComparison.unresolvedLinks === 0
                            ? "text-ok"
                            : "text-warn"
                        }
                      >
                        {menuCatalogComparison.unresolvedLinks > 0
                          ? `${menuCatalogComparison.unresolvedLinks.toLocaleString()} to resolve`
                          : "0"}
                      </td>
                      <td>
                        <StatusChip
                          status={
                            menuCatalogComparison.unresolvedLinks === 0
                              ? "match"
                              : "warning"
                          }
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>Capsule dishes without a TPP link</td>
                      <td>
                        {menuCatalogComparison.dishesWithoutLink.toLocaleString()}
                      </td>
                      <td>—</td>
                      <td
                        className={
                          menuCatalogComparison.dishesWithoutLink === 0
                            ? "text-ok"
                            : "text-warn"
                        }
                      >
                        {menuCatalogComparison.dishesWithoutLink > 0
                          ? `+${menuCatalogComparison.dishesWithoutLink.toLocaleString()}`
                          : "0"}
                      </td>
                      <td>
                        <StatusChip
                          status={
                            menuCatalogComparison.dishesWithoutLink === 0
                              ? "match"
                              : "warning"
                          }
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
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
                      <th>Salesperson</th>
                      <th>Capsule</th>
                      <th>TPP</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salespersonBreakdown.map((item) => (
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

            {/* Occasion Breakdown */}
            <section className="working-ledger">
              <div className="ledger-heading">
                <div>
                  <h2>By Occasion</h2>
                </div>
                <span>{formatCountNoun(occasionBreakdown.length, "type")}</span>
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
                <span>
                  {formatCountNoun(serviceStyleBreakdown.length, "style")}
                </span>
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
                <span>{formatCountNoun(venueBreakdown.length, "venue")}</span>
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
              <span>{formatCountNoun(recentChanges.length, "event")}</span>
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
                            ? formatDateTime(event.updatedAt)
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
                <h2>Still to match</h2>
                <p className="text-xs text-ink-2">
                  Imported items that still need to be checked or matched up.
                </p>
              </div>
              <span>{formatCountNoun(unresolvedMappings.length, "item")}</span>
            </div>
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Old system</th>
                    <th>Type</th>
                    <th>ID in the old system</th>
                    <th>In Capsule</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedMappings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-ok">
                        ✓ Everything is matched
                      </td>
                    </tr>
                  ) : (
                    unresolvedMappings.slice(0, 50).map((link) => (
                      <tr key={link._id}>
                        <td>
                          {SOURCE_SYSTEM_LABELS[link.sourceSystem] ??
                            link.sourceSystem}
                        </td>
                        <td>
                          {RECORD_TYPE_LABELS[link.recordType] ||
                            RECORD_TYPE_LABELS[link.capsuleEntity] ||
                            link.recordType}
                        </td>
                        <td
                          className="font-mono text-xs text-ink-3"
                          title={link.externalId}
                        >
                          {link.externalId.slice(0, 16)}…
                        </td>
                        <td title={link.capsuleId || undefined}>
                          {link.capsuleId ? "Linked" : "Not matched"}
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
                Showing 50 of {unresolvedMappings.length} leftover items
              </p>
            )}
          </section>

          {/* Import Runs Reference */}
          <section className="working-ledger mt-6">
            <div className="ledger-heading">
              <div>
                <h2>Recent imports</h2>
                <p className="text-xs text-ink-2">
                  The imports these comparisons are based on.
                </p>
              </div>
              <span>
                {formatCountNoun(completedImportRuns.length, "import")}
              </span>
            </div>
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Dataset</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Items</th>
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
            <h3 className="font-semibold text-info">What these numbers mean</h3>
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
                • <strong>Still to match</strong>: Imported items to
                double-check before the final switch
              </li>
              <li>
                • <strong>Recent changes</strong>: Events modified in the last
                24 hours for review
              </li>
              <li>
                • <strong>Look closer</strong>: Click View to open individual
                items
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
