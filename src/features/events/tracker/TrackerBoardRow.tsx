import type { FocusEvent, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../../../lib/format";
import { eventDetailPath } from "../eventRoutes";
import {
  Chip,
  EditableTextCell,
  EquipmentCell,
  type EquipmentHoldChip,
} from "./TrackerBoardCells";
import {
  TrackerRigCells,
  type RigChange,
  type RigOption,
} from "./TrackerRigCells";
import {
  PACK_STATE_LABEL,
  type TrackerRig,
  type TrackerRow,
} from "./trackerSheet";

export interface TrackerRowPermissions {
  canEditEvent: boolean;
  canEditRigs: boolean;
  canEditEquipment: boolean;
}

export interface TrackerRowActions {
  onEventNumber: (next: string) => void;
  onBinderBuilt: (built: boolean) => void;
  onOpenPackList: () => void;
  onAddRig: (first: { vehicleId?: string; trailerId?: string }) => void;
  onChangeRig: (rig: TrackerRig, next: RigChange) => void;
  onTogglePreloaded: (rig: TrackerRig, on: boolean) => void;
  onReleaseRig: (rig: TrackerRig) => void;
  onAddEquipment: (equipmentId: string, quantity: number) => void;
  onRemoveEquipment: (hold: EquipmentHoldChip) => void;
  onDecor: (next: string) => void;
  onNotes: (next: string) => void;
}

export type StatusGroup =
  "confirmed" | "pending" | "in_progress" | "completed" | "cancelled";

export const STATUS_LABEL: Record<StatusGroup, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function statusGroup(stage: string): StatusGroup {
  if (stage === "cancelled") return "cancelled";
  if (stage === "executing") return "in_progress";
  if (stage === "completed" || stage === "closed_out") return "completed";
  if (stage === "approved" || stage === "sales_lock" || stage === "final")
    return "confirmed";
  return "pending";
}

export interface CrewChip {
  personId: string;
  name: string;
  warn: string | null;
}

/** One event on the tracker. Every cell writes through its own command. */
export function TrackerBoardRow({
  row,
  busy,
  resetKey,
  permissions,
  vehicles,
  trailers,
  drivers,
  crew,
  holds,
  equipmentOptions,
  decorHolds,
  decorOptions,
  conflicted,
  actions,
}: {
  row: TrackerRow;
  busy: boolean;
  resetKey: number;
  permissions: TrackerRowPermissions;
  vehicles: RigOption[];
  trailers: RigOption[];
  drivers: RigOption[];
  crew: CrewChip[];
  holds: EquipmentHoldChip[];
  equipmentOptions: RigOption[];
  /** Decor items held from the catalog, and the ones that can be added. */
  decorHolds: EquipmentHoldChip[];
  decorOptions: RigOption[];
  /** Something on this event is double-booked. */
  conflicted: boolean;
  actions: TrackerRowActions;
}) {
  const status = statusGroup(row.stage);
  const day =
    row.startsAt != null
      ? new Date(row.startsAt).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "No date";
  return (
    <tr
      data-busy={busy || undefined}
      data-conflict={conflicted || undefined}
      data-status={status}
    >
      <td className="trk-col-num">
        <input
          key={`${row.storedEventNumber}:${resetKey}`}
          className="trk-number"
          aria-label={`Event number for ${row.title}`}
          defaultValue={row.storedEventNumber}
          placeholder={row.eventNumber || "No #"}
          inputMode="numeric"
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
      <td className="trk-col-event">
        <Link to={eventDetailPath(row.id)} className="trk-title">
          {row.title}
        </Link>
        <small>
          {row.client}
          {row.guests > 0 ? ` · ${row.guests} guests` : ""}
        </small>
      </td>
      <td className="trk-col-date">
        <strong>{day}</strong>
        <small>
          {row.startsAt != null ? formatTime(row.startsAt) : ""}
          {row.endsAt != null ? ` – ${formatTime(row.endsAt)}` : ""}
        </small>
      </td>
      <td className="trk-col-venue">
        {row.venue || <span className="trk-none">No venue</span>}
      </td>
      <td className="trk-col-pill">
        <span className="trk-pill" data-status={status}>
          {STATUS_LABEL[status]}
        </span>
      </td>
      <td className="trk-col-pack">
        <span
          className="trk-pill"
          data-pack={row.packState}
          title={row.packDetail ?? undefined}
        >
          {PACK_STATE_LABEL[row.packState]}
        </span>
        {row.packListId ? (
          <Link className="trk-link" to={`/logistics/packs/${row.packListId}`}>
            Pack list
          </Link>
        ) : permissions.canEditRigs ? (
          <button
            type="button"
            className="trk-link"
            disabled={busy}
            onClick={actions.onOpenPackList}
          >
            Open pack list
          </button>
        ) : null}
        <label className="trk-binder">
          <input
            type="checkbox"
            aria-label={`Binder built for ${row.title}`}
            checked={row.binderBuilt}
            disabled={!permissions.canEditEvent || busy}
            onChange={(domEvent) =>
              actions.onBinderBuilt(domEvent.currentTarget.checked)
            }
          />
          Binder
        </label>
      </td>
      <td className="trk-col-rigs">
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
      <td className="trk-col-chips">
        <div className="trk-chips">
          {crew.length === 0 ? (
            <span className="trk-none">No crew</span>
          ) : (
            crew.map((person) => (
              <Chip
                key={person.personId}
                tone="people"
                label={person.name}
                warn={person.warn != null}
                title={person.warn ?? undefined}
              />
            ))
          )}
        </div>
      </td>
      <td className="trk-col-chips">
        <EquipmentCell
          eventTitle={row.title}
          holds={holds}
          options={equipmentOptions}
          canEdit={permissions.canEditEquipment}
          busy={busy}
          onAdd={actions.onAddEquipment}
          onRemove={actions.onRemoveEquipment}
        />
      </td>
      <td className="trk-col-chips">
        <EquipmentCell
          eventTitle={row.title}
          holds={decorHolds}
          options={decorOptions}
          canEdit={permissions.canEditEquipment}
          busy={busy}
          addLabel="Decor"
          tone="decor"
          onAdd={actions.onAddEquipment}
          onRemove={actions.onRemoveEquipment}
        />
        <EditableTextCell
          label={`Decor for ${row.title}`}
          value={row.decor}
          canEdit={permissions.canEditEvent}
          busy={busy}
          asChips
          placeholder="Decor notes"
          onSave={actions.onDecor}
        />
      </td>
      <td className="trk-col-notes">
        <EditableTextCell
          label={`Notes for ${row.title}`}
          value={row.notes}
          canEdit={permissions.canEditEvent}
          busy={busy}
          asChips={false}
          placeholder="Notes"
          onSave={actions.onNotes}
        />
      </td>
    </tr>
  );
}
