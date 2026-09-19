import { useState } from "react";
import {
  useCreateEventVehicleAssignment,
  useCreatePackList,
  useEventChangeServiceStyle,
  useEventClearBinderBuilt,
  useEventMarkBinderBuilt,
  useEventSetEventNumber,
  useEventVehicleAssignmentClearPreloaded,
  useEventVehicleAssignmentMarkPreloaded,
  useEventVehicleAssignmentRelease,
} from "../../../lib/manifest-convex-react";
import { useSuccessToast } from "../../../ui/useSuccessToast";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import type { TrackerRowActions } from "./TrackerSheetRow";
import type { TrackerRow } from "./trackerSheet";

/**
 * Every write the tracker sheet can make, as one action set per row. One row is
 * busy at a time; a rejected write shows the failure and resets the inputs.
 */
export function useTrackerRowActions() {
  const assignRig = useCreateEventVehicleAssignment();
  const releaseRig = useEventVehicleAssignmentRelease();
  const markPreloaded = useEventVehicleAssignmentMarkPreloaded();
  const clearPreloaded = useEventVehicleAssignmentClearPreloaded();
  const markBinderBuilt = useEventMarkBinderBuilt();
  const clearBinderBuilt = useEventClearBinderBuilt();
  const setEventNumber = useEventSetEventNumber();
  const changeServiceStyle = useEventChangeServiceStyle();
  const openPackList = useCreatePackList();
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
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      setResetKey((key) => key + 1);
    } finally {
      setBusyId(null);
    }
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
    onServiceStyle: (serviceStyleId) =>
      void run(
        row,
        () =>
          changeServiceStyle({
            docId: row.id,
            version: row.version,
            serviceStyleId,
          }),
        "Service style saved. Its kit is on the pack list.",
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
      void run(
        row,
        () => assignRig({ eventId: row.id, ...first }),
        "Attached to the event",
      ),
    // A rig is never patched (the server cannot check a new id on an update).
    // Attach the corrected rig first, then release the old one: a failure in
    // between leaves two visible rigs, never a lost one.
    onChangeRig: (rig, next) =>
      void run(
        row,
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
  });

  return {
    actionsFor,
    busyId,
    failure,
    clearFailure: () => setFailure(null),
    resetKey,
    savedToast,
  };
}
