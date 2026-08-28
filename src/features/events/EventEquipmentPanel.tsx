import { useState, type FormEvent, type ReactNode } from "react";
import type { Id } from "../../lib/api";
import {
  useEquipmentReservationCancel,
  useEquipmentReservationCheckOut,
  useEquipmentReservationMarkReturned,
  useListEquipment,
  useListEquipmentReservation,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { useReserveEquipment } from "../facilities/equipmentCheckout";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import "./EventEquipmentPanel.css";
import { useActionNotice } from "../../ui/action-result";
import { PlusIcon } from "../../ui/icons";
import {
  EventEquipmentSheet,
  type ChecklistDraft,
  type ChecklistMode,
  type EquipmentCondition,
  type EquipmentSheetRow,
} from "./EventEquipmentSheet";
import {
  EventEquipmentSidebar,
  type EquipmentCategoryCount,
} from "./EventEquipmentSidebar";
import { EventEquipmentReserveForm } from "./EventEquipmentReserveForm";

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
  const { notice, setNotice } = useActionNotice();
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

  const sheetRows: EquipmentSheetRow[] = eventReservations.map(
    (reservation) => {
      const item = equipmentById.get(String(reservation.equipmentId));
      return {
        id: reservation._id,
        status: String(reservation.status),
        name: item?.name ?? "Unknown equipment",
        assetTag: item?.assetTag ?? "No asset tag",
        category: item?.category?.trim() || "Uncategorised",
        quantity: reservation.quantity,
        startsAt: reservation.startsAt,
        endsAt: reservation.endsAt,
        checkedOutAt: reservation.checkedOutAt,
        checkoutCondition: reservation.checkoutCondition,
        checkoutNote: reservation.checkoutNote,
        returnedAt: reservation.returnedAt,
        returnCondition: reservation.returnCondition,
        returnNote: reservation.returnNote,
      };
    },
  );

  const categories: EquipmentCategoryCount[] = [
    ...sheetRows
      .reduce((counts, row) => {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);

  const startTimes = eventReservations
    .map((row) => Number(row.startsAt ?? 0))
    .filter((value) => value > 0);
  const endTimes = eventReservations
    .map((row) => Number(row.endsAt ?? 0))
    .filter((value) => value > 0);

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

  const openChecklist = (row: EquipmentSheetRow) => {
    const reservation = eventReservations.find(
      (candidate) => candidate._id === row.id,
    );
    if (!reservation) return;
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

  const cancel = async (row: EquipmentSheetRow) => {
    const reservation = eventReservations.find(
      (candidate) => candidate._id === row.id,
    );
    if (!reservation) return;
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

  const loading = equipment === undefined || reservations === undefined;

  return (
    <section className="equipment-dispatch" aria-labelledby="equipment-title">
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="equipment-title" className="text-lg font-semibold text-ink">
            Dispatch &amp; return board
          </h2>
          <p className="text-sm text-ink-2">
            Reserve the load window, confirm what left, then compare its return
            condition against the outbound check.
          </p>
        </div>

        {failure ? <SupplyFailureBanner error={failure} /> : null}
        {notice ? (
          <p className="banner banner-ok" role="status">
            {notice}
          </p>
        ) : null}
        {host}

        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryTile
                label="Total items"
                value={eventReservations.length}
                hint={`across ${categories.length} ${
                  categories.length === 1 ? "category" : "categories"
                }`}
              />
              <SummaryTile
                label="Out with the event"
                value={checkedOutCount}
                tone="ok"
                hint={
                  eventReservations.length > 0
                    ? `${Math.round(
                        (checkedOutCount / eventReservations.length) * 100,
                      )}% of the sheet`
                    : "nothing checked out"
                }
              />
              <SummaryTile
                label="Staged"
                value={reservedCount}
                tone="warn"
                hint="awaiting checkout"
              />
            </div>

            {loading ? (
              <div className="card p-4">
                <TableSkeleton rows={3} />
              </div>
            ) : sheetRows.length === 0 ? (
              <div className="card empty-state">
                <strong className="text-base text-ink">
                  No equipment reserved
                </strong>
                <span>
                  Add the first item to create this event&apos;s handoff sheet.
                </span>
              </div>
            ) : (
              <EventEquipmentSheet
                rows={sheetRows}
                busy={busy}
                draft={checklistDraft}
                onOpenChecklist={openChecklist}
                onDraftChange={setChecklistDraft}
                onDismissDraft={() => setChecklistDraft(null)}
                onSubmitDraft={submitChecklist}
                onRelease={(row) => void cancel(row)}
              />
            )}

            {showReserveForm ? (
              <EventEquipmentReserveForm
                equipment={equipmentRows}
                selectedEquipmentId={selectedEquipmentId}
                onSelectEquipment={setSelectedEquipmentId}
                defaultStart={defaultStart}
                defaultEnd={defaultEnd}
                busy={busy}
                onSubmit={submitReservation}
                onDismiss={() => setShowReserveForm(false)}
              />
            ) : (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-2 px-5 py-3 font-semibold text-brand hover:border-brand hover:bg-inset"
                onClick={() => setShowReserveForm(true)}
              >
                <PlusIcon />
                Reserve equipment
              </button>
            )}
          </div>

          <EventEquipmentSidebar
            categories={categories}
            statuses={[
              { label: "Staged", count: reservedCount, tone: "pending" },
              { label: "Checked out", count: checkedOutCount, tone: "out" },
              { label: "Returned", count: returnedCount, tone: "done" },
            ]}
            totalItems={eventReservations.length}
            loadOut={startTimes.length > 0 ? Math.min(...startTimes) : null}
            loadBack={endTimes.length > 0 ? Math.max(...endTimes) : null}
            eventStartsAt={startsAt}
            eventEndsAt={endsAt}
          />
        </div>
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: ReactNode;
  tone?: "ok" | "warn";
}) {
  const valueTone =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  const hintTone =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink-3";
  return (
    <div className="card p-5">
      <div className="mb-1 text-sm text-ink-3">{label}</div>
      <div className={`text-3xl font-semibold ${valueTone}`}>{value}</div>
      <div className={`mt-1 text-xs ${hintTone}`}>{hint}</div>
    </div>
  );
}

function statusOrder(status: string): number {
  if (status === "checked_out") return 0;
  if (status === "reserved") return 1;
  if (status === "returned") return 2;
  return 3;
}
