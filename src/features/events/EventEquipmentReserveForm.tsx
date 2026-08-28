import type { FormEvent } from "react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { localDateTime } from "./eventDetailFormHelpers";

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
}: Props) {
  const selected = equipment.find((item) => item._id === selectedEquipmentId);
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
          {equipment.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name} · {item.assetTag} · {item.quantity} available in
              catalog
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Quantity
        <input
          name="quantity"
          type="number"
          className="input"
          min={1}
          max={selected?.quantity ?? undefined}
          defaultValue={1}
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
