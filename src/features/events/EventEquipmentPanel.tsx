import { useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useEquipmentReservationCancel,
  useEquipmentReservationCheckOut,
  useEquipmentReservationMarkReturned,
  useListEquipment,
  useListEquipmentReservation,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { useReserveEquipment } from "../facilities/equipmentCheckout";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { localDateTime } from "./eventDetailFormHelpers";
import "./EventEquipmentPanel.css";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

const CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
  "out_of_service",
] as const;

type EquipmentCondition = (typeof CONDITIONS)[number];
type ChecklistMode = "checkout" | "return";

type ChecklistDraft = {
  reservationId: Id<"equipmentReservations">;
  mode: ChecklistMode;
  condition: EquipmentCondition;
  note: string;
};

const CONDITION_RANK: Record<EquipmentCondition, number> = {
  excellent: 0,
  good: 1,
  fair: 2,
  poor: 3,
  out_of_service: 4,
};

export function EventEquipmentPanel({
  eventId,
  startsAt,
  endsAt,
}: {
  eventId: Id<"events">;
  startsAt?: number | null;
  endsAt?: number | null;
}) {
  const equipment = useListEquipment();
  const reservations = useListEquipmentReservation();
  const reserveEquipment = useReserveEquipment();
  const checkOut = useEquipmentReservationCheckOut();
  const markReturned = useEquipmentReservationMarkReturned();
  const cancelReservation = useEquipmentReservationCancel();
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const equipmentRows = (equipment ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.status === "active" &&
      row.registeredAt != null,
  );
  const eventReservations = (reservations ?? [])
    .filter(
      (reservation) =>
        reservation.deletedAt == null && reservation.eventId === eventId,
    )
    .sort(
      (left, right) =>
        statusOrder(String(left.status)) - statusOrder(String(right.status)) ||
        Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
    );
  const equipmentById = new Map(
    (equipment ?? []).map((row) => [String(row._id), row]),
  );
  const selectedEquipment = equipmentById.get(selectedEquipmentId);
  const reservedCount = eventReservations.filter(
    (row) => row.status === "reserved",
  ).length;
  const checkedOutCount = eventReservations.filter(
    (row) => row.status === "checked_out",
  ).length;
  const returnedCount = eventReservations.filter(
    (row) => row.status === "returned",
  ).length;
  const defaultStart = startsAt ?? Date.now();
  const defaultEnd = endsAt ?? defaultStart + 4 * 60 * 60 * 1000;

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitReservation = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const equipmentId = String(data.get("equipmentId"));
    void run("reserve", async () => {
      await reserveEquipment({
        equipmentId: equipmentId as Id<"equipments">,
        eventId,
        startsAt: new Date(String(data.get("startsAt"))).getTime(),
        endsAt: new Date(String(data.get("endsAt"))).getTime(),
        quantity: Number(data.get("quantity")),
      });
      form.reset();
      setSelectedEquipmentId("");
      setShowReserveForm(false);
      setNotice("Equipment reserved and added to the handoff checklist.");
    });
  };

  const openChecklist = (reservation: (typeof eventReservations)[number]) => {
    const item = equipmentById.get(String(reservation.equipmentId));
    const mode: ChecklistMode =
      reservation.status === "checked_out" ? "return" : "checkout";
    const condition =
      mode === "return"
        ? (reservation.checkoutCondition ?? item?.condition ?? "good")
        : (item?.condition ?? "good");
    setChecklistDraft({
      reservationId: reservation._id,
      mode,
      condition: condition as EquipmentCondition,
      note: "",
    });
  };

  const submitChecklist = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!checklistDraft) return;
    const reservation = eventReservations.find(
      (row) => row._id === checklistDraft.reservationId,
    );
    if (!reservation) return;
    const mode = checklistDraft.mode;
    void run(`${reservation._id}:${mode}`, async () => {
      const args = {
        docId: reservation._id,
        version: reservation.version,
        condition: checklistDraft.condition,
        note: checklistDraft.note.trim() || undefined,
      };
      if (mode === "checkout") await checkOut(args);
      else await markReturned(args);
      setChecklistDraft(null);
      setNotice(
        mode === "checkout"
          ? "Checkout confirmed — equipment is out with the event."
          : "Return confirmed — condition is recorded in the equipment catalog.",
      );
    });
  };

  const cancel = async (reservation: (typeof eventReservations)[number]) => {
    const confirmed = await prompt.askConfirm({
      title: "Cancel this equipment reservation?",
      description:
        "The item will be released for other events. Checkout and return history will remain unchanged.",
      confirmLabel: "Release equipment",
      tone: "danger",
    });
    if (!confirmed) return;
    void run(`${reservation._id}:cancel`, async () => {
      await cancelReservation({
        docId: reservation._id,
        version: reservation.version,
      });
      setNotice("Equipment released for other events.");
    });
  };

  return (
    <section className="equipment-dispatch" aria-labelledby="equipment-title">
      <header className="equipment-dispatch__header">
        <div>
          <p className="equipment-dispatch__kicker">Event equipment control</p>
          <h2 id="equipment-title">Dispatch &amp; return board</h2>
          <p>
            Reserve the load window, confirm what left, then compare its return
            condition against the outbound check.
          </p>
        </div>
        <div className="equipment-dispatch__header-actions">
          <div
            className="equipment-dispatch__totals"
            aria-label="Checklist totals"
          >
            <span>
              <b>{reservedCount}</b> staged
            </span>
            <span>
              <b>{checkedOutCount}</b> out
            </span>
            <span>
              <b>{returnedCount}</b> back
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowReserveForm((value) => !value)}
          >
            {showReserveForm ? "Close reservation" : "Reserve equipment"}
          </button>
        </div>
      </header>

      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="equipment-dispatch__notice" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showReserveForm ? (
        <form
          className="equipment-reserve-form"
          onSubmit={submitReservation}
          data-testid="equipment-reservation-form"
        >
          <div className="equipment-reserve-form__title">
            <span>New allocation</span>
            <strong>Lock a load window</strong>
          </div>
          <label className="field-label equipment-reserve-form__asset">
            Equipment
            <select
              name="equipmentId"
              className="input"
              required
              value={selectedEquipmentId}
              onChange={(event) => setSelectedEquipmentId(event.target.value)}
            >
              <option value="">Choose equipment</option>
              {equipmentRows.map((item) => (
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
              max={selectedEquipment?.quantity ?? undefined}
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
          <button
            className="btn btn-primary equipment-reserve-form__submit"
            disabled={busy != null || !selectedEquipmentId}
          >
            {busy === "reserve" ? "Checking availability…" : "Reserve item"}
          </button>
        </form>
      ) : null}

      {equipment === undefined || reservations === undefined ? (
        <div className="equipment-dispatch__loading">
          <TableSkeleton rows={3} />
        </div>
      ) : eventReservations.length === 0 ? (
        <div className="equipment-dispatch__empty">
          <span>00</span>
          <div>
            <strong>No equipment reserved</strong>
            <p>Add the first item to create this event&apos;s handoff sheet.</p>
          </div>
        </div>
      ) : (
        <div className="equipment-checklist">
          {eventReservations.map((reservation, index) => {
            const item = equipmentById.get(String(reservation.equipmentId));
            const isEditing = checklistDraft?.reservationId === reservation._id;
            return (
              <article
                className="equipment-checklist__row"
                key={reservation._id}
                data-status={reservation.status}
                data-testid="equipment-checklist-row"
              >
                <div className="equipment-checklist__identity">
                  <span className="equipment-checklist__sequence">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{item?.name ?? "Unknown equipment"}</strong>
                    <span>
                      {item?.assetTag ?? "No asset tag"} · qty{" "}
                      {reservation.quantity}
                    </span>
                  </div>
                  <StatusChip status={String(reservation.status)} />
                </div>

                <div className="equipment-checklist__window">
                  <span>Load window</span>
                  <strong>
                    {formatDate(reservation.startsAt)} ·{" "}
                    {formatTime(reservation.startsAt)}
                  </strong>
                  <small>
                    Back {formatDate(reservation.endsAt)} ·{" "}
                    {formatTime(reservation.endsAt)}
                  </small>
                </div>

                <Checkpoint
                  label="Outbound"
                  complete={reservation.checkedOutAt != null}
                  condition={reservation.checkoutCondition}
                  note={reservation.checkoutNote}
                  timestamp={reservation.checkedOutAt}
                  pendingLabel="Confirm checkout"
                  disabled={reservation.status !== "reserved" || busy != null}
                  onAction={() => openChecklist(reservation)}
                />

                <Checkpoint
                  label="Return"
                  complete={reservation.returnedAt != null}
                  condition={reservation.returnCondition}
                  note={reservation.returnNote}
                  timestamp={reservation.returnedAt}
                  pendingLabel={
                    reservation.status === "reserved"
                      ? "Waiting for checkout"
                      : "Confirm return"
                  }
                  disabled={
                    reservation.status !== "checked_out" || busy != null
                  }
                  onAction={() => openChecklist(reservation)}
                  comparison={conditionComparison(
                    reservation.checkoutCondition,
                    reservation.returnCondition,
                  )}
                />

                {reservation.status === "reserved" ? (
                  <button
                    type="button"
                    className="equipment-checklist__release"
                    disabled={busy != null}
                    onClick={() => void cancel(reservation)}
                  >
                    Release
                  </button>
                ) : null}

                {isEditing && checklistDraft ? (
                  <form
                    className="equipment-inspection"
                    onSubmit={submitChecklist}
                    data-testid="equipment-condition-form"
                  >
                    <div>
                      <span>
                        {checklistDraft.mode === "checkout"
                          ? "Outbound check"
                          : "Return check"}
                      </span>
                      <strong>Record condition</strong>
                    </div>
                    <label className="field-label">
                      Condition
                      <select
                        className="input"
                        value={checklistDraft.condition}
                        onChange={(event) =>
                          setChecklistDraft({
                            ...checklistDraft,
                            condition: event.target.value as EquipmentCondition,
                          })
                        }
                      >
                        {CONDITIONS.map((condition) => (
                          <option key={condition} value={condition}>
                            {condition.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label equipment-inspection__note">
                      Condition notes
                      <textarea
                        className="input"
                        rows={2}
                        placeholder="Optional: scratches, missing parts, damp linens…"
                        value={checklistDraft.note}
                        onChange={(event) =>
                          setChecklistDraft({
                            ...checklistDraft,
                            note: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="equipment-inspection__actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setChecklistDraft(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={busy != null}
                      >
                        {busy
                          ? "Saving…"
                          : checklistDraft.mode === "checkout"
                            ? "Confirm left site"
                            : "Confirm returned"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Checkpoint({
  label,
  complete,
  condition,
  note,
  timestamp,
  pendingLabel,
  disabled,
  onAction,
  comparison,
}: {
  label: string;
  complete: boolean;
  condition?: string | null;
  note?: string | null;
  timestamp?: number | null;
  pendingLabel: string;
  disabled: boolean;
  onAction: () => void;
  comparison?: { label: string; tone: "match" | "changed" } | null;
}) {
  return (
    <div className="equipment-checkpoint" data-complete={complete}>
      <div className="equipment-checkpoint__label">
        <span aria-hidden="true">{complete ? "✓" : "○"}</span>
        {label}
      </div>
      {complete ? (
        <div className="equipment-checkpoint__record">
          <strong>{condition?.replaceAll("_", " ") ?? "Recorded"}</strong>
          {comparison ? (
            <span data-tone={comparison.tone}>{comparison.label}</span>
          ) : null}
          {note ? <small>{note}</small> : null}
          {timestamp ? (
            <time>
              {formatDate(timestamp)} · {formatTime(timestamp)}
            </time>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={onAction}
        >
          {pendingLabel}
        </button>
      )}
    </div>
  );
}

function conditionComparison(
  outbound?: string | null,
  returned?: string | null,
): { label: string; tone: "match" | "changed" } | null {
  if (!outbound || !returned) return null;
  const outboundRank = CONDITION_RANK[outbound as EquipmentCondition];
  const returnRank = CONDITION_RANK[returned as EquipmentCondition];
  if (outboundRank === undefined || returnRank === undefined) return null;
  if (returnRank <= outboundRank) {
    return { label: "Matches outbound", tone: "match" };
  }
  return {
    label: `Changed from ${outbound.replaceAll("_", " ")}`,
    tone: "changed",
  };
}

function statusOrder(status: string): number {
  if (status === "checked_out") return 0;
  if (status === "reserved") return 1;
  if (status === "returned") return 2;
  return 3;
}
