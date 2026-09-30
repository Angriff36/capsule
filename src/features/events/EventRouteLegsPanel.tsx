import { useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import {
  useCreateEventVehicleAssignment,
  useEventVehicleAssignmentPlanLeg,
  useEventVehicleAssignmentSetLoadingZone,
} from "../../lib/manifest-convex-react";
import {
  useEventRouteLegs,
  useEventTransport,
} from "../../lib/useEventRouteLegs";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { timeLabel } from "./EventTimingPlannerDraft";
import { EventRunStops } from "./EventRunStops";

type Data = NonNullable<ReturnType<typeof useEventRouteLegs>>;
type Leg = Data["legs"][number];
type Run = Data["runs"][number];
type RunDraft = {
  arrive: string;
  load: string;
  leaveAfter: string;
  zone: string;
};

const text = (value: number | null) => (value == null ? "" : String(value));
const minutes = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

function legTimes(leg: Leg): string[] {
  if (leg.kind === "vendor") {
    return [
      `On site ${timeLabel(leg.arriveAt)}`,
      ...(leg.departVenueAt != null
        ? [`Leaves ${timeLabel(leg.departVenueAt)}`]
        : []),
    ];
  }
  return [
    `Load ${timeLabel(leg.loadStartAt)}`,
    `Leave kitchen ${timeLabel(leg.departShopAt)}`,
    `On site ${timeLabel(leg.arriveAt)}`,
    `Leave venue ${timeLabel(leg.departVenueAt)}`,
    `Back ${timeLabel(leg.returnShopAt)}`,
    `Crew ${timeLabel(leg.staffOnAt)} – ${timeLabel(leg.staffOffAt)}`,
  ];
}

/**
 * Every truck run, vendor drop and the main crew for this event (spec §8.4
 * multiple legs). Times come from the event timing above; a run may arrive
 * earlier or later, load for its own time, or drop and leave. Trucks are
 * added on the Event Tracker; vendor drops can be added here.
 */
export function EventRouteLegsPanel({
  eventId,
  canChange,
}: {
  eventId: Id<"events">;
  canChange: boolean;
}) {
  const data = useEventRouteLegs(eventId);
  const transport = useEventTransport(eventId);
  const planLeg = useEventVehicleAssignmentPlanLeg();
  const setLoadingZone = useEventVehicleAssignmentSetLoadingZone();
  const addRun = useCreateEventVehicleAssignment();
  const [editing, setEditing] = useState<{ run: Run; draft: RunDraft } | null>(
    null,
  );
  const [vendor, setVendor] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  if (!data) return null;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const { run: row, draft } = editing;
    const zone = draft.zone.trim();
    if (
      await run(async () => {
        await planLeg({
          docId: row.id,
          version: row.version,
          arriveBeforeServeMinutes: minutes(draft.arrive),
          loadMinutes: minutes(draft.load),
          leaveAfterMinutes: minutes(draft.leaveAfter),
        });
        if (zone !== (row.loadingZone ?? ""))
          await setLoadingZone({
            docId: row.id,
            version: row.version + 1,
            loadingZone: zone || undefined,
          });
      })
    )
      setEditing(null);
  };
  const addVendor = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vendor.trim()) return;
    if (await run(() => addRun({ eventId, vendorName: vendor.trim() })))
      setVendor("");
  };

  return (
    <section className="mt-5" aria-label="Trucks, vendors and crew runs">
      <h3 className="text-lg font-semibold">Trucks, vendors and crew runs</h3>
      <p className="mt-1 text-base text-ink-2">
        Each run is worked out from this event’s timing. Change the event and
        every run moves with it.
      </p>
      {data.conflicts.map((conflict) => (
        <p
          key={conflict.message}
          role="alert"
          className="mt-2 text-base text-danger"
        >
          {conflict.message}
        </p>
      ))}
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
      <ul className="mt-3 divide-y divide-line">
        {data.legs.map((leg) => {
          const own = data.runs.find((row) => row.id === leg.id);
          const open = editing?.run.id === leg.id;
          return (
            <li key={leg.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">
                    {leg.label}
                    {leg.kind === "vendor" && " (outside vendor)"}
                  </p>
                  <p className="text-base">{legTimes(leg).join(" · ")}</p>
                  <ul className="text-sm text-ink-2">
                    {leg.explanation.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <EventRunStops
                    legId={leg.id}
                    transport={transport ?? undefined}
                    loadingZone={own?.loadingZone ?? null}
                  />
                </div>
                {canChange && own && !open && (
                  <button
                    type="button"
                    className="btn btn-ghost min-h-10"
                    disabled={busy}
                    onClick={() =>
                      setEditing({
                        run: own,
                        draft: {
                          arrive: text(own.arriveBeforeServeMinutes),
                          load: text(own.loadMinutes),
                          leaveAfter: text(own.leaveAfterMinutes),
                          zone: own.loadingZone ?? "",
                        },
                      })
                    }
                  >
                    Change times
                  </button>
                )}
              </div>
              {open && editing && (
                <form
                  onSubmit={(e) => void save(e)}
                  className="mt-3 grid gap-3 sm:grid-cols-3"
                >
                  {(
                    [
                      ["arrive", "On site before serve (min)"],
                      ...(leg.kind === "rig"
                        ? ([["load", "Load time (min)"]] as const)
                        : []),
                      ["leaveAfter", "Leaves after arriving (min)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="field-label" key={key}>
                      <span>{label}</span>
                      <input
                        className="input min-h-10 w-full"
                        type="number"
                        min="0"
                        step="any"
                        value={editing.draft[key]}
                        placeholder="Same as main crew"
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            draft: { ...editing.draft, [key]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                  {leg.kind === "rig" && (
                    <label className="field-label">
                      <span>Loads at</span>
                      <input
                        className="input min-h-10 w-full"
                        value={editing.draft.zone}
                        placeholder="For example: Dock 2"
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            draft: { ...editing.draft, zone: e.target.value },
                          })
                        }
                      />
                    </label>
                  )}
                  <p className="text-sm text-ink-2 sm:col-span-3">
                    Leave a box empty to use the main crew’s time. Fill in
                    “Leaves after arriving” for a drop run, so the truck can
                    come back for another trip.
                  </p>
                  <div className="flex flex-wrap gap-3 sm:col-span-3">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy}
                    >
                      {busy ? "Saving…" : "Save run times"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {canChange && (
        <form
          onSubmit={(e) => void addVendor(e)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="field-label">
            <span>Add a vendor drop</span>
            <input
              className="input min-h-10 w-full"
              value={vendor}
              placeholder="For example: Harbor Party Rentals"
              onChange={(e) => setVendor(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost min-h-10"
            disabled={busy || !vendor.trim()}
          >
            Add vendor
          </button>
        </form>
      )}
    </section>
  );
}
