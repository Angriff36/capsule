import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { EventDayBriefing } from "../../../lib/eventDayBriefing";
import {
  useListPerson,
  useListTrailer,
  useListVehicle,
} from "../../../lib/manifest-convex-react";
import {
  useEventLayoutSections,
  useEventPackItems,
} from "../../../lib/useEventAreaRows";
import { useEventAssignments } from "../../../lib/useEventRows";
import { useActiveEventRigs } from "../../facilities/useLogisticsWindow";
import type { buildBoard } from "../../eventDay/BattleBoardPage";
import type { Saver } from "./boardDrag";
import { EquipmentRoomView } from "./EquipmentRoomView";
import { FloorPlanView } from "./FloorPlanView";
import type { BoardStats } from "./productionBoardModel";
import {
  CrewColumn,
  RunsAndEquipment,
  TasksColumn,
  VenueAndFood,
} from "./ProductionBoardSections";
import { RouteView } from "./RouteView";

type Board = ReturnType<typeof buildBoard>;

const VIEWS = [
  { key: "grid", label: "Grid" },
  { key: "plan", label: "Floor plan" },
  { key: "route", label: "Route" },
  { key: "room", label: "Equipment room" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * The board's working part: a switch between the grid of panels, the
 * interactive floor plan, the route map and the equipment room. The view is
 * kept in the address (`?view=`), so a meeting can share it.
 */
export function ProductionBoardViews({
  eventId,
  briefing,
  board,
  stats,
}: {
  eventId: string;
  briefing: EventDayBriefing;
  board: Board;
  stats: BoardStats;
}) {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((entry) => entry.key === params.get("view"))?.key ??
    "grid") as ViewKey;
  const sections = useEventLayoutSections(eventId);
  const crewRows = useEventAssignments(eventId);
  const rigs = useActiveEventRigs(eventId);
  const gearRows = useEventPackItems(eventId);
  const people = useListPerson();
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);

  const crew = (crewRows ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) !== "unassigned",
  );
  const gear = (gearRows ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.listedAt != null &&
      row.retiredAt == null &&
      row.excludedAt == null,
  );
  const nameOf = (personId: string) => {
    const person = (people ?? []).find((row) => String(row._id) === personId);
    return (
      [person?.givenName, person?.familyName].filter(Boolean).join(" ") ||
      "Staff"
    );
  };
  const truckName = (rig: {
    vehicleId?: unknown;
    vendorName?: string | null;
  }) => {
    const vehicle = (vehicles ?? []).find(
      (row) => String(row._id) === String(rig.vehicleId),
    );
    return vehicle
      ? `${vehicle.make} ${vehicle.model}`.trim()
      : rig.vendorName || "Truck";
  };

  const save: Saver = async (label, work) => {
    try {
      await work();
      setNotice({ text: `${label}.`, failed: false });
    } catch (cause) {
      setNotice({
        text: `${label} did not save: ${cause instanceof Error ? cause.message : String(cause)}`,
        failed: true,
      });
    }
  };

  const pick = (key: ViewKey) => {
    const next = new URLSearchParams(params);
    if (key === "grid") next.delete("view");
    else next.set("view", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="pb-switch" role="group" aria-label="Board view">
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={view === entry.key}
              onClick={() => pick(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {notice ? (
          <p
            className={`text-sm ${notice.failed ? "text-danger" : "text-ink-2"}`}
            role={notice.failed ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      {view === "grid" ? (
        <>
          <div className="pb-grid">
            <CrewColumn board={board} />
            <VenueAndFood briefing={briefing} board={board} />
            <TasksColumn board={board} stats={stats} />
          </div>
          <RunsAndEquipment briefing={briefing} board={board} />
        </>
      ) : null}
      {view === "plan" ? (
        <FloorPlanView
          eventId={eventId}
          sections={sections ?? []}
          crew={crew}
          nameOf={nameOf}
          save={save}
        />
      ) : null}
      {view === "route" ? (
        <RouteView
          eventId={eventId}
          rigs={rigs ?? []}
          riders={(rigId) =>
            crew.filter((row) => String(row.rideVehicleAssignmentId) === rigId)
              .length
          }
          cargo={(rigId) =>
            gear.filter((row) => String(row.loadAssignmentId) === rigId).length
          }
          truckName={truckName}
          nameOf={nameOf}
        />
      ) : null}
      {view === "room" ? (
        <EquipmentRoomView
          eventId={eventId}
          rigs={rigs ?? []}
          crew={crew}
          gear={gear}
          vehicles={vehicles ?? []}
          trailers={trailers ?? []}
          nameOf={nameOf}
          save={save}
        />
      ) : null}
    </div>
  );
}
