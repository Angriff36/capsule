import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useClientsByIds } from "../../../lib/useClientDirectory";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../../admin/rolePermissionAudit";
import {
  useListEquipment,
  useListPerson,
  useListTrailer,
  useListVehicle,
} from "../../../lib/manifest-convex-react";
import { useEventMonthRows } from "../../../lib/useEventMonthRows";
import { useInvoicesForEvents } from "../../../lib/useEventAreaRows";
import { useEventRecordsInRange } from "../../facilities/useEventsById";
import { QueryLoadState } from "../../../ui/QueryLoadState";
import { SegmentedTabs } from "../../../ui/SegmentedTabs";
import { useSlowQuery } from "../../../ui/useSlowQuery";
import { useActionPrompt } from "../../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { warningsFor, findConflicts, type Booking } from "./bookingConflicts";
import { BookingRulesPanel, useBookingRules } from "./BookingRulesPanel";
import { EquipmentStockPanel } from "./EquipmentStockPanel";
import {
  TrackerBoardRow,
  statusGroup,
  STATUS_LABEL,
  type StatusGroup,
} from "./TrackerBoardRow";
import type { RigOption } from "./TrackerRigCells";
import { buildTrackerRows, monthBounds } from "./trackerSheet";
import {
  eventWindow,
  liveCrew,
  liveHolds,
  monthBookings,
  peakHeld,
  trackerKind,
  vehicleLabel,
} from "./trackerBoardModel";
import { TrackerStats } from "./TrackerStats";
import { useTrackerRowActions } from "./useTrackerRowActions";
import "./trackerBoard.css";

