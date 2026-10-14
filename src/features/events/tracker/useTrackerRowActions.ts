import { useState } from "react";
import {
  useCreateEventVehicleAssignment,
  useCreatePackList,
  useEquipmentReservationCancel,
  useEventClearBinderBuilt,
  useEventMarkBinderBuilt,
  useEventSetEventNumber,
  useEventSetTrackerNotes,
  useEventUpdateSetupNotes,
  useEventVehicleAssignmentClearPreloaded,
  useEventVehicleAssignmentMarkPreloaded,
  useEventVehicleAssignmentRelease,
} from "../../../lib/manifest-convex-react";
import type { Id } from "../../../lib/api";
import { runBulkItems } from "../../../ui/bulk-select";
import { useSuccessToast } from "../../../ui/useSuccessToast";
import { useReserveEquipment } from "../../facilities/equipmentCheckout";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import type { BookingResource } from "./bookingConflicts";
import type { TrackerRowActions } from "./TrackerBoardRow";
import type { TrackerRow } from "./trackerSheet";

/** A thing about to be booked on the row's event. */
export interface BookingCandidate {
  resource: BookingResource;
  key: string;
  quantity?: number;
}

export interface TrackerRowActionsOptions {
  /** The event's booking window: start and end. */
  windowOf: (row: TrackerRow) => { start: number; end: number };
  /**
   * Warn about anything already booked elsewhere. Resolves true to go ahead
   * (nothing clashes, or the office chose to book anyway), false to stop.
   */
  confirmBookings: (
    row: TrackerRow,
    candidates: BookingCandidate[],
  ) => Promise<"clear" | "override" | "stop">;
  /** Ask whether to book over the server's "only N free" answer. */
  confirmOverbook: (message: string) => Promise<boolean>;
}

const OVERBOOK_REASON = "Booked over a double-booking warning on the tracker";

/**
 * Every write the tracker can make, as one action set per row. One row is
 * busy at a time; a rejected write shows the failure and resets the inputs.
 */
