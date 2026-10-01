import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useSendOutWithReason } from "../../lib/useReasonedChanges";
import {
  useListDepartureOverride,
  useListEvent,
  useListEventAssignment,
  useListEventStaffNeed,
  useListEventVehicleAssignment,
  useListPackList,
  useListPackListItem,
  useListPerson,
  useListTrailer,
  useListVehicle,
  useListVehicleTripCheck,
  usePackListDispatch,
  usePackListMarkLoaded,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionNotice } from "../../ui/action-result";
import { EmptyState, PageHeader, TableSkeleton } from "../../ui/primitives";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import { eventDetailPath } from "../events/eventRoutes";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { readyToLeave, type LeaveSummary } from "./readyToLeave";
import type { TripCheckRow } from "./tripCheck";
import { packRigs } from "./usePackRigs";
import "./DispatchBoard.css";

const DAY_MS = 86_400_000;
/** Days shown, as whole days from today: [from, to). */
const RANGES = [
  { key: "today", label: "Today", from: 0, to: 1 },
  { key: "tomorrow", label: "Tomorrow", from: 1, to: 2 },
  { key: "week", label: "Next 7 days", from: 0, to: 7 },
  { key: "past", label: "Last 7 days", from: -7, to: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/** Stages where an event still has a truck to send. */
const LIVE_STAGES = new Set([
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "final",
  "executing",
]);

function personName(
  person: { givenName?: string | null; familyName?: string | null } | undefined,
) {
  return `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim();
}

/**
 * Dispatch board: every event going out in the chosen days, soonest first,
 * with what is still open before its trucks leave. "Fix first" items are the
 * ones a lead would not leave without. Nothing here stops a truck: the
 * person sending it out says why and that reason is kept on the event.
 */
export function DispatchBoardPage() {
  const authStatus = useAuthStatus();
  const events = useListEvent();
  const packLists = useListPackList();
  const packLines = useListPackListItem();
  const rigs = useListEventVehicleAssignment();
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  const people = useListPerson();
  const tripChecks = useListVehicleTripCheck() as TripCheckRow[] | undefined;
  const assignments = useListEventAssignment();
  const staffNeeds = useListEventStaffNeed();
  const overrides = useListDepartureOverride();
  const markLoaded = usePackListMarkLoaded();
  const dispatch = usePackListDispatch();
  const sendOutWithReason = useSendOutWithReason();

  const [params, setParams] = useSearchParams();
  const rangeKey: RangeKey =
    RANGES.find((range) => range.key === params.get("days"))?.key ?? "today";
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

  const loading = [
    events,
    packLists,
    packLines,
    rigs,
    vehicles,
    trailers,
    tripChecks,
    assignments,
    staffNeeds,
  ].some((value) => value === undefined);

  const dayStart = new Date().setHours(0, 0, 0, 0);
  const range = RANGES.find((entry) => entry.key === rangeKey)!;
  const from = dayStart + range.from * DAY_MS;
  const to = dayStart + range.to * DAY_MS;

  const rows = useMemo(() => {
    if (loading) return [];
    return (events ?? [])
      .filter(
        (event) =>
          event.deletedAt == null &&
          LIVE_STAGES.has(String(event.stage)) &&
          event.startsAt != null &&
          event.startsAt >= from &&
          event.startsAt < to,
      )
      .sort((a, b) => Number(a.startsAt) - Number(b.startsAt))
      .map((event) => {
        const eventRigs = packRigs(
          event._id,
          rigs ?? [],
          vehicles ?? [],
          trailers ?? [],
        );
        const summary = readyToLeave({
          event,
          packLists: (packLists ?? []).map((row) => ({
            ...row,
            status: String(row.status),
          })),
          packLines: (packLines ?? []).map((row) => ({
            ...row,
            status: String(row.status),
            requiredQuantity: Number(row.requiredQuantity),
            packedQuantity: Number(row.packedQuantity),
          })),
          rigs: rigs ?? [],
          rigLabel: (rigId) =>
            eventRigs.find((rig) => rig.id === rigId)?.label ?? "Truck",
          tripChecks: tripChecks ?? [],
          assignments: (assignments ?? []).map((row) => ({
            ...row,
            status: String(row.status),
          })),
          staffNeeds: (staffNeeds ?? []).map((row) => ({
            ...row,
            status: String(row.status),
          })),
        });
        return { event, eventRigs, summary };
      });
  }, [
    loading,
    events,
    packLists,
    packLines,
    rigs,
    vehicles,
    trailers,
    tripChecks,
    assignments,
    staffNeeds,
    from,
    to,
  ]);

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const canAct = [
    "logisticsAccess",
    "kitchenAccess",
    "eventAccess",
    "salesAccess",
    "manageAccess",
  ].some((capability) => permissions.has(capability));

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const sendOut = async (
    eventId: string,
    list: { _id: string; version: number; name: string },
    summary: LeaveSummary,
  ) => {
    const open = summary.items.filter((item) => item.severity === "fix");
    let reason: string | null = null;
    if (open.length > 0) {
      reason = await prompt.askReason({
        title: `Send out with ${formatCountNoun(open.length, "open item")}`,
        description: `${open.map((item) => item.text).join(". ")}. Say why it is fine to leave; the reason is kept on the event.`,
        label: "Why is it fine to leave?",
        placeholder: "For example: the venue has its own chafers",
        confirmLabel: "Send out anyway",
        tone: "danger",
      });
      if (!reason) return;
    }
    void run(`${list._id}:dispatch`, async () => {
      // The send-out and its reason are saved together: both or neither.
      if (reason)
        await sendOutWithReason({
          packListId: list._id as never,
          version: list.version,
          eventId: eventId as never,
          reason,
          openItems: open.map((item) => item.text).join("\n"),
        });
      else await dispatch({ docId: list._id, version: list.version });
      setNotice(`${list.name || "Pack list"} sent out.`);
    });
  };

  const fixTotal = rows.reduce((sum, row) => sum + row.summary.fixCount, 0);
  const leftTotal = rows.filter((row) => row.summary.left).length;

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        eyebrow="Logistics · Dispatch"
        title="Dispatch board"
        lead="Every event going out, soonest first, with what is still open before its trucks leave."
        facts={[
          { label: "Events", value: loading ? "…" : rows.length },
          { label: "Fix first", value: loading ? "…" : fixTotal },
          { label: "Left", value: loading ? "…" : leftTotal },
        ]}
        actions={
          <div
            className="dispatch-switch"
            role="tablist"
            aria-label="Days shown"
          >
            {RANGES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={rangeKey === entry.key}
                data-active={rangeKey === entry.key || undefined}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (entry.key === "today") next.delete("days");
                  else next.set("days", entry.key);
                  setParams(next, { replace: true });
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
      />
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            rangeKey === "today"
              ? "Nothing goes out today."
              : rangeKey === "tomorrow"
                ? "Nothing goes out tomorrow."
                : rangeKey === "past"
                  ? "Nothing went out in the last 7 days."
                  : "Nothing goes out in the next 7 days."
          }
          hint="Events show here on the day they start, until they are finished."
          action={
            <Link className="btn btn-ghost btn-sm" to="/events/tracker">
              Open the event tracker
            </Link>
          }
        />
      ) : (
        <ul className="dispatch-board" data-testid="dispatch-board">
          {rows.map(({ event, eventRigs, summary }) => {
            const lists = (packLists ?? []).filter(
              (row) =>
                row.deletedAt == null &&
                row.eventId === event._id &&
                String(row.status) !== "cancelled",
            );
            const crew = (assignments ?? []).filter(
              (row) =>
                row.deletedAt == null &&
                row.eventId === event._id &&
                !["unassigned", "no_show"].includes(String(row.status)),
            );
            const confirmed = crew.filter(
              (row) => String(row.status) !== "assigned",
            ).length;
            const drivers = (rigs ?? [])
              .filter(
                (row) =>
                  row.deletedAt == null &&
                  row.activeEventId === event._id &&
                  row.driverId != null,
              )
              .map((row) =>
                personName((people ?? []).find((p) => p._id === row.driverId)),
              )
              .filter(Boolean);
            const reasons = (overrides ?? []).filter(
              (row) => row.deletedAt == null && row.eventId === event._id,
            );
            const tone = summary.left
              ? "left"
              : summary.fixCount > 0
                ? "fix"
                : summary.lookCount > 0
                  ? "look"
                  : "ready";
            return (
              <li key={event._id} className="dispatch-row" data-tone={tone}>
                <div className="dispatch-row-head">
                  <div className="min-w-0">
                    <p className="dispatch-row-when">
                      {formatDate(event.startsAt)} ·{" "}
                      {formatTime(event.startsAt)}
                    </p>
                    <h2 className="dispatch-row-title">
                      <Link to={eventDetailPath(event._id)}>
                        {event.eventNumber ? `#${event.eventNumber} ` : ""}
                        {event.title}
                      </Link>
                    </h2>
                    <p className="text-base text-ink-2">
                      {[
                        event.venueName,
                        event.expectedHeadcount != null
                          ? formatCountNoun(event.expectedHeadcount, "guest")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`chip normal-case ${
                      tone === "left"
                        ? "chip-tone-info"
                        : tone === "fix"
                          ? "chip-tone-danger"
                          : tone === "look"
                            ? "chip-tone-warn"
                            : "chip-tone-ok"
                    }`}
                  >
                    {tone === "left"
                      ? "Left"
                      : tone === "fix"
                        ? `${summary.fixCount} to fix`
                        : tone === "look"
                          ? `${summary.lookCount} to look at`
                          : "Ready"}
                  </span>
                </div>

                <div className="fact-row">
                  <span className="fact">
                    <b>Truck:</b>
                    {eventRigs.length > 0
                      ? eventRigs.map((rig) => rig.label).join(", ")
                      : "None"}
                  </span>
                  <span className="fact">
                    <b>Driver:</b>
                    {drivers.length > 0 ? drivers.join(", ") : "None"}
                  </span>
                  <span className="fact">
                    <b>Crew:</b>
                    {crew.length > 0
                      ? `${confirmed} of ${crew.length} confirmed`
                      : "None"}
                  </span>
                  <span className="fact">
                    <b>Packed:</b>
                    {summary.packedPercent == null
                      ? "Nothing to pack"
                      : `${summary.packedPercent}%`}
                  </span>
                </div>

                {summary.items.length > 0 && !summary.left ? (
                  <ul className="dispatch-open">
                    {summary.items.map((item) => (
                      <li key={item.key} data-severity={item.severity}>
                        <span className="dispatch-open-mark">
                          {item.severity === "fix" ? "Fix first" : "Look"}
                        </span>
                        <Link to={item.to}>{item.text}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {reasons.map((row) => (
                  <p key={row._id} className="text-base text-ink-2">
                    Sent out with open items
                    {row.recordedByPersonId
                      ? ` by ${personName((people ?? []).find((p) => p._id === row.recordedByPersonId)) || "a crew member"}`
                      : ""}
                    : {row.reason}
                  </p>
                ))}

                <div className="supply-row-actions">
                  <Link
                    className="btn btn-ghost btn-sm"
                    to={eventDetailPath(event._id, "timeline")}
                  >
                    Trip checks
                  </Link>
                  {lists.map((list) => {
                    const status = String(list.status);
                    const label = list.name || "Pack list";
                    return (
                      <span key={list._id} className="contents">
                        <Link
                          className="btn btn-ghost btn-sm"
                          to={`/logistics/packs/${list._id}`}
                        >
                          {lists.length > 1 ? `Open ${label}` : "Load sheet"}
                        </Link>
                        {canAct && status === "packed" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() =>
                              void run(`${list._id}:loaded`, async () => {
                                await markLoaded({
                                  docId: list._id,
                                  version: list.version,
                                });
                                setNotice(`${label} marked loaded.`);
                              })
                            }
                          >
                            {busy === `${list._id}:loaded`
                              ? "Working…"
                              : lists.length > 1
                                ? `Mark ${label} loaded`
                                : "Mark loaded"}
                          </button>
                        ) : null}
                        {canAct && status === "loaded" ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy != null}
                            onClick={() =>
                              void sendOut(event._id, list, summary)
                            }
                          >
                            {busy === `${list._id}:dispatch`
                              ? "Working…"
                              : lists.length > 1
                                ? `Send out ${label}`
                                : "Send out"}
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
