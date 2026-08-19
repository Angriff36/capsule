import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import {
  useCreateDelivery,
  useDeliveryCancel,
  useDeliveryConfirmDelivery,
  useDeliveryMarkFailed,
  useDeliverySchedule,
  useDeliveryStartTransit,
  useListEvent,
  useListDelivery,
  useListPackList,
  useListPerson,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import {
  useAssignDriver,
  useUnassignDriver,
} from "../facilities/driverAssignment";
import {
  useAssignVehicle,
  useUnassignVehicle,
} from "../facilities/vehicleAssignment";
import { formatStatusLabel } from "../../lib/statusLabels";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { RecordPhotoCapture } from "../attachments/RecordPhotoCapture";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsLifecyclePolicy } from "./LogisticsLifecyclePolicy";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";

const policy = new LogisticsLifecyclePolicy();

const toEpoch = (value: FormDataEntryValue | null) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export function DeliveriesPage() {
  const deliveries = useListDelivery();
  const packLists = useListPackList();
  const events = useListEvent();
  const people = useListPerson();
  const vehicles = useListVehicle();
  const assignDriver = useAssignDriver();
  const unassignDriver = useUnassignDriver();
  const assignVehicle = useAssignVehicle();
  const unassignVehicle = useUnassignVehicle();
  const createDelivery = useCreateDelivery();
  const scheduleDelivery = useDeliverySchedule();
  const startTransit = useDeliveryStartTransit();
  const confirmDelivery = useDeliveryConfirmDelivery();
  const markFailed = useDeliveryMarkFailed();
  const cancel = useDeliveryCancel();
  const [showCreate, setShowCreate] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoDeliveryId, setPhotoDeliveryId] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeRows = (deliveries ?? []).filter((row) => row.deletedAt == null);
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) =>
          String(row.status) !== "cancelled" &&
          String(row.status) !== "delivered" &&
          String(row.status) !== "failed",
      );
  const schedulablePacks = (packLists ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      ["packed", "loaded", "dispatched"].includes(String(row.status)),
  );
  const drivers = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const fleet = (vehicles ?? []).filter(
    (vehicle) =>
      vehicle.deletedAt == null && vehicle.operationalStatus !== "retired",
  );
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const packName = (id: string) =>
    packLists?.find((pack) => pack._id === id)?.name ?? "Unknown pack list";
  const personName = (id?: string | null) => {
    if (!id) return "Unassigned";
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };

  const run = async (key: string, work: () => Promise<void>) => {
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

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const packListId = String(data.get("packListId"));
    const pack = packLists?.find((row) => row._id === packListId);
    if (!pack) {
      setFailure(
        new Error("Select a packed, loaded, or dispatched pack list."),
      );
      return;
    }
    const scheduleArgs = {
      packListId,
      eventId: pack.eventId,
      destination: String(data.get("destination") || "").trim(),
      windowStartsAt: toEpoch(data.get("windowStartsAt")),
      windowEndsAt: toEpoch(data.get("windowEndsAt")),
      driverId: String(data.get("driverId") || "") || undefined,
      notes: String(data.get("notes") || "") || undefined,
    };
    const existing = activeRows.find((row) => row.packListId === packListId);
    void run("create-delivery", async () => {
      if (existing) {
        await scheduleDelivery({
          docId: existing._id,
          version: existing.version,
          ...scheduleArgs,
        });
      } else {
        await createDelivery(scheduleArgs);
      }
      form.reset();
      setShowCreate(false);
      setNotice("Delivery scheduled.");
    });
  };

  const invoke = (
    row: {
      _id: string;
      version: number;
      status: unknown;
    },
    key: string,
  ) => {
    void (async () => {
      if (key === "cancel") {
        const reason = await prompt.askReason({
          ...ReasonCopy.cancelDelivery,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await cancel({ docId: row._id, version: row.version, reason });
          setNotice("Delivery cancelled.");
        });
        return;
      }
      if (key === "markFailed") {
        const reason = await prompt.askReason({
          ...ReasonCopy.failDelivery,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await markFailed({ docId: row._id, version: row.version, reason });
          setNotice("Delivery marked failed.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "startTransit") await startTransit(args);
        if (key === "confirmDelivery") await confirmDelivery(args);
        setNotice(`Delivery updated (${key}).`);
      });
    })();
  };

  const changeDriver = (
    row: { _id: string; version: number; destination: string },
    driverId: string,
  ) => {
    void run(`${row._id}:driver`, async () => {
      if (driverId) {
        await assignDriver({
          deliveryId: row._id as Id<"deliveries">,
          driverId: driverId as Id<"people">,
          version: row.version,
        });
        setNotice(`Driver assigned to ${row.destination}.`);
      } else {
        await unassignDriver({
          deliveryId: row._id as Id<"deliveries">,
          version: row.version,
        });
        setNotice(`Driver cleared from ${row.destination}.`);
      }
    });
  };

  const changeVehicle = (
    row: { _id: string; version: number; destination: string },
    vehicleId: string,
  ) => {
    void run(`${row._id}:vehicle`, async () => {
      if (vehicleId) {
        await assignVehicle({
          deliveryId: row._id as Id<"deliveries">,
          vehicleId: vehicleId as Id<"vehicles">,
          version: row.version,
        });
        setNotice(`Vehicle assigned to ${row.destination}.`);
      } else {
        await unassignVehicle({
          deliveryId: row._id as Id<"deliveries">,
          version: row.version,
        });
        setNotice(`Vehicle cleared from ${row.destination}.`);
      }
    });
  };

  const loading =
    deliveries === undefined ||
    packLists === undefined ||
    events === undefined ||
    people === undefined ||
    vehicles === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Deliveries</p>
          <h1 className="display-title mt-2">Delivery runs</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Schedule a delivery from a packed pack list, assign a driver, then
            start transit and confirm delivery or record failure.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide completed" : "Show completed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close form" : "Schedule delivery"}
          </button>
        </div>
      </header>
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitCreate}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New delivery</p>
              <h2>Schedule delivery</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-delivery" ? "Scheduling…" : "Schedule"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Pack list
              <select name="packListId" className="input" required>
                <option value="">Select pack list</option>
                {schedulablePacks.map((pack) => (
                  <option key={pack._id} value={pack._id}>
                    {pack.name} · {eventName(pack.eventId)} (
                    {formatStatusLabel(String(pack.status))})
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Destination
              <input
                name="destination"
                className="input"
                placeholder="Venue loading dock"
                required
              />
            </label>
            <label className="field-label">
              Window starts
              <input
                name="windowStartsAt"
                className="input"
                type="datetime-local"
                required
              />
            </label>
            <label className="field-label">
              Window ends
              <input
                name="windowEndsAt"
                className="input"
                type="datetime-local"
                required
              />
            </label>
            <label className="field-label">
              Driver
              <select name="driverId" className="input">
                <option value="">Assign later</option>
                {drivers.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
          {schedulablePacks.length === 0 ? (
            <p className="mt-3 text-base text-ink-2">
              No packed pack lists are ready.{" "}
              <Link className="text-link" to="/logistics/packs">
                Finish packing first
              </Link>
              .
            </p>
          ) : null}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Transit</p>
            <h2>Deliveries</h2>
          </div>
          <span>{visibleRows.length} deliveries</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No active deliveries.</p>
            <span>
              Deliveries start from packed lists — open{" "}
              <Link className="text-link" to="/logistics/packs">
                Pack lists
              </Link>{" "}
              to pack an event first, then schedule the run here.
            </span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowCreate(true)}
              >
                Schedule delivery
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Pack / event</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Window</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <Fragment key={row._id}>
                    <tr>
                      <td>
                        <strong>{row.destination}</strong>
                      </td>
                      <td>
                        {packName(row.packListId)}
                        <small>{eventName(row.eventId)}</small>
                      </td>
                      <td>
                        {String(row.status) === "scheduled" ||
                        String(row.status) === "in_transit" ? (
                          <select
                            className="input"
                            aria-label={`Driver for ${row.destination}`}
                            value={row.driverId ?? ""}
                            disabled={busy != null}
                            onChange={(event) =>
                              changeDriver(row, event.currentTarget.value)
                            }
                          >
                            <option value="">No driver</option>
                            {drivers.map((person) => (
                              <option key={person._id} value={person._id}>
                                {person.givenName} {person.familyName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          personName(row.driverId)
                        )}
                      </td>
                      <td>
                        {String(row.status) === "scheduled" ||
                        String(row.status) === "in_transit" ? (
                          <select
                            className="input"
                            aria-label={`Vehicle for ${row.destination}`}
                            value={row.vehicleId ?? ""}
                            disabled={busy != null}
                            onChange={(event) =>
                              changeVehicle(row, event.currentTarget.value)
                            }
                          >
                            <option value="">No vehicle</option>
                            {fleet.map((vehicle) => (
                              <option key={vehicle._id} value={vehicle._id}>
                                {vehicle.registration}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (fleet.find(
                            (vehicle) => vehicle._id === row.vehicleId,
                          )?.registration ?? "—")
                        )}
                      </td>
                      <td>
                        {row.windowStartsAt
                          ? new Date(row.windowStartsAt).toLocaleString()
                          : "—"}{" "}
                        →{" "}
                        {row.windowEndsAt
                          ? new Date(row.windowEndsAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <StatusChip status={String(row.status)} />
                        {row.failureReason ? (
                          <small>{row.failureReason}</small>
                        ) : null}
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          {policy
                            .deliveryActions(String(row.status))
                            .filter(
                              (action) =>
                                action.key !== "startTransit" ||
                                row.driverId != null,
                            )
                            .map((action) => (
                              <button
                                key={action.key}
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() => invoke(row, action.key)}
                              >
                                {busy === `${row._id}:${action.key}`
                                  ? "Working…"
                                  : action.label}
                              </button>
                            ))}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-expanded={photoDeliveryId === row._id}
                            onClick={() =>
                              setPhotoDeliveryId((current) =>
                                current === row._id ? null : row._id,
                              )
                            }
                          >
                            {photoDeliveryId === row._id
                              ? "Hide photos"
                              : "Photos"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {photoDeliveryId === row._id ? (
                      <tr>
                        <td colSpan={7} className="!p-3">
                          <RecordPhotoCapture
                            parentType="delivery"
                            parentId={row._id}
                            title="Proof of delivery"
                            description="Photos captured by the driver appear here for dispatch and office review."
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
