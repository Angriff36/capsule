import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  useListEquipment,
  useListEquipmentIssue,
  useListEquipmentReservation,
  useListEvent,
  useListPackList,
  useListPackListItem,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { EmptyState, PageHeader, TableSkeleton } from "../../ui/primitives";
import { eventDetailPath } from "../events/eventRoutes";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { packReturnSummary, packReturnTotals } from "./packReturn";
import { comesBack } from "./packViews";
import "./DispatchBoard.css";

const TABS = [
  { key: "open", label: "Coming back" },
  { key: "problems", label: "Lost or broken" },
  { key: "done", label: "Counted" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ISSUE_KIND_LABEL: Record<string, string> = {
  damaged: "Broken",
  missing: "Missing",
  cleaning: "Needs cleaning",
  repair: "Needs repair",
  late_return: "Late back",
  vendor_return: "Short vendor return",
};

const show = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

/**
 * Returns: every event whose load went out, with what still has to be
 * counted back in, what was lost or broken, and the events already counted.
 * Pack lines are counted on the load sheet's "Coming back" view; equipment
 * holds are returned on the event's equipment page. This page only adds
 * them up across events.
 */
export function ReturnsPage() {
  const events = useListEvent();
  const packLists = useListPackList();
  const packLines = useListPackListItem();
  const reservations = useListEquipmentReservation();
  const equipment = useListEquipment();
  const issues = useListEquipmentIssue();
  const people = useListPerson();
  const [params, setParams] = useSearchParams();
  const tab: TabKey =
    TABS.find((entry) => entry.key === params.get("show"))?.key ?? "open";

  const loading = [events, packLists, packLines, reservations, issues].some(
    (value) => value === undefined,
  );

  const rows = useMemo(() => {
    if (loading) return [];
    return (events ?? [])
      .filter((event) => event.deletedAt == null)
      .map((event) => {
        const lists = (packLists ?? []).filter(
          (list) =>
            list.deletedAt == null &&
            list.eventId === event._id &&
            String(list.status) === "dispatched",
        );
        const listIds = new Set(lists.map((list) => list._id));
        const lines = (packLines ?? [])
          .filter(
            (line) =>
              line.deletedAt == null &&
              line.listedAt != null &&
              line.retiredAt == null &&
              listIds.has(line.packListId) &&
              Number(line.packedQuantity) > 0 &&
              comesBack(line),
          )
          .map((line) => ({
            ...line,
            packedQuantity: Number(line.packedQuantity),
          }));
        const totals = packReturnTotals(lines);
        const out = (reservations ?? []).filter(
          (row) =>
            row.deletedAt == null &&
            row.eventId === event._id &&
            String(row.status) === "checked_out",
        );
        return { event, lists, lines, totals, out };
      })
      .filter((row) => row.lists.length > 0 || row.out.length > 0)
      .sort((a, b) => Number(b.event.startsAt ?? 0) - Number(a.event.startsAt));
  }, [loading, events, packLists, packLines, reservations]);

  const open = rows.filter((row) => row.totals.open > 0 || row.out.length > 0);
  const done = rows.filter(
    (row) => row.totals.open === 0 && row.out.length === 0,
  );

  const eventTitle = (id: string | null | undefined) =>
    (events ?? []).find((event) => event._id === id)?.title ?? "No event";
  const personName = (id: string | null | undefined) => {
    const person = (people ?? []).find((row) => row._id === id);
    return `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim();
  };

  const lineProblems = rows.flatMap((row) =>
    row.lines
      .filter(
        (line) =>
          Number(line.lostQuantity ?? 0) > 0 ||
          Number(line.damagedQuantity ?? 0) > 0,
      )
      .map((line) => ({ line, event: row.event })),
  );
  const openIssues = (issues ?? []).filter(
    (issue) =>
      issue.deletedAt == null &&
      String(issue.status) === "open" &&
      issue.raisedAt != null,
  );
  const problemCount = lineProblems.length + openIssues.length;

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        eyebrow="Logistics · Returns"
        title="Returns"
        lead="What went out, what still has to be counted back in, and what was lost or broken."
        facts={[
          { label: "Coming back", value: loading ? "…" : open.length },
          { label: "Lost or broken", value: loading ? "…" : problemCount },
          { label: "Counted", value: loading ? "…" : done.length },
        ]}
        actions={
          <div className="dispatch-switch" role="tablist" aria-label="Show">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={tab === entry.key}
                data-active={tab === entry.key || undefined}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (entry.key === "open") next.delete("show");
                  else next.set("show", entry.key);
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

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tab === "problems" ? (
        problemCount === 0 ? (
          <EmptyState
            title="Nothing is lost or broken."
            hint="A pack line counted back with a lost or broken amount shows here, and so does an open equipment problem."
          />
        ) : (
          <div className="supply-table-wrap mt-4">
            <table className="supply-table" data-testid="returns-problems">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Event</th>
                  <th>What happened</th>
                  <th>Who counted or deals with it</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {lineProblems.map(({ line, event }) => (
                  <tr key={line._id}>
                    <td>
                      <strong>{line.description}</strong>
                      {line.returnFinding ? (
                        <small className="block">
                          Found: {line.returnFinding}
                        </small>
                      ) : null}
                    </td>
                    <td>{event.title}</td>
                    <td>
                      {[
                        Number(line.lostQuantity ?? 0) > 0
                          ? `Lost ${show(Number(line.lostQuantity))}`
                          : null,
                        Number(line.damagedQuantity ?? 0) > 0
                          ? `Broken ${show(Number(line.damagedQuantity))}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td>{personName(line.returnCountedByPersonId) || "—"}</td>
                    <td>
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={`/logistics/packs/${line.packListId}?view=returns`}
                      >
                        Load sheet
                      </Link>
                    </td>
                  </tr>
                ))}
                {openIssues.map((issue) => (
                  <tr key={issue._id}>
                    <td>
                      <strong>
                        {(equipment ?? []).find(
                          (row) => row._id === issue.equipmentId,
                        )?.name ?? "Equipment"}
                      </strong>
                      <small className="block">{issue.description}</small>
                    </td>
                    <td>{eventTitle(issue.eventId)}</td>
                    <td>
                      {ISSUE_KIND_LABEL[String(issue.kind)] ?? "Problem"}{" "}
                      {issue.quantity}
                    </td>
                    <td>{issue.ownerName || "—"}</td>
                    <td>
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={
                          issue.eventId
                            ? eventDetailPath(issue.eventId, "equipment")
                            : "/facilities/equipment"
                        }
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (tab === "open" ? open : done).length === 0 ? (
        <EmptyState
          title={
            tab === "open"
              ? "Nothing is waiting to be counted back in."
              : "No returns have been counted yet."
          }
          hint={
            tab === "open"
              ? "An event shows here once its pack list has gone out, until every line that comes back is counted and every piece of equipment is returned."
              : "An event moves here when every line that comes back is counted and every piece of equipment is returned."
          }
          action={
            <Link className="btn btn-ghost btn-sm" to="/logistics/dispatch">
              Open the dispatch board
            </Link>
          }
        />
      ) : (
        <ul className="dispatch-board" data-testid="returns-board">
          {(tab === "open" ? open : done).map(
            ({ event, lists, lines, totals, out }) => (
              <li
                key={event._id}
                className="dispatch-row"
                data-tone={
                  totals.open > 0 || out.length > 0
                    ? "look"
                    : totals.lost + totals.damaged > 0
                      ? "fix"
                      : "ready"
                }
              >
                <div className="dispatch-row-head">
                  <div className="min-w-0">
                    <p className="dispatch-row-when">
                      {formatDate(event.startsAt)}
                    </p>
                    <h2 className="dispatch-row-title">
                      <Link to={eventDetailPath(event._id)}>
                        {event.eventNumber ? `#${event.eventNumber} ` : ""}
                        {event.title}
                      </Link>
                    </h2>
                  </div>
                  <span
                    className={`chip normal-case ${totals.open > 0 || out.length > 0 ? "chip-tone-warn" : "chip-tone-ok"}`}
                  >
                    {totals.open > 0 || out.length > 0
                      ? "Still to count"
                      : "All counted"}
                  </span>
                </div>
                <div className="fact-row">
                  <span className="fact">
                    <b>Pack lines counted:</b>
                    {totals.lines === 0
                      ? "Nothing comes back"
                      : `${totals.lines - totals.open} of ${totals.lines}`}
                  </span>
                  <span className="fact">
                    <b>Equipment still out:</b>
                    {out.length === 0
                      ? "None"
                      : formatCountNoun(out.length, "hold")}
                  </span>
                  <span className="fact">
                    <b>Lost:</b>
                    {show(totals.lost)}
                  </span>
                  <span className="fact">
                    <b>Broken:</b>
                    {show(totals.damaged)}
                  </span>
                </div>
                {tab === "done" && lines.length > 0 ? (
                  <ul className="dispatch-open">
                    {lines
                      .filter(
                        (line) =>
                          Number(line.lostQuantity ?? 0) > 0 ||
                          Number(line.damagedQuantity ?? 0) > 0,
                      )
                      .map((line) => (
                        <li key={line._id} data-severity="fix">
                          <span>
                            {line.description}: {packReturnSummary(line)}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : null}
                <div className="supply-row-actions">
                  {lists.map((list) => (
                    <Link
                      key={list._id}
                      className={
                        tab === "open" && totals.open > 0
                          ? "btn btn-primary btn-sm"
                          : "btn btn-ghost btn-sm"
                      }
                      to={`/logistics/packs/${list._id}?view=returns`}
                    >
                      {lists.length > 1
                        ? `Count ${list.name || "pack list"}`
                        : tab === "open"
                          ? "Count the return"
                          : "Load sheet"}
                    </Link>
                  ))}
                  {out.length > 0 ? (
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={eventDetailPath(event._id, "equipment")}
                    >
                      Return equipment
                    </Link>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
