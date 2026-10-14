import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Doc } from "../../../lib/api";
import {
  useCreateEventLayoutSection,
  useEventAssignmentPinOnPlan,
  useEventLayoutSectionPlaceOnPlan,
  useEventLayoutSectionTakeOffPlan,
} from "../../../lib/manifest-convex-react";
import { EosPanel } from "../../eos/EosShared";
import { BATTLE_BOARD_LAYOUT_TYPES } from "../battleBoardLayoutTypes";
import { dragPayload, readDrag, type Saver } from "./boardDrag";

type Section = Doc<"eventLayoutSections">;
type Assignment = Doc<"eventAssignments">;

const TONES = ["info", "warn", "ok", "accent", "chat-teal", "chat-plum"];
const toneOf = (type: string) =>
  TONES[
    [...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length
  ];
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, Math.round(value)));

/**
 * The event's floor plan: drag areas from the tray onto the plan, move and
 * resize them there, and pin the crew where they stand. Every move is saved
 * on the event (layout areas and crew rows keep their place on the plan).
 */
export function FloorPlanView({
  eventId,
  sections,
  crew,
  nameOf,
  save,
}: {
  eventId: string;
  sections: readonly Section[];
  crew: readonly Assignment[];
  nameOf: (personId: string) => string;
  save: Saver;
}) {
  const plan = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const overTray = (x: number, y: number) => {
    const box = tray.current?.getBoundingClientRect();
    return (
      box != null &&
      x >= box.left &&
      x <= box.right &&
      y >= box.top &&
      y <= box.bottom
    );
  };
  const place = useEventLayoutSectionPlaceOnPlan();
  const takeOff = useEventLayoutSectionTakeOffPlan();
  const pin = useEventAssignmentPinOnPlan();
  const addSection = useCreateEventLayoutSection();
  const [moving, setMoving] = useState<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [newType, setNewType] = useState<string>(BATTLE_BOARD_LAYOUT_TYPES[0]);

  const live = sections.filter(
    (row) => row.deletedAt == null && row.addedAt != null,
  );
  const placed = live.filter((row) => row.planX != null);
  const unplaced = live.filter((row) => row.planX == null);
  const pinned = crew.filter((row) => row.planX != null);
  const unpinned = crew.filter((row) => row.planX == null);

  const pointToPlan = (clientX: number, clientY: number) => {
    const box = plan.current!.getBoundingClientRect();
    return {
      x: ((clientX - box.left) / box.width) * 100,
      y: ((clientY - box.top) / box.height) * 100,
    };
  };

  // Move or resize an area with the pointer; saved when it is let go.
  const startMove = (
    event: ReactPointerEvent,
    row: Section,
    mode: "move" | "resize",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const start = pointToPlan(event.clientX, event.clientY);
    const from = {
      x: Number(row.planX),
      y: Number(row.planY),
      w: Number(row.planWidth ?? 20),
      h: Number(row.planHeight ?? 20),
    };
    let last = { id: String(row._id), ...from };
    const onMove = (move: PointerEvent) => {
      const now = pointToPlan(move.clientX, move.clientY);
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      last =
        mode === "move"
          ? {
              ...last,
              x: clamp(from.x + dx, 0, 100 - from.w),
              y: clamp(from.y + dy, 0, 100 - from.h),
            }
          : {
              ...last,
              w: clamp(from.w + dx, 4, 100 - from.x),
              h: clamp(from.h + dy, 4, 100 - from.y),
            };
      setMoving(last);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (mode === "move" && overTray(up.clientX, up.clientY)) {
        void save(`Took ${row.type} off the plan`, () =>
          takeOff({ docId: row._id, version: row.version }),
        ).finally(() => setMoving(null));
        return;
      }
      void save(`Moved ${row.type}`, () =>
        place({
          docId: row._id,
          version: row.version,
          planX: last.x,
          planY: last.y,
          planWidth: last.w,
          planHeight: last.h,
        }),
      ).finally(() => setMoving(null));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // A crew pin moves with the pointer and is saved where it lands.
  const startPin = (event: ReactPointerEvent, row: Assignment) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const onMove = (move: PointerEvent) => {
      const at = pointToPlan(move.clientX, move.clientY);
      target.style.left = `${clamp(at.x, 0, 100)}%`;
      target.style.top = `${clamp(at.y, 0, 100)}%`;
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (overTray(up.clientX, up.clientY)) {
        void save("Took the pin off", () =>
          pin({ docId: row._id, version: row.version }),
        );
        return;
      }
      const at = pointToPlan(up.clientX, up.clientY);
      void save(`Moved ${nameOf(String(row.personId))}`, () =>
        pin({
          docId: row._id,
          version: row.version,
          planX: clamp(at.x, 0, 100),
          planY: clamp(at.y, 0, 100),
        }),
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const dropOnPlan = (event: React.DragEvent) => {
    event.preventDefault();
    const drag = readDrag(event);
    if (!drag) return;
    const at = pointToPlan(event.clientX, event.clientY);
    if (drag.kind === "section") {
      const row = live.find((item) => String(item._id) === drag.id);
      if (!row) return;
      void save(`Placed ${row.type}`, () =>
        place({
          docId: row._id,
          version: row.version,
          planX: clamp(at.x - 10, 0, 80),
          planY: clamp(at.y - 10, 0, 80),
          planWidth: 20,
          planHeight: 20,
        }),
      );
    }
    if (drag.kind === "crew") {
      const row = crew.find((item) => String(item._id) === drag.id);
      if (!row) return;
      void save(`Pinned ${nameOf(String(row.personId))}`, () =>
        pin({
          docId: row._id,
          version: row.version,
          planX: clamp(at.x, 0, 100),
          planY: clamp(at.y, 0, 100),
        }),
      );
    }
  };

  return (
    <EosPanel
      tone="vision"
      eyebrow="Floor plan"
      title="Venue floor plan"
      lead="Drag areas and crew from the tray onto the plan. Drag an area to move it and its corner to resize it. Drag anything back onto the tray to take it off."
      actions={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(`Added ${newType}`, () =>
              addSection({
                eventId,
                type: newType,
                sortOrder: live.length,
              }),
            );
          }}
        >
          <label className="sr-only" htmlFor="pb-zone-type">
            Area type
          </label>
          <select
            id="pb-zone-type"
            className="input w-auto"
            value={newType}
            onChange={(event) => setNewType(event.target.value)}
          >
            {BATTLE_BOARD_LAYOUT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <button className="btn btn-ghost" type="submit">
            Add area
          </button>
        </form>
      }
    >
      <div className="pb-plan-wrap">
        <div ref={tray} className="pb-tray" aria-label="Not on the plan">
          <p className="pb-heading">Areas</p>
          {unplaced.length === 0 ? (
            <p className="text-xs text-ink-3">All areas are on the plan.</p>
          ) : (
            unplaced.map((row) => (
              <div
                key={row._id}
                className={`pb-chip-drag eos-tone-${toneOf(row.type)}`}
                draggable
                onDragStart={(event) =>
                  dragPayload(event, { kind: "section", id: String(row._id) })
                }
              >
                {row.type}
              </div>
            ))
          )}
          <p className="pb-heading">Crew</p>
          {unpinned.length === 0 ? (
            <p className="text-xs text-ink-3">
              {crew.length ? "Everyone is pinned." : "No crew on this event."}
            </p>
          ) : (
            unpinned.map((row) => (
              <div
                key={row._id}
                className="pb-chip-drag"
                draggable
                onDragStart={(event) =>
                  dragPayload(event, { kind: "crew", id: String(row._id) })
                }
              >
                {nameOf(String(row.personId))}
                <small>{row.role || "Crew"}</small>
              </div>
            ))
          )}
        </div>

        <div
          ref={plan}
          className="pb-plan"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropOnPlan}
          aria-label="Floor plan"
        >
          {placed.map((row) => {
            const box =
              moving?.id === String(row._id)
                ? moving
                : {
                    x: Number(row.planX),
                    y: Number(row.planY),
                    w: Number(row.planWidth ?? 20),
                    h: Number(row.planHeight ?? 20),
                  };
            return (
              <div
                key={row._id}
                className={`pb-zone eos-tone-${toneOf(row.type)}`}
                style={{
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.w}%`,
                  height: `${box.h}%`,
                }}
                onPointerDown={(event) => startMove(event, row, "move")}
                title={row.instructions ?? row.type}
              >
                <strong>{row.type}</strong>
                {row.instructions ? <small>{row.instructions}</small> : null}
                <span
                  className="pb-zone-resize"
                  aria-label={`Resize ${row.type}`}
                  onPointerDown={(event) => startMove(event, row, "resize")}
                />
              </div>
            );
          })}
          {pinned.map((row) => (
            <div
              key={row._id}
              className="pb-pin"
              style={{ left: `${row.planX}%`, top: `${row.planY}%` }}
              onPointerDown={(event) => startPin(event, row)}
              title={`${nameOf(String(row.personId))} · ${row.role || "Crew"}`}
            >
              <span className="pb-pin-dot">
                {nameOf(String(row.personId))
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="pb-pin-name">
                {nameOf(String(row.personId))}
              </span>
            </div>
          ))}
          {placed.length === 0 && pinned.length === 0 ? (
            <p className="pb-plan-empty">Drag an area or a crew member here.</p>
          ) : null}
        </div>
      </div>
    </EosPanel>
  );
}
