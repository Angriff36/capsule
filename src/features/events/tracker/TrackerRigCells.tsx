import type { TrackerRig } from "./trackerSheet";

export interface RigOption {
  id: string;
  label: string;
}

export interface RigChange {
  vehicleId: string | null;
  trailerId: string | null;
  driverId: string | null;
}

interface TrackerRigCellsProps {
  eventTitle: string;
  rigs: TrackerRig[];
  vehicles: RigOption[];
  trailers: RigOption[];
  drivers: RigOption[];
  canEdit: boolean;
  busy: boolean;
  /** A rig with no vehicle and no trailer left is released. */
  onChange: (rig: TrackerRig, next: RigChange) => void;
  onAdd: (first: { vehicleId?: string; trailerId?: string }) => void;
  onTogglePreloaded: (rig: TrackerRig, on: boolean) => void;
  onRelease: (rig: TrackerRig) => void;
}

function optionsWithCurrent(options: RigOption[], current: string | null) {
  if (!current || options.some((option) => option.id === current))
    return options;
  return [...options, { id: current, label: "No longer available" }];
}

/**
 * The vehicle, trailer, driver and loaded columns of one tracker row. An event
 * can hold several rigs, so the four columns are one grid with a line per rig
 * and an empty last line that attaches a new one.
 */
export function TrackerRigCells({
  eventTitle,
  rigs,
  vehicles,
  trailers,
  drivers,
  canEdit,
  busy,
  onChange,
  onAdd,
  onTogglePreloaded,
  onRelease,
}: TrackerRigCellsProps) {
  const disabled = !canEdit || busy;
  const pick = (
    label: string,
    value: string | null,
    options: RigOption[],
    onPick: (id: string | null) => void,
    off = disabled,
  ) => (
    <select
      className="tracker-sheet-input"
      aria-label={label}
      value={value ?? ""}
      disabled={off}
      onChange={(domEvent) => onPick(domEvent.currentTarget.value || null)}
    >
      <option value="">—</option>
      {optionsWithCurrent(options, value).map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="tracker-rigs">
      {rigs.map((rig) => {
        const current: RigChange = {
          vehicleId: rig.vehicleId,
          trailerId: rig.trailerId,
          driverId: rig.driverId,
        };
        return (
          <div
            key={rig.id}
            className="tracker-rig"
            data-conflict={rig.conflict != null || undefined}
            title={rig.conflict ?? undefined}
          >
            {pick(`Vehicle for ${eventTitle}`, rig.vehicleId, vehicles, (id) =>
              onChange(rig, { ...current, vehicleId: id }),
            )}
            {pick(`Trailer for ${eventTitle}`, rig.trailerId, trailers, (id) =>
              onChange(rig, { ...current, trailerId: id }),
            )}
            {pick(`Driver for ${eventTitle}`, rig.driverId, drivers, (id) =>
              onChange(rig, { ...current, driverId: id }),
            )}
            <span className="tracker-rig-end">
              <input
                type="checkbox"
                aria-label={`Loaded in the vehicle for ${eventTitle}`}
                title="The load is in the vehicle"
                checked={rig.preloaded}
                disabled={disabled}
                onChange={(domEvent) =>
                  onTogglePreloaded(rig, domEvent.currentTarget.checked)
                }
              />
              {canEdit ? (
                <button
                  type="button"
                  className="tracker-rig-release"
                  aria-label={`Take this rig off ${eventTitle}`}
                  title="Take this rig off the event"
                  disabled={busy}
                  onClick={() => onRelease(rig)}
                >
                  ×
                </button>
              ) : null}
            </span>
            {rig.conflict ? (
              <small className="tracker-rig-conflict" role="status">
                ⚠ {rig.conflict}
              </small>
            ) : null}
          </div>
        );
      })}
      {canEdit ? (
        <div className="tracker-rig" data-new>
          {pick(
            rigs.length === 0
              ? `Vehicle for ${eventTitle}`
              : `Another vehicle for ${eventTitle}`,
            null,
            vehicles,
            (id) => id && onAdd({ vehicleId: id }),
          )}
          {pick(
            rigs.length === 0
              ? `Trailer for ${eventTitle}`
              : `Another trailer for ${eventTitle}`,
            null,
            trailers,
            (id) => id && onAdd({ trailerId: id }),
          )}
          <span className="tracker-rig-hint">
            {rigs.length === 0 ? "Pick a vehicle or trailer" : "Add another"}
          </span>
          <span />
        </div>
      ) : rigs.length === 0 ? (
        <span className="tracker-rig-hint">No vehicle</span>
      ) : null}
    </div>
  );
}
