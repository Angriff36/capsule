import type { FocusEvent, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../../../lib/format";
import { eventDetailPath } from "../eventRoutes";
import { STAGE_LABEL, type EventStage } from "../eventStatus";
import {
  TrackerRigCells,
  type RigChange,
  type RigOption,
} from "./TrackerRigCells";
import {
  BINDER_OPTIONS,
  PACK_STATE_LABEL,
  type TrackerRig,
  type TrackerRow,
} from "./trackerSheet";

export interface TrackerRowPermissions {
  canEditEvent: boolean;
  canChangeStyle: boolean;
  canEditRigs: boolean;
  canOpenList: boolean;
}

export interface TrackerRowActions {
  onEventNumber: (next: string) => void;
  onServiceStyle: (serviceStyleId: string) => void;
  onBinder: (binderStatus: string) => void;
  onOpenPackList: () => void;
  onAddRig: (first: { vehicleId?: string; trailerId?: string }) => void;
  onChangeRig: (rig: TrackerRig, next: RigChange) => void;
  onTogglePreloaded: (rig: TrackerRig, on: boolean) => void;
  onReleaseRig: (rig: TrackerRig) => void;
}

interface TrackerSheetRowProps {
  row: TrackerRow;
  dayLabel: string;
  isToday: boolean;
  isWeekend: boolean;
  busy: boolean;
  /** Bumped after a rejected edit so an input falls back to the saved value. */
  resetKey: number;
  permissions: TrackerRowPermissions;
  styleOptions: RigOption[];
  /** Name of the row's style when it is not in styleOptions (retired). */
  retiredStyleName: string | undefined;
  vehicles: RigOption[];
  trailers: RigOption[];
  drivers: RigOption[];
  actions: TrackerRowActions;
}

/** One event on the tracker sheet. Every cell writes through its own command. */
export function TrackerSheetRow({
  row,
  dayLabel,
  isToday,
  isWeekend,
  busy,
  resetKey,
  permissions,
  styleOptions,
  retiredStyleName,
  vehicles,
  trailers,
  drivers,
  actions,
}: TrackerSheetRowProps) {
  const currentStyle = styleOptions.find(
    (style) => style.id === row.serviceStyleId,
  );
  return (
    <tr
      data-today={isToday || undefined}
      data-weekend={isWeekend || undefined}
      data-busy={busy || undefined}
    >
      <td className="tracker-col-num">
        <input
          key={`${row.storedEventNumber}:${resetKey}`}
          className="tracker-sheet-input"
          aria-label={`Event number for ${row.title}`}
          defaultValue={row.storedEventNumber}
          placeholder={row.eventNumber}
          disabled={!permissions.canEditEvent || busy}
          onBlur={(domEvent: FocusEvent<HTMLInputElement>) => {
            const next = domEvent.currentTarget.value.trim();
            if (next !== row.storedEventNumber) actions.onEventNumber(next);
          }}
          onKeyDown={(domEvent: KeyboardEvent<HTMLInputElement>) => {
            if (domEvent.key === "Enter") domEvent.currentTarget.blur();
          }}
        />
      </td>
      <td className="tracker-col-date">
        <span>{dayLabel}</span>
        <small>{row.startsAt != null ? formatTime(row.startsAt) : ""}</small>
      </td>
      <td className="tracker-col-event">
        <Link to={eventDetailPath(row.id)}>{row.title}</Link>
        <small>
          {row.client} · {row.guests} guests ·{" "}
          {STAGE_LABEL[row.stage as EventStage] ?? row.stage}
        </small>
      </td>
      <td className="tracker-col-style">
        {permissions.canChangeStyle ? (
          <select
            className="tracker-sheet-input"
            aria-label={`Service style for ${row.title}`}
            value={row.serviceStyleId ?? ""}
            disabled={busy}
            onChange={(domEvent) => {
              const next = domEvent.currentTarget.value;
              if (next && next !== row.serviceStyleId)
                actions.onServiceStyle(next);
            }}
          >
            <option value="" disabled>
              Not set
            </option>
            {row.serviceStyleId && !currentStyle ? (
              <option value={row.serviceStyleId} disabled>
                {retiredStyleName ?? "Retired style"}
              </option>
            ) : null}
            {styleOptions.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        ) : (
          (currentStyle?.label ?? retiredStyleName ?? "Not set")
        )}
      </td>
      <td className="tracker-col-rigs">
        <TrackerRigCells
          eventTitle={row.title}
          rigs={row.rigs}
          vehicles={vehicles}
          trailers={trailers}
          drivers={drivers}
          canEdit={permissions.canEditRigs}
          busy={busy}
          onAdd={actions.onAddRig}
          onChange={actions.onChangeRig}
          onTogglePreloaded={actions.onTogglePreloaded}
          onRelease={actions.onReleaseRig}
        />
      </td>
      <td className="tracker-col-binder">
        <select
          className="tracker-sheet-input"
          aria-label={`Binder status for ${row.title}`}
          data-binder={row.binderStatus ?? "none"}
          value={row.binderStatus ?? ""}
          disabled={!permissions.canEditEvent || busy}
          onChange={(domEvent) => {
            const next = domEvent.currentTarget.value;
            if (next) actions.onBinder(next);
          }}
        >
          <option value="" disabled>
            Not started
          </option>
          {BINDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td className="tracker-col-pack">
        <span
          className="tracker-pack-pill"
          data-pack={row.packState}
          title={row.packDetail ?? undefined}
        >
          {PACK_STATE_LABEL[row.packState]}
        </span>
        {row.packListId ? (
          <Link
            className="tracker-pack-link"
            to={`/logistics/packs/${row.packListId}`}
          >
            Pack list
          </Link>
        ) : permissions.canOpenList ? (
          <button
            type="button"
            className="tracker-pack-link"
            disabled={busy}
            onClick={actions.onOpenPackList}
          >
            Open pack list
          </button>
        ) : null}
        {row.packDetail ? <small>{row.packDetail}</small> : null}
      </td>
    </tr>
  );
}
