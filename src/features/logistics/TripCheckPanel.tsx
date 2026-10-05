import { useState, type FormEvent } from "react";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateVehicleTripCheck,
  useListPerson,
  useListVehicleTripCheck,
} from "../../lib/manifest-convex-react";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import {
  fuelLevelLabel,
  latestTripCheck,
  TRIP_CHECK_ITEMS,
  TRIP_CHECK_KIND_LABEL,
  TRIP_CHECK_RATINGS,
  TRIP_FUEL_LEVELS,
  tripCheckFailures,
  tripCheckWarnings,
  tripMiles,
  type TripCheckKind,
  type TripCheckRow,
} from "./tripCheck";

const milesFmt = new Intl.NumberFormat("en-US");

function CheckLine({
  kind,
  check,
  who,
}: {
  kind: TripCheckKind;
  check: TripCheckRow | undefined;
  who: string | null;
}) {
  const label = TRIP_CHECK_KIND_LABEL[kind];
  if (!check) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-base">
        <span className="font-semibold">{label}</span>
        <span className="chip chip-tone-mute">Not checked</span>
      </p>
    );
  }
  const failed = tripCheckFailures(check);
  const poor = tripCheckWarnings(check);
  const fuel = fuelLevelLabel(check.fuelLevel);
  const facts = [
    who,
    `${formatDate(check.checkedAt)} ${formatTime(check.checkedAt)}`,
    check.odometer != null ? `${milesFmt.format(check.odometer)} mi` : null,
    fuel ? `Fuel ${fuel}` : null,
  ].filter(Boolean);
  return (
    <div className="text-base">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{label}</span>
        <span
          className={`chip ${failed.length > 0 ? "chip-tone-danger" : poor.length > 0 ? "chip-tone-warn" : "chip-tone-ok"}`}
        >
          {failed.length > 0
            ? "Not safe"
            : poor.length > 0
              ? "Poor items"
              : "Passed"}
        </span>
        <span className="text-ink-2">{facts.join(" · ")}</span>
      </p>
      {failed.length > 0 ? (
        <p className="mt-1 text-danger">Not safe: {failed.join(", ")}</p>
      ) : null}
      {poor.length > 0 ? (
        <p className="mt-1 text-ink-2">Poor: {poor.join(", ")}</p>
      ) : null}
      {check.damageNote ? (
        <p className="mt-1 text-ink-2">Damage: {check.damageNote}</p>
      ) : null}
      {check.notes ? <p className="mt-1 text-ink-2">{check.notes}</p> : null}
    </div>
  );
}

/**
 * Trip checks for one truck run on an event: the last check before leaving
 * and the last check after return, with a short form to record a new one.
 * Any signed-in crew member may record a check; the driver is often plain
 * crew.
 */
export function TripCheckPanel({ runId }: { runId: string }) {
  const checks = useListVehicleTripCheck() as TripCheckRow[] | undefined;
  const people = useListPerson();
  const record = useCreateVehicleTripCheck();
  const [open, setOpen] = useState<TripCheckKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  if (checks === undefined) return null;
  const before = latestTripCheck(checks, runId, "before_leaving");
  const after = latestTripCheck(checks, runId, "after_return");
  const miles = tripMiles(before, after);
  const nameOf = (personId: string | null | undefined) => {
    const person = (people ?? []).find((row) => row._id === personId);
    const name =
      `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim();
    return name || null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!open) return;
    const data = new FormData(event.currentTarget);
    const rating = (key: string) => String(data.get(key) ?? "good");
    const fridge = String(data.get("refrigeration") ?? "");
    const odometer = String(data.get("odometer") ?? "").trim();
    const fuel = String(data.get("fuelLevel") ?? "");
    const damage = String(data.get("damageNote") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim();
    setBusy(true);
    setFailure(null);
    try {
      await record({
        eventVehicleAssignmentId: runId,
        kind: open,
        tires: rating("tires"),
        brakes: rating("brakes"),
        lights: rating("lights"),
        fluids: rating("fluids"),
        bodywork: rating("bodywork"),
        interior: rating("interior"),
        refrigeration: fridge || undefined,
        odometer: odometer === "" ? undefined : Math.round(Number(odometer)),
        fuelLevel: fuel || undefined,
        damageNote: damage || undefined,
        notes: notes || undefined,
      });
      setOpen(null);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2" data-testid="trip-check-panel">
      <CheckLine
        kind="before_leaving"
        check={before}
        who={nameOf(before?.checkedByPersonId)}
      />
      <CheckLine
        kind="after_return"
        check={after}
        who={nameOf(after?.checkedByPersonId)}
      />
      {miles != null ? (
        <p className="text-base text-ink-2">
          Trip: {milesFmt.format(miles)} mi
        </p>
      ) : null}
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {open === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost min-h-10"
            onClick={() => setOpen("before_leaving")}
          >
            {before ? "Check again before leaving" : "Check before leaving"}
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-10"
            onClick={() => setOpen("after_return")}
          >
            {after ? "Check again after return" : "Check after return"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => void submit(event)}
          className="grid gap-3 sm:grid-cols-3"
          aria-label={`Trip check: ${TRIP_CHECK_KIND_LABEL[open].toLowerCase()}`}
        >
          <p className="text-base font-semibold sm:col-span-3">
            Trip check: {TRIP_CHECK_KIND_LABEL[open].toLowerCase()}
          </p>
          {TRIP_CHECK_ITEMS.map(([key, label]) => (
            <label className="field-label" key={key}>
              <span>{label}</span>
              <select
                name={key}
                className="input min-h-10 w-full"
                defaultValue="good"
              >
                {TRIP_CHECK_RATINGS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="field-label">
            <span>Fridge unit</span>
            <select
              name="refrigeration"
              className="input min-h-10 w-full"
              defaultValue=""
            >
              <option value="">No fridge unit</option>
              {TRIP_CHECK_RATINGS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>Odometer (mi)</span>
            <input
              name="odometer"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              className="input min-h-10 w-full"
              placeholder="Not recorded"
            />
          </label>
          <label className="field-label">
            <span>Fuel level</span>
            <select
              name="fuelLevel"
              className="input min-h-10 w-full"
              defaultValue=""
            >
              <option value="">Not recorded</option>
              {TRIP_FUEL_LEVELS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label sm:col-span-3">
            <span>Damage found</span>
            <input
              name="damageNote"
              className="input min-h-10 w-full"
              placeholder="For example: dent on the rear door"
            />
          </label>
          <label className="field-label sm:col-span-3">
            <span>Notes</span>
            <input name="notes" className="input min-h-10 w-full" />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save trip check"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
