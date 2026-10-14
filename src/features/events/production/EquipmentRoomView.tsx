import { useState, type DragEvent, type ReactNode } from "react";
import type { Doc } from "../../../lib/api";
import {
  useCreateEventVehicleAssignment,
  useEventAssignmentChooseTravelLeg,
  useEventVehicleAssignmentAttachTrailer,
  useEventVehicleAssignmentChangeDriver,
  useEventVehicleAssignmentRelease,
  usePackListItemAssignLoad,
} from "../../../lib/manifest-convex-react";
import { EosPanel } from "../../eos/EosShared";
import { dragPayload, readDrag, type BoardDrag, type Saver } from "./boardDrag";

type Rig = Doc<"eventVehicleAssignments">;
type Crew = Doc<"eventAssignments">;
type Gear = Doc<"packListItems">;
type Vehicle = Doc<"vehicles">;
type Trailer = Doc<"trailers">;

const named = (row: { make?: string; model?: string } | undefined) =>
  row ? `${row.make ?? ""} ${row.model ?? ""}`.trim() || "Vehicle" : null;

/**
 * Equipment room: every truck on the event as a column. Drag crew onto a
 * truck to ride in it, onto its driver slot to drive it; drag packed gear
 * onto it to load it; drag a vehicle from the yard to add a truck, a trailer
 * onto a truck to hitch it. Drag anything back to the left to take it off.
 */