export function useTrackerRowActions(options: TrackerRowActionsOptions) {
  const assignRig = useCreateEventVehicleAssignment();
  const releaseRig = useEventVehicleAssignmentRelease();
  const markPreloaded = useEventVehicleAssignmentMarkPreloaded();
  const clearPreloaded = useEventVehicleAssignmentClearPreloaded();
  const markBinderBuilt = useEventMarkBinderBuilt();
  const clearBinderBuilt = useEventClearBinderBuilt();
  const setEventNumber = useEventSetEventNumber();
  const setTrackerNotes = useEventSetTrackerNotes();
  const updateSetupNotes = useEventUpdateSetupNotes();
  const openPackList = useCreatePackList();
  const reserve = useReserveEquipment();
  const cancelHold = useEquipmentReservationCancel();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const { notifySuccess, host: savedToast } = useSuccessToast();

  const run = async (
    row: TrackerRow,
    work: () => Promise<unknown>,
    okMessage: string,
  ) => {
    setFailure(null);
    setBusyId(row.id);
    try {
      await work();
      notifySuccess(okMessage);
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      setResetKey((key) => key + 1);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  /** Warn first; a "stop" resets the picker so it shows the saved value. */
  const guarded = async (
    row: TrackerRow,
    candidates: BookingCandidate[],
    work: () => Promise<unknown>,
    okMessage: string,
  ) => {
    const answer = await options.confirmBookings(row, candidates);
    if (answer === "stop") {
      setResetKey((key) => key + 1);
      return;
    }
    await run(
      row,
      work,
      answer === "override" ? `${okMessage}, over the warning` : okMessage,
    );
  };

  const actionsFor = (row: TrackerRow): TrackerRowActions => ({
    onEventNumber: (next) =>
      void run(
        row,
        () =>
          setEventNumber({
            docId: row.id,
            version: row.version,
            eventNumber: next || undefined,
          }),
        "Event number saved",
      ),
    onBinderBuilt: (built) =>
      void run(
        row,
        () =>
          (built ? markBinderBuilt : clearBinderBuilt)({
            docId: row.id,
            version: row.version,
          }),
        built ? "Binder marked built" : "Binder marked not built",
      ),
    onOpenPackList: () =>
      void run(
        row,
        () => openPackList({ eventId: row.id, name: "Event pack list" }),
        "Pack list opened with the style kit",
      ),
    onAddRig: (first) =>
      void guarded(
        row,
        [first.vehicleId, first.trailerId]
          .filter((id): id is string => !!id)
          .map((key) => ({ resource: "vehicle", key })),
        () => assignRig({ eventId: row.id, ...first }),
        "Attached to the event",
      ),
    // A rig is never patched (the server cannot check a new id on an update).
    // Attach the corrected rig first, then release the old one: a failure in
    // between leaves two visible rigs, never a lost one.
    onChangeRig: (rig, next) =>
      void guarded(
        row,
        (
          [
            ["vehicle", next.vehicleId, rig.vehicleId],
            ["vehicle", next.trailerId, rig.trailerId],
            ["person", next.driverId, rig.driverId],
          ] as const
        )
          .filter(([, picked, before]) => picked != null && picked !== before)
          .map(([resource, picked]) => ({ resource, key: picked as string })),
        async () => {
          if (next.vehicleId != null || next.trailerId != null) {
            await assignRig({
              eventId: row.id,
              vehicleId: next.vehicleId ?? undefined,
              trailerId: next.trailerId ?? undefined,
              driverId: next.driverId ?? undefined,
              notes: rig.notes ?? undefined,
              preloaded: rig.preloaded || undefined,
            });
          }
          await releaseRig({ docId: rig.id, version: rig.version });
        },
        "Saved",
      ),
    onTogglePreloaded: (rig, on) =>
      void run(
        row,
        () =>
          (on ? markPreloaded : clearPreloaded)({
            docId: rig.id,
            version: rig.version,
          }),
        on ? "Marked loaded" : "Marked not loaded",
      ),
    onReleaseRig: (rig) =>
      void run(
        row,
        () => releaseRig({ docId: rig.id, version: rig.version }),
        "Taken off the event",
      ),
    onAddEquipment: (equipmentId, quantity) =>
      void (async () => {
        const answer = await options.confirmBookings(row, [
          { resource: "equipment", key: equipmentId, quantity },
        ]);
        if (answer === "stop") return;
        const { start, end } = options.windowOf(row);
        const book = (overbookReason?: string) =>
          reserve({
            equipmentId: equipmentId as Id<"equipments">,
            eventId: row.id as Id<"events">,
            startsAt: start,
            endsAt: end,
            quantity,
            ...(overbookReason ? { overbookReason } : {}),
          });
        setFailure(null);
        setBusyId(row.id);
        try {
          try {
            await book(answer === "override" ? OVERBOOK_REASON : undefined);
          } catch (error) {
            // Holds the tracker cannot see (another month) can still use
            // the stock up: ask, then book over the count with a reason.
            const message = error instanceof Error ? error.message : "";
            if (
              answer === "override" ||
              !/free for that time/.test(message) ||
              !(await options.confirmOverbook(message))
            )
              throw error;
            await book(OVERBOOK_REASON);
          }
          notifySuccess("Equipment held for the event");
        } catch (error) {
          setFailure(classifyCommandFailure(error));
        } finally {
          setBusyId(null);
        }
      })(),
    onRemoveEquipment: (hold) =>
      void run(
        row,
        () =>
          cancelHold({
            docId: hold.id,
            version: hold.version,
            reason: "Taken off on the event tracker",
          }),
        `${hold.name} taken off the event`,
      ),
    onDecor: (next) =>
      void run(
        row,
        () =>
          updateSetupNotes({
            docId: row.id,
            version: row.version,
            decorKit: next,
          }),
        "Decor saved",
      ),
    onNotes: (next) =>
      void run(
        row,
        () =>
          setTrackerNotes({
            docId: row.id,
            version: row.version,
            notes: next,
          }),
        "Notes saved",
      ),
  });

  // Give every row that has no stored number one: a TPP-era row keeps the
  // number its invoice shows, the rest get the next free number. One at a
  // time: each write moves the workspace's number sequence.
  const numberRows = async (rows: TrackerRow[]) => {
    setFailure(null);
    setBusyId("numbering");
    try {
      // Rows that keep a TPP number go first: they move the sequence up, so
      // the rows that get a new number continue above them.
      const ordered = [...rows].sort(
        (x, y) => Number(y.eventNumber !== "") - Number(x.eventNumber !== ""),
      );
      // A stop part way says how many were numbered; numbered rows leave
      // the list, so pressing again finishes the rest.
      await runBulkItems(ordered, async (row) => {
        await setEventNumber({
          docId: row.id,
          version: row.version,
          eventNumber: row.eventNumber || undefined,
        });
      });
      notifySuccess(
        `${rows.length} ${rows.length === 1 ? "event" : "events"} numbered`,
      );
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusyId(null);
    }
  };

  return {
    actionsFor,
    numberRows,
    busyId,
    failure,
    clearFailure: () => setFailure(null),
    resetKey,
    savedToast,
  };
}