type Tab = "all" | StatusGroup;
const TABS: Tab[] = [
  "all",
  "confirmed",
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

function parseMonth(raw: string | null): { year: number; month: number } {
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  const month = match ? Number(match[2]) - 1 : -1;
  if (match && month >= 0 && month <= 11)
    return { year: Number(match[1]), month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

/**
 * The event tracker (owner, 2026-10-14, after the Banani "Event Tracker"
 * design): one month, one row per event, with vehicles and drivers, crew,
 * equipment, decor and notes in the row. It warns before something is
 * double-booked under the company's rules, and the equipment stockpile is
 * edited on the same page.
 */
export function TrackerBoard() {
  const authStatus = useAuthStatus();
  const [params, setParams] = useSearchParams();
  const { year, month } = parseMonth(params.get("month"));
  const bounds = monthBounds(year, month);
  const monthWindow = useMemo(
    () => ({ from: bounds.start, to: bounds.end }),
    [bounds.start, bounds.end],
  );
  const events = useEventRecordsInRange(monthWindow);
  const clients = useClientsByIds(
    (events ?? []).map((event) => event.clientId),
  );
  const invoices = useInvoicesForEvents(events?.map((event) => event._id));
  const monthRows = useEventMonthRows(events?.map((event) => event._id));
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  const people = useListPerson();
  const equipment = useListEquipment();
  const { rules, save: saveRule } = useBookingRules();
  const { prompt, host: promptHost } = useActionPrompt();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<"rules" | "stock" | null>(null);
  const [alertHidden, setAlertHidden] = useState(false);
  const [panelFailure, setPanelFailure] = useState<CommandFailure | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);

  const loading = [
    authStatus,
    events,
    clients,
    invoices,
    monthRows,
    vehicles,
    trailers,
    people,
  ].some((value) => value === undefined);
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  const rows = useMemo(
    () =>
      loading || !monthRows
        ? []
        : buildTrackerRows(
            {
              events: events ?? [],
              clients: clients ?? [],
              invoices: invoices ?? [],
              packLists: monthRows.packLists as never,
              reviewFlags: monthRows.reviewFlags,
              assignments: monthRows.vehicleAssignments,
              numberAssignments: monthRows.numberAssignments,
            },
            bounds.start,
            bounds.end,
            true,
          ),
    [loading, events, clients, invoices, monthRows, bounds.start, bounds.end],
  );
  const crew = useMemo(() => liveCrew(monthRows?.crew ?? []), [monthRows]);
  const holds = useMemo(
    () => liveHolds(monthRows?.equipmentReservations ?? []),
    [monthRows],
  );
  const liveEquipment = useMemo(
    () =>
      (equipment ?? []).filter(
        (row) =>
          row.deletedAt == null &&
          row.registeredAt != null &&
          String(row.status) === "active",
      ),
    [equipment],
  );

  const names = useMemo(() => {
    const vehicleNames = new Map<string, string>();
    for (const row of [...(vehicles ?? []), ...(trailers ?? [])])
      vehicleNames.set(row._id, vehicleLabel(row));
    const personNames = new Map<string, string>();
    for (const row of people ?? [])
      personNames.set(
        row._id,
        `${row.givenName ?? ""} ${row.familyName ?? ""}`.trim() || "Unnamed",
      );
    const equipmentNames = new Map<string, string>();
    for (const row of equipment ?? []) equipmentNames.set(row._id, row.name);
    return {
      vehicle: (id: string) => vehicleNames.get(id) ?? "Vehicle",
      person: (id: string) => personNames.get(id) ?? "Staff",
      equipment: (id: string) => equipmentNames.get(id) ?? "Equipment",
    };
  }, [vehicles, trailers, people, equipment]);
  const stock = useMemo(() => {
    const counts = new Map(
      (equipment ?? []).map((row) => [row._id as string, row.quantity]),
    );
    return (id: string) => counts.get(id) ?? 0;
  }, [equipment]);

  const bookings = useMemo(
    () => monthBookings(rows, crew, holds, names),
    [rows, crew, holds, names],
  );
  const conflicts = useMemo(
    () => findConflicts(bookings, rules, stock),
    [bookings, rules, stock],
  );

  const actions = useTrackerRowActions({
    windowOf: eventWindow,
    confirmBookings: async (row, candidates) => {
      const { start, end } = eventWindow(row);
      const warnings = candidates.flatMap((candidate) => {
        const booking: Booking = {
          resource: candidate.resource,
          key: candidate.key,
          name: names[candidate.resource](candidate.key),
          eventId: row.id,
          eventLabel: row.title,
          start,
          end,
          quantity: candidate.quantity ?? 1,
        };
        // Equipment already on this event counts toward what it asks for.
        const own = bookings.filter(
          (entry) =>
            entry.eventId === row.id &&
            entry.resource === "equipment" &&
            entry.key === candidate.key,
        );
        return warningsFor(
          {
            ...booking,
            quantity:
              booking.quantity +
              own.reduce((sum, entry) => sum + entry.quantity, 0),
          },
          bookings,
          rules,
          stock,
        );
      });
      if (warnings.length === 0) return "clear";
      const go = await prompt.askConfirm({
        title: "Already booked",
        description: `${warnings.join(" ")} Book it anyway?`,
        confirmLabel: "Book anyway",
        cancelLabel: "Pick something else",
        tone: "danger",
      });
      return go ? "override" : "stop";
    },
    confirmOverbook: (message) =>
      prompt.askConfirm({
        title: "Not enough free",
        description: `${message} Book it anyway?`,
        confirmLabel: "Book anyway",
        cancelLabel: "Keep as-is",
        tone: "danger",
      }),
  });

  if (loading)
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the tracker"
      />
    );

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const has = (...caps: string[]) => caps.some((cap) => permissions.has(cap));
  const rowPermissions = {
    canEditEvent: has("eventAccess", "salesAccess"),
    canEditRigs: has(
      "eventAccess",
      "salesAccess",
      "logisticsAccess",
      "manageAccess",
    ),
    canEditEquipment: has(
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
    ),
  };
  const canEditRules = has(
    "eventAccess",
    "salesAccess",
    "logisticsAccess",
    "manageAccess",
  );
  const canEditStock = has("inventoryAccess", "logisticsAccess");

  const optionList = (
    list: {
      _id: string;
      deletedAt?: number | null;
      registeredAt?: number | null;
      operationalStatus?: unknown;
    }[],
  ): RigOption[] =>
    list
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.registeredAt != null &&
          String(row.operationalStatus) !== "retired",
      )
      .map((row) => ({ id: row._id, label: names.vehicle(row._id) }));
  const vehicleOptions = optionList(vehicles ?? []);
  const trailerOptions = optionList(trailers ?? []);
  const driverOptions: RigOption[] = (people ?? [])
    .filter((row) => row.deletedAt == null && row.status === "active")
    .map((row) => ({ id: row._id, label: names.person(row._id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const kindOf = new Map(
    (equipment ?? []).map((row) => [
      row._id as string,
      trackerKind(row.category),
    ]),
  );
  const optionsOf = (kind: "equipment" | "decor"): RigOption[] =>
    liveEquipment
      .filter((row) => kindOf.get(row._id) === kind)
      .map((row) => ({ id: row._id, label: `${row.name} (${row.quantity})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const equipmentOptions = optionsOf("equipment");
  const decorOptions = optionsOf("decor");

  const conflictFor = (
    eventId: string,
    resource: Booking["resource"],
    key: string,
  ) =>
    conflicts.find(
      (entry) =>
        entry.resource === resource &&
        entry.key === key &&
        entry.eventIds.includes(eventId),
    )?.text ?? null;

  const needle = search.trim().toLowerCase();
  const counts = Object.fromEntries(TABS.map((key) => [key, 0])) as Record<
    Tab,
    number
  >;
  for (const row of rows) {
    const group = statusGroup(row.stage);
    counts[group] += 1;
    if (group !== "cancelled") counts.all += 1;
  }
  const visible = rows.filter((row) => {
    const group = statusGroup(row.stage);
    if (tab === "all" ? group === "cancelled" : group !== tab) return false;
    return (
      needle === "" ||
      [row.eventNumber, row.title, row.client, row.venue]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  });
  const unnumbered = visible.filter(
    (row) => row.storedEventNumber === "" && row.stage !== "cancelled",
  );

  const goto = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    const next = new URLSearchParams(params);
    next.set(
      "month",
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
    setParams(next, { replace: true });
  };
  const monthTitle = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const runPanel = async (label: string, work: () => Promise<unknown>) => {
    setPanelFailure(null);
    setPanelNotice(null);
    try {
      await work();
      setPanelNotice(`${label}.`);
      return true;
    } catch (error) {
      setPanelFailure(classifyCommandFailure(error));
      return false;
    }
  };

  return (
    <div className="trk">
      <TrackerStats
        rows={rows}
        bookings={bookings.filter(
          (entry) =>
            entry.resource !== "equipment" ||
            kindOf.get(entry.key) === "equipment",
        )}
        vehicles={vehicleOptions.length}
        equipment={liveEquipment.filter(
          (row) => kindOf.get(row._id) === "equipment",
        )}
        conflicts={conflicts.length}
      />

      {conflicts.length > 0 && !alertHidden ? (
        <section
          className="trk-alert"
          role="alert"
          aria-label="Double bookings"
        >
          <span className="trk-alert-icon" aria-hidden="true">
            ⚠
          </span>
          <div className="min-w-0 flex-1">
            <h2>
              {conflicts.length} double{" "}
              {conflicts.length === 1 ? "booking" : "bookings"} in {monthTitle}
            </h2>
            <ul>
              {conflicts.map((entry) => (
                <li key={`${entry.resource}:${entry.key}`}>{entry.text}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="trk-alert-x"
            aria-label="Hide the double bookings"
            onClick={() => setAlertHidden(true)}
          >
            ×
          </button>
        </section>
      ) : null}

      {panel === "rules" ? (
        <BookingRulesPanel
          rules={rules}
          canEdit={canEditRules}
          onSave={(resource, value) =>
            void runPanel("Rule saved", () => saveRule(resource, value))
          }
        />
      ) : null}
      {panel === "stock" ? (
        <EquipmentStockPanel
          equipment={liveEquipment}
          heldThisMonth={(id) => peakHeld(bookings, id)}
          canEdit={canEditStock}
          run={runPanel}
        />
      ) : null}
      {panel && panelNotice ? (
        <p className="trk-notice" role="status">
          {panelNotice}
        </p>
      ) : null}
      {panelFailure ? (
        <FailureBanner
          failure={panelFailure}
          onDismiss={() => setPanelFailure(null)}
        />
      ) : null}
      {actions.failure ? (
        <FailureBanner
          failure={actions.failure}
          onDismiss={actions.clearFailure}
        />
      ) : null}

      <section className="trk-card">
        <div className="trk-bar">
          <SegmentedTabs
            label="Events by status"
            size="sm"
            options={TABS.map((key) => ({
              value: key,
              label: key === "all" ? "All" : STATUS_LABEL[key],
              count: counts[key],
            }))}
            value={tab}
            onChange={setTab}
          />
          <div className="trk-bar-tools">
            <div className="trk-month">
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
            </div>
            <input
              type="search"
              className="input trk-search"
              placeholder="Find #, event, client, venue"
              aria-label="Find events in this month"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={panel === "rules"}
              onClick={() => setPanel(panel === "rules" ? null : "rules")}
            >
              Booking rules
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={panel === "stock"}
              onClick={() => setPanel(panel === "stock" ? null : "stock")}
            >
              Equipment stock
            </button>
            {rowPermissions.canEditEvent && unnumbered.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={actions.busyId != null}
                onClick={() => void actions.numberRows(unnumbered)}
              >
                {actions.busyId === "numbering"
                  ? "Numbering…"
                  : `Number ${unnumbered.length} ${unnumbered.length === 1 ? "event" : "events"}`}
              </button>
            ) : null}
          </div>
        </div>
        <div className="trk-scroll">
          <table className="trk-table">
            <thead>
              <tr>
                <th className="trk-col-num">Event #</th>
                <th className="trk-col-event">Event</th>
                <th className="trk-col-date">Date &amp; time</th>
                <th className="trk-col-venue">Venue</th>
                <th className="trk-col-pill">Status</th>
                <th className="trk-col-pack">Packing</th>
                <th className="trk-col-rigs">
                  <div className="tracker-rig tracker-rig-head">
                    <span>Vehicle</span>
                    <span>Trailer</span>
                    <span>Driver</span>
                    <span>Loaded</span>
                  </div>
                </th>
                <th className="trk-col-chips">Crew</th>
                <th className="trk-col-chips">Equipment</th>
                <th className="trk-col-chips">Décor</th>
                <th className="trk-col-notes">Notes</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={11} className="trk-empty">
                    No events{" "}
                    {tab === "all" ? "" : `${STATUS_LABEL[tab].toLowerCase()} `}
                    in {monthTitle}.
                  </td>
                </tr>
              ) : null}
              {visible.map((row) => {
                const rowConflicts = conflicts.some((entry) =>
                  entry.eventIds.includes(row.id),
                );
                const rigs = row.rigs.map((rig) => ({
                  ...rig,
                  conflict:
                    [rig.vehicleId, rig.trailerId]
                      .map((key) =>
                        key ? conflictFor(row.id, "vehicle", key) : null,
                      )
                      .concat(
                        rig.driverId
                          ? conflictFor(row.id, "person", rig.driverId)
                          : null,
                      )
                      .filter(Boolean)
                      .join(" · ") || null,
                }));
                const crewChips = [
                  ...new Set(
                    crew
                      .filter((person) => person.eventId === row.id)
                      .map((person) => String(person.personId)),
                  ),
                ].map((personId) => ({
                  personId,
                  name: names.person(personId),
                  warn: conflictFor(row.id, "person", personId),
                }));
                const holdChips = holds
                  .filter((hold) => String(hold.eventId) === row.id)
                  .map((hold) => ({
                    id: hold._id,
                    version: hold.version,
                    equipmentId: String(hold.equipmentId),
                    name: names.equipment(String(hold.equipmentId)),
                    quantity: hold.quantity,
                    removable: String(hold.status) === "reserved",
                    warn: conflictFor(
                      row.id,
                      "equipment",
                      String(hold.equipmentId),
                    ),
                    overbooked: hold.overrideReason != null,
                  }));
                return (
                  <TrackerBoardRow
                    key={row.id}
                    row={{ ...row, rigs }}
                    busy={actions.busyId === row.id}
                    resetKey={actions.resetKey}
                    permissions={rowPermissions}
                    vehicles={vehicleOptions}
                    trailers={trailerOptions}
                    drivers={driverOptions}
                    crew={crewChips}
                    holds={holdChips.filter(
                      (hold) => kindOf.get(hold.equipmentId) !== "decor",
                    )}
                    equipmentOptions={equipmentOptions}
                    decorHolds={holdChips.filter(
                      (hold) => kindOf.get(hold.equipmentId) === "decor",
                    )}
                    decorOptions={decorOptions}
                    conflicted={rowConflicts}
                    actions={actions.actionsFor(row)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="trk-foot">
          Showing {visible.length} of {counts.all} events in {monthTitle}
        </p>
      </section>
      {promptHost}
      {actions.savedToast}
    </div>
  );
}