export function EquipmentRoomView({
  eventId,
  rigs,
  crew,
  gear,
  vehicles,
  trailers,
  nameOf,
  save,
}: {
  eventId: string;
  rigs: readonly Rig[];
  crew: readonly Crew[];
  gear: readonly Gear[];
  vehicles: readonly Vehicle[];
  trailers: readonly Trailer[];
  nameOf: (personId: string) => string;
  save: Saver;
}) {
  const ride = useEventAssignmentChooseTravelLeg();
  const driver = useEventVehicleAssignmentChangeDriver();
  const hitch = useEventVehicleAssignmentAttachTrailer();
  const release = useEventVehicleAssignmentRelease();
  const load = usePackListItemAssignLoad();
  const addRig = useCreateEventVehicleAssignment();
  const [over, setOver] = useState<string | null>(null);

  const live = rigs.filter(
    (row) => row.deletedAt == null && row.activeEventId === eventId,
  );
  const onEvent = new Set(live.map((row) => String(row.vehicleId ?? "")));
  const hitched = new Set(live.map((row) => String(row.trailerId ?? "")));
  const yard = vehicles.filter(
    (row) =>
      row.deletedAt == null &&
      row.operationalStatus !== "retired" &&
      !onEvent.has(String(row._id)),
  );
  const freeTrailers = trailers.filter(
    (row) =>
      row.deletedAt == null &&
      row.operationalStatus !== "retired" &&
      !hitched.has(String(row._id)),
  );
  const rigIds = new Set(live.map((row) => String(row._id)));
  const walking = crew.filter(
    (row) =>
      !row.rideVehicleAssignmentId ||
      !rigIds.has(String(row.rideVehicleAssignmentId)),
  );
  const unloaded = gear.filter(
    (row) => !row.loadAssignmentId || !rigIds.has(String(row.loadAssignmentId)),
  );

  const find = <T extends { _id: unknown }>(rows: readonly T[], id: string) =>
    rows.find((row) => String(row._id) === id);

  const dropOnRig =
    (rig: Rig, slot: "riders" | "driver" | "cargo") => (event: DragEvent) => {
      event.preventDefault();
      setOver(null);
      const drag = readDrag(event);
      if (!drag) return;
      const truck = named(find(vehicles, String(rig.vehicleId))) ?? "the truck";
      if (drag.kind === "crew") {
        const row = find(crew, drag.id);
        if (!row) return;
        if (slot === "driver")
          void save(`${nameOf(String(row.personId))} drives ${truck}`, () =>
            driver({
              docId: rig._id,
              version: rig.version,
              driverId: row.personId,
            }),
          );
        else
          void save(`${nameOf(String(row.personId))} rides in ${truck}`, () =>
            ride({
              docId: row._id,
              version: row.version,
              rideVehicleAssignmentId: rig._id,
            }),
          );
      }
      if (drag.kind === "gear") {
        const row = find(gear, drag.id);
        if (row)
          void save(`Loaded ${row.description} on ${truck}`, () =>
            load({
              docId: row._id,
              version: row.version,
              loadAssignmentId: rig._id,
            }),
          );
      }
      if (drag.kind === "trailer") {
        const row = find(trailers, drag.id);
        if (row)
          void save(`Hitched ${named(row)} to ${truck}`, () =>
            hitch({ docId: rig._id, version: rig.version, trailerId: row._id }),
          );
      }
    };

  const dropOnPool = (event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    const drag = readDrag(event);
    if (!drag) return;
    if (drag.kind === "crew") {
      const row = find(crew, drag.id);
      if (row)
        void save(
          `${nameOf(String(row.personId))} goes with the main crew`,
          () => ride({ docId: row._id, version: row.version }),
        );
    }
    if (drag.kind === "gear") {
      const row = find(gear, drag.id);
      if (row)
        void save(`Took ${row.description} off the truck`, () =>
          load({ docId: row._id, version: row.version }),
        );
    }
  };

  const dropNewRig = (event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    const drag = readDrag(event);
    if (drag?.kind !== "vehicle") return;
    const row = find(vehicles, drag.id);
    if (row)
      void save(`Added ${named(row)} to the event`, () =>
        addRig({ eventId, vehicleId: row._id }),
      );
  };

  // A slot inside a truck card takes the drop; the card does not see it.
  const zone = (key: string, onDrop: (event: DragEvent) => void) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (over !== key) setOver(key);
    },
    onDragLeave: () => setOver((now) => (now === key ? null : now)),
    onDrop: (event: DragEvent) => {
      event.stopPropagation();
      onDrop(event);
    },
    "data-over": over === key || undefined,
  });

  return (
    <EosPanel
      tone="process"
      eyebrow="Equipment room"
      title="Trucks, crew and gear"
      lead="Drag crew onto a truck to ride, onto Driver to drive. Drag packed gear onto a truck to load it. Drag a vehicle from the yard onto New truck, a trailer onto a truck to hitch it. Drag back to the left to take it off."
    >
      <div className="pb-room">
        <div className="pb-pool" {...zone("pool", dropOnPool)}>
          <p className="pb-heading">Crew not on a truck ({walking.length})</p>
          {walking.length === 0 ? (
            <p className="text-xs text-ink-3">
              {crew.length ? "Everyone has a seat." : "No crew on this event."}
            </p>
          ) : (
            walking.map((row) => (
              <Chip key={row._id} drag={{ kind: "crew", id: String(row._id) }}>
                {nameOf(String(row.personId))}
                <small>{row.role || "Crew"}</small>
              </Chip>
            ))
          )}
          <p className="pb-heading">Gear not loaded ({unloaded.length})</p>
          {unloaded.length === 0 ? (
            <p className="text-xs text-ink-3">All gear is on a truck.</p>
          ) : (
            unloaded.map((row) => (
              <Chip key={row._id} drag={{ kind: "gear", id: String(row._id) }}>
                {row.description}
                <small>
                  {Number(row.requiredQuantity)} {row.unit}
                </small>
              </Chip>
            ))
          )}
          <p className="pb-heading">
            Yard ({yard.length + freeTrailers.length})
          </p>
          {yard.map((row) => (
            <Chip key={row._id} drag={{ kind: "vehicle", id: String(row._id) }}>
              {named(row)}
              <small>Truck · {String(row.operationalStatus ?? "")}</small>
            </Chip>
          ))}
          {freeTrailers.map((row) => (
            <Chip key={row._id} drag={{ kind: "trailer", id: String(row._id) }}>
              {named(row)}
              <small>Trailer</small>
            </Chip>
          ))}
        </div>

        <div className="pb-rigs">
          {live.map((rig) => {
            const riders = crew.filter(
              (row) => String(row.rideVehicleAssignmentId) === String(rig._id),
            );
            const cargo = gear.filter(
              (row) => String(row.loadAssignmentId) === String(rig._id),
            );
            const truck =
              named(find(vehicles, String(rig.vehicleId))) ??
              rig.vendorName ??
              "Truck";
            const trailer = named(find(trailers, String(rig.trailerId)));
            return (
              <div
                key={rig._id}
                className="pb-rig"
                {...zone(`rig-${rig._id}`, dropOnRig(rig, "riders"))}
              >
                <div className="pb-card-head">
                  <strong>{truck}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      void save(`Took ${truck} off the event`, () =>
                        release({ docId: rig._id, version: rig.version }),
                      )
                    }
                  >
                    Take off
                  </button>
                </div>
                <span className="text-xs text-ink-3">
                  {trailer ? `Pulls ${trailer}` : "No trailer · drop one here"}
                  {rig.preloadedAt ? " · Loaded" : ""}
                </span>
                <div
                  className="pb-slot"
                  {...zone(`driver-${rig._id}`, dropOnRig(rig, "driver"))}
                >
                  <span className="pb-slot-label">Driver</span>
                  {rig.driverId
                    ? nameOf(String(rig.driverId))
                    : "Drop a driver"}
                </div>
                <p className="pb-heading">Riders ({riders.length})</p>
                {riders.map((row) => (
                  <Chip
                    key={row._id}
                    drag={{ kind: "crew", id: String(row._id) }}
                  >
                    {nameOf(String(row.personId))}
                    <small>{row.role || "Crew"}</small>
                  </Chip>
                ))}
                <p className="pb-heading">Cargo ({cargo.length})</p>
                <div
                  className="pb-slot pb-slot-tall"
                  {...zone(`cargo-${rig._id}`, dropOnRig(rig, "cargo"))}
                >
                  {cargo.length === 0 ? (
                    <span className="text-xs text-ink-3">Drop gear here</span>
                  ) : (
                    cargo.map((row) => (
                      <Chip
                        key={row._id}
                        drag={{ kind: "gear", id: String(row._id) }}
                      >
                        {row.description}
                        <small>
                          {Number(row.requiredQuantity)} {row.unit}
                        </small>
                      </Chip>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          <div className="pb-rig pb-rig-new" {...zone("new", dropNewRig)}>
            <strong>New truck</strong>
            <span className="text-xs text-ink-3">
              Drag a vehicle from the yard here to add it to this event.
            </span>
          </div>
        </div>
      </div>
    </EosPanel>
  );
}

function Chip({ drag, children }: { drag: BoardDrag; children: ReactNode }) {
  return (
    <div
      className="pb-chip-drag"
      draggable
      onDragStart={(event) => dragPayload(event, drag)}
    >
      {children}
    </div>
  );
}
