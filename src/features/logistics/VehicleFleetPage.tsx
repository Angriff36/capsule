import { useState, type FormEvent } from "react";
import {
  useCreateVehicle,
  useListVehicle,
  useVehicleReviseDetails,
  useVehicleUpdateOperationalStatus,
} from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";

const OWNERSHIP = ["owned", "leased"] as const;
const OPERATIONAL_STATUSES = [
  "available",
  "in_use",
  "maintenance",
  "out_of_service",
  "retired",
] as const;

type VehicleOwnership = (typeof OWNERSHIP)[number];
type VehicleOperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

type VehicleRow = {
  _id: string;
  version: number;
  make: string;
  model: string;
  registration: string;
  ownership: VehicleOwnership;
  payloadCapacityKg: number;
  operationalStatus: VehicleOperationalStatus;
  statusNote?: string | null;
  deletedAt?: number | null;
};

export function VehicleFleetPage() {
  const vehicles = useListVehicle();
  const createVehicle = useCreateVehicle();
  const reviseDetails = useVehicleReviseDetails();
  const updateOperationalStatus = useVehicleUpdateOperationalStatus();
  const [formMode, setFormMode] = useState<"closed" | "create" | string>(
    "closed",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = ((vehicles ?? []) as VehicleRow[]).filter(
    (vehicle) => vehicle.deletedAt == null,
  );
  const editing = rows.find((vehicle) => vehicle._id === formMode);
  const available = rows.filter(
    (vehicle) => vehicle.operationalStatus === "available",
  );
  const activeCapacity = rows
    .filter((vehicle) => vehicle.operationalStatus !== "retired")
    .reduce((total, vehicle) => total + vehicle.payloadCapacityKg, 0);

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

  const submitVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const details = {
      make: String(data.get("make") ?? "").trim(),
      model: String(data.get("model") ?? "").trim(),
      registration: String(data.get("registration") ?? "").trim(),
      ownership: String(data.get("ownership")) as VehicleOwnership,
      payloadCapacityKg: Number(data.get("payloadCapacityKg")),
    };

    void run(editing ? `edit:${editing._id}` : "register", async () => {
      if (editing) {
        await reviseDetails({
          docId: editing._id,
          version: editing.version,
          ...details,
        });
        setNotice(`${details.registration} updated.`);
      } else {
        await createVehicle({
          ...details,
          operationalStatus: String(
            data.get("operationalStatus"),
          ) as VehicleOperationalStatus,
          statusNote: String(data.get("statusNote") ?? "").trim() || undefined,
        });
        setNotice(`${details.registration} added to the fleet.`);
      }
      form.reset();
      setFormMode("closed");
    });
  };

  const changeStatus = (
    vehicle: VehicleRow,
    operationalStatus: VehicleOperationalStatus,
  ) => {
    if (operationalStatus === vehicle.operationalStatus) return;
    void run(`status:${vehicle._id}`, async () => {
      await updateOperationalStatus({
        docId: vehicle._id,
        version: vehicle.version,
        operationalStatus,
      });
      setNotice(
        `${vehicle.registration} is now ${formatStatusLabel(operationalStatus).toLowerCase()}.`,
      );
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Fleet</p>
          <h1 className="display-title mt-2">Vehicle fleet</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Keep owned and leased delivery vehicles ready for dispatch with
            registration, payload capacity, and current operational status in
            one source catalog.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setFormMode("create")}
          >
            Register vehicle
          </button>
        </div>
      </header>

      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {formMode !== "closed" ? (
        <VehicleForm
          key={editing?._id ?? "create"}
          busy={busy != null}
          vehicle={editing}
          onSubmit={submitVehicle}
          onClose={() => setFormMode("closed")}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Dispatch source record</p>
            <h2>Fleet catalog</h2>
          </div>
          <span>
            {available.length} available · {activeCapacity.toLocaleString()} kg
            active capacity
          </span>
        </div>

        {vehicles === undefined ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="document-empty">
            <p>No vehicles are registered.</p>
            <span>
              Add the first delivery vehicle to make fleet capacity visible to
              dispatch.
            </span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setFormMode("create")}
              >
                Register vehicle
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Registration</th>
                  <th>Ownership</th>
                  <th>Payload capacity</th>
                  <th>Operational status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((vehicle) => (
                  <tr key={vehicle._id}>
                    <td>
                      <strong>
                        {vehicle.make} {vehicle.model}
                      </strong>
                      {vehicle.statusNote ? (
                        <small>{vehicle.statusNote}</small>
                      ) : null}
                    </td>
                    <td>{vehicle.registration}</td>
                    <td>
                      <StatusChip status={vehicle.ownership} />
                    </td>
                    <td className="supply-number">
                      {vehicle.payloadCapacityKg.toLocaleString()} kg
                    </td>
                    <td>
                      <StatusChip status={vehicle.operationalStatus} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        <select
                          className="input"
                          aria-label={`Status for ${vehicle.registration}`}
                          value={vehicle.operationalStatus}
                          disabled={busy != null}
                          onChange={(event) =>
                            changeStatus(
                              vehicle,
                              event.currentTarget
                                .value as VehicleOperationalStatus,
                            )
                          }
                        >
                          {OPERATIONAL_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => setFormMode(vehicle._id)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function VehicleForm({
  busy,
  vehicle,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  vehicle?: VehicleRow;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Fleet record</p>
          <h2>{vehicle ? "Edit vehicle" : "Register vehicle"}</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : vehicle ? "Save changes" : "Register"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Make
          <input
            name="make"
            className="input"
            defaultValue={vehicle?.make}
            placeholder="Ford"
            required
            autoFocus
          />
        </label>
        <label className="field-label">
          Model
          <input
            name="model"
            className="input"
            defaultValue={vehicle?.model}
            placeholder="Transit 350"
            required
          />
        </label>
        <label className="field-label">
          Registration
          <input
            name="registration"
            className="input"
            defaultValue={vehicle?.registration}
            placeholder="CA 8ABC123"
            required
          />
        </label>
        <label className="field-label">
          Ownership
          <select
            name="ownership"
            className="input"
            defaultValue={vehicle?.ownership ?? "owned"}
          >
            {OWNERSHIP.map((ownership) => (
              <option key={ownership} value={ownership}>
                {formatStatusLabel(ownership)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Payload capacity (kg)
          <input
            name="payloadCapacityKg"
            className="input"
            type="number"
            min={1}
            step={1}
            defaultValue={vehicle?.payloadCapacityKg ?? 1}
            required
          />
        </label>
        {!vehicle ? (
          <>
            <label className="field-label">
              Current status
              <select
                name="operationalStatus"
                className="input"
                defaultValue="available"
              >
                {OPERATIONAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Status note
              <input
                name="statusNote"
                className="input"
                placeholder="Optional dispatch note"
              />
            </label>
          </>
        ) : null}
      </div>
    </form>
  );
}
