import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { localDateTime } from "./eventDetailFormHelpers";
import { EventEquipmentAvailabilityNote } from "./EventEquipmentAvailabilityNote";
import type { ItemAvailability } from "./equipmentAvailabilityView";

export type ReservableEquipment = {
  readonly _id: string;
  readonly name: string;
  readonly assetTag: string;
  readonly quantity: number;
};

type Props = {
  readonly equipment: readonly ReservableEquipment[];
  readonly selectedEquipmentId: string;
  readonly onSelectEquipment: (equipmentId: string) => void;
  readonly defaultStart: number;
  readonly defaultEnd: number;
  readonly busy: string | null;
  readonly onSubmit: (formEvent: FormEvent<HTMLFormElement>) => void;
  readonly onDismiss: () => void;
  /** Free counts and holds for this event's time (PL-ASSET-AVAILABILITY). */
  readonly availability?: readonly ItemAvailability[];
  /** A manager may book out-of-service or in-repair units with a reason. */
  readonly canOverride?: boolean;
};

/** "Lock a load window": pick an item, quantity, and the checkout/return times. */
export function EventEquipmentReserveForm({
  equipment,
  selectedEquipmentId,
  onSelectEquipment,
  defaultStart,
  defaultEnd,
  busy,
  onSubmit,
  onDismiss,
  availability,
  canOverride = false,
}: Props) {
  const selected = equipment.find((item) => item._id === selectedEquipmentId);
  const [wanted, setWanted] = useState(1);
  const freeById = new Map(
    (availability ?? []).map((row) => [row.equipmentId, row]),
  );
  const selectedAvailability = freeById.get(selectedEquipmentId);
  const outOfUse =
    selectedAvailability != null &&
    (selectedAvailability.blocked === "out_of_service" ||
      (selectedAvailability.outOfUse ?? 0) > 0);
  return (
    <form
      className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={onSubmit}
      data-testid="equipment-reservation-form"
    >
      <div className="sm:col-span-2 lg:col-span-4">
        <p className="eyebrow">New allocation</p>
        <strong className="text-base text-ink">Lock a load window</strong>
      </div>
      <label className="field-label sm:col-span-2">
        Equipment
        <select
          name="equipmentId"
          className="input"
          required
          value={selectedEquipmentId}
          onChange={(event) => onSelectEquipment(event.target.value)}
        >
          <option value="">Choose equipment</option>
          {equipment.map((item) => {
            const free = freeById.get(item._id);
            return (
              <option key={item._id} value={item._id}>
                {item.name} · {item.assetTag} ·{" "}
                {free == null
                  ? `${item.quantity} in the catalog`
                  : free.blocked === "out_of_service"
                    ? "out of service"
                    : `${free.free} of ${item.quantity} free${
                        free.onEvent
                          ? ` · ${free.onEvent} already on this event`
                          : ""
                      }`}
              </option>
            );
          })}
        </select>
        {selectedAvailability ? (
          <EventEquipmentAvailabilityNote
            item={selectedAvailability}
            all={availability ?? []}
            wanted={wanted}
            onPick={onSelectEquipment}
          />
        ) : null}
        {equipment.length === 0 ? (
          <span className="field-hint" data-testid="equipment-empty-catalog">
            Nothing in the equipment catalog yet, so this list is empty. Open{" "}
            <Link
              to="/facilities/equipment"
              target="_blank"
              rel="noopener"
              className="underline font-medium"
            >
              Facilities → Equipment
            </Link>{" "}
            and add kit (or paste a pack list). This form stays here.
          </span>
        ) : equipment.length < 5 ? (
          <span className="field-hint" data-testid="equipment-thin-catalog">
            Only {equipment.length} item{equipment.length === 1 ? "" : "s"} in
            the catalog. Add the real kit in{" "}
            <Link
              to="/facilities/equipment"
              target="_blank"
              rel="noopener"
              className="underline font-medium"
            >
              Facilities → Equipment
            </Link>{" "}
            — “Paste a pack list” or “Add the standard kit” fills it in one go
            (new tab; this form stays put).
          </span>
        ) : null}
      </label>
      <label className="field-label">
        Quantity
        <input
          name="quantity"
          type="number"
          className="input"
          min={1}
          max={selected?.quantity ?? undefined}
          value={wanted}
          onChange={(event) => setWanted(Number(event.target.value) || 0)}
          required
        />
      </label>
      <label className="field-label">
        Checkout
        <BoundedDateTimeLocalInput
          name="startsAt"
          className="input"
          defaultValue={localDateTime(defaultStart)}
          required
        />
      </label>
      <label className="field-label">
        Expected back
        <BoundedDateTimeLocalInput
          name="endsAt"
          className="input"
          defaultValue={localDateTime(defaultEnd)}
          required
        />
      </label>
      {canOverride && outOfUse ? (
        <label className="field-label sm:col-span-2 lg:col-span-4">
          Book it anyway - why? (managers only)
          <input
            name="overrideReason"
            className="input"
            placeholder="Optional: e.g. latch is taped, still heats fine"
          />
          <span className="field-hint">
            Leave empty to keep broken or in-repair units out. With a reason,
            they can be booked and checked out, and the reason is kept.
          </span>
        </label>
      ) : null}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button
          className="btn btn-primary"
          disabled={busy != null || !selectedEquipmentId}
        >
          {busy === "reserve" ? "Checking availability…" : "Reserve item"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Cancel
        </button>
      </div>
    </form>
  );
}
