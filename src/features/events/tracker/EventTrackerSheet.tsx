import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../../admin/rolePermissionAudit";
import {
  useListClient,
  useListEvent,
  useListEventNumberAssignment,
  useListEventVehicleAssignment,
  useListInvoice,
  useListPackList,
  useListPerson,
  useListReviewFlag,
  useListServiceStyle,
  useListTrailer,
  useListVehicle,
} from "../../../lib/manifest-convex-react";
import { QueryLoadState } from "../../../ui/QueryLoadState";
import { useSlowQuery } from "../../../ui/useSlowQuery";
import { startOfDay } from "../../home/homeCalendar";
import { FailureBanner } from "../FailureBanner";
import type { RigOption } from "./TrackerRigCells";
import { TrackerSheetRow } from "./TrackerSheetRow";
import { buildTrackerRows, monthBounds, type TrackerRow } from "./trackerSheet";
import { useTrackerRowActions } from "./useTrackerRowActions";

function parseMonth(raw: string | null): { year: number; month: number } {
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  const month = match ? Number(match[2]) - 1 : -1;
  if (match && month >= 0 && month <= 11)
    return { year: Number(match[1]), month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function monthParam(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rigLabel(row: { make: string; model: string; registration: string }) {
  const name = `${row.make} ${row.model}`.trim();
  return row.registration ? `${name} · ${row.registration}` : name;
}

/**
 * Event tracker sheet: one calendar month as a spreadsheet, one row per event.
 * It replaces the warehouse Google Sheet: event number, date, event, vehicles,
 * trailers, driver, loaded, binder and pack status, all editable in the cell.
 */
export function EventTrackerSheet() {
  const authStatus = useAuthStatus();
  const events = useListEvent();
  const clients = useListClient();
  const invoices = useListInvoice();
  const packLists = useListPackList();
  const reviewFlags = useListReviewFlag();
  const assignments = useListEventVehicleAssignment();
  const numberAssignments = useListEventNumberAssignment();
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  const people = useListPerson();
  const serviceStyles = useListServiceStyle();

  const {
    actionsFor,
    numberRows,
    busyId,
    failure,
    clearFailure,
    resetKey,
    savedToast,
  } = useTrackerRowActions();
  const [params, setParams] = useSearchParams();
  const { year, month } = parseMonth(params.get("month"));
  const [search, setSearch] = useState("");
  const [showEmptyDays, setShowEmptyDays] = useState(true);

  const loading = [
    authStatus,
    events,
    clients,
    invoices,
    packLists,
    reviewFlags,
    assignments,
    numberAssignments,
    vehicles,
    trailers,
    people,
    serviceStyles,
  ].some((value) => value === undefined);
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  const bounds = monthBounds(year, month);
  const rows = useMemo(
    () =>
      loading
        ? []
        : buildTrackerRows(
            {
              events: events ?? [],
              clients: clients ?? [],
              invoices: invoices ?? [],
              packLists: packLists ?? [],
              reviewFlags: reviewFlags ?? [],
              assignments: assignments ?? [],
              numberAssignments: numberAssignments ?? [],
            },
            bounds.start,
            bounds.end,
          ),
    [
      loading,
      events,
      clients,
      invoices,
      packLists,
      reviewFlags,
      assignments,
      numberAssignments,
      bounds.start,
      bounds.end,
    ],
  );

  if (loading) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the tracker"
      />
    );
  }

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const has = (...caps: string[]) => caps.some((cap) => permissions.has(cap));
  const canEditEvent = has("eventAccess", "salesAccess");
  const canChangeStyle = has("eventManageAccess");
  const canEditRigs = has(
    "eventAccess",
    "salesAccess",
    "logisticsAccess",
    "manageAccess",
  );
  const rowPermissions = {
    canEditEvent,
    canChangeStyle,
    canEditRigs,
    canOpenList: canEditRigs,
  };

  const vehicleOptions: RigOption[] = (vehicles ?? [])
    .filter((v) => v.deletedAt == null && v.registeredAt != null)
    .filter((v) => String(v.operationalStatus) !== "retired")
    .map((v) => ({ id: v._id, label: rigLabel(v) }));
  const trailerOptions: RigOption[] = (trailers ?? [])
    .filter((t) => t.deletedAt == null && t.registeredAt != null)
    .filter((t) => String(t.operationalStatus) !== "retired")
    .map((t) => ({ id: t._id, label: rigLabel(t) }));
  const driverOptions: RigOption[] = (people ?? [])
    .filter((p) => p.deletedAt == null && p.status === "active")
    .map((p) => ({
      id: p._id,
      label: `${p.givenName ?? ""} ${p.familyName ?? ""}`.trim() || "Unnamed",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const styleOptions: RigOption[] = (serviceStyles ?? [])
    .filter((s) => s.deletedAt == null && s.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((s) => ({ id: s._id, label: s.name }));
  const styleName = (id: string | null) =>
    id ? (serviceStyles ?? []).find((s) => s._id === id)?.name : undefined;

  const needle = search.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      needle === "" ||
      [row.eventNumber, row.title, row.client]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  const today = startOfDay(Date.now());
  const days: { dayStart: number; rows: TrackerRow[] }[] = [];
  for (
    let cursor = new Date(bounds.start);
    cursor.getTime() < bounds.end;
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    )
  ) {
    const dayStart = cursor.getTime();
    const dayRows = visible.filter(
      (row) => row.startsAt != null && startOfDay(row.startsAt) === dayStart,
    );
    if (dayRows.length > 0 || (showEmptyDays && needle === ""))
      days.push({ dayStart, rows: dayRows });
  }

  const goto = (y: number, m: number) => {
    const next = new URLSearchParams(params);
    next.set("month", monthParam(y, m));
    setParams(next, { replace: true });
  };
  const monthTitle = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const unnumbered = visible.filter((row) => row.storedEventNumber === "");
  const noRig = visible.filter((row) => row.rigs.length === 0).length;
  const stuck = visible.filter(
    (row) => row.packState === "needs_assistance",
  ).length;

  return (
    <div className="tracker-sheet-wrap">
      <div className="tracker-sheet-bar">
        <div className="tracker-sheet-month">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Previous month"
            onClick={() => goto(year, month - 1)}
          >
            ‹
          </button>
          <strong>{monthTitle}</strong>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Next month"
            onClick={() => goto(year, month + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const now = new Date();
              goto(now.getFullYear(), now.getMonth());
            }}
          >
            This month
          </button>
        </div>
        <div className="fact-row">
          <span className="fact">
            <b>Events:</b>
            {visible.length}
          </span>
          <span className="fact">
            <b>No vehicle:</b>
            {noRig}
          </span>
          <span className="fact">
            <b>Needs assistance:</b>
            {stuck}
          </span>
          {canEditEvent && unnumbered.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busyId != null}
              onClick={() => void numberRows(unnumbered)}
            >
              {busyId === "numbering"
                ? "Numbering…"
                : `Number ${unnumbered.length} ${unnumbered.length === 1 ? "event" : "events"}`}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="tracker-sheet-toggle">
            <input
              type="checkbox"
              checked={showEmptyDays}
              onChange={(domEvent) =>
                setShowEmptyDays(domEvent.currentTarget.checked)
              }
            />
            Show empty days
          </label>
          <input
            type="search"
            className="input tracker-search"
            placeholder="Find #, event, client"
            value={search}
            onChange={(domEvent) => setSearch(domEvent.target.value)}
            aria-label="Find events in this month"
          />
        </div>
      </div>

      {failure ? (
        <div className="mt-3">
          <FailureBanner failure={failure} onDismiss={clearFailure} />
        </div>
      ) : null}

      <div className="tracker-sheet-scroll">
        <table className="tracker-sheet">
          <thead>
            <tr>
              <th className="tracker-col-num">Event #</th>
              <th className="tracker-col-date">Date</th>
              <th className="tracker-col-event">Event</th>
              <th className="tracker-col-style">Service style</th>
              <th className="tracker-col-rigs">
                <div className="tracker-rig tracker-rig-head">
                  <span>Vehicle</span>
                  <span>Trailer</span>
                  <span>Driver</span>
                  <span>Loaded</span>
                </div>
              </th>
              <th className="tracker-col-binder">Binder</th>
              <th className="tracker-col-pack">Pack status</th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr>
                <td colSpan={7} className="tracker-sheet-empty">
                  No events match in {monthTitle}.
                </td>
              </tr>
            ) : null}
            {days.map((day) => {
              const date = new Date(day.dayStart);
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              const dayLabel = date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              if (day.rows.length === 0) {
                return (
                  <tr
                    key={day.dayStart}
                    className="tracker-sheet-blank"
                    data-today={day.dayStart === today || undefined}
                    data-weekend={weekend || undefined}
                  >
                    <td />
                    <td>{dayLabel}</td>
                    <td colSpan={5} />
                  </tr>
                );
              }
              return day.rows.map((row) => (
                <TrackerSheetRow
                  key={row.id}
                  row={row}
                  dayLabel={dayLabel}
                  isToday={day.dayStart === today}
                  isWeekend={weekend}
                  busy={busyId === row.id}
                  resetKey={resetKey}
                  permissions={rowPermissions}
                  styleOptions={styleOptions}
                  retiredStyleName={styleName(row.serviceStyleId)}
                  vehicles={vehicleOptions}
                  trailers={trailerOptions}
                  drivers={driverOptions}
                  actions={actionsFor(row)}
                />
              ));
            })}
          </tbody>
        </table>
      </div>
      {savedToast}
    </div>
  );
}
