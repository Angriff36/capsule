import { useState, type FormEvent } from "react";
import {
  useCreateTrailer,
  useCreateVehicle,
  useListTrailer,
  useListVehicle,
  useTrailerReviseDetails,
  useTrailerUpdateInsurance,
  useTrailerUpdateOperationalStatus,
  useTrailerUpdateRegistration,
  useVehicleReviseDetails,
  useVehicleUpdateInsurance,
  useVehicleUpdateOperationalStatus,
  useVehicleUpdateRegistration,
} from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { useActionNotice } from "../../ui/action-result";

const OWNERSHIP = ["owned", "leased"] as const;
const OPERATIONAL_STATUSES = [
  "available",
  "in_use",
  "maintenance",
  "out_of_service",
  "retired",
] as const;

type VehicleOwnership = (typeof OWNERSHIP)[number];
type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

type VehicleRow = {
  _id: string;
  version: number;
  make: string;
  model: string;
  registration: string;
  ownership: VehicleOwnership;
  payloadCapacityKg: number;
  operationalStatus: OperationalStatus;
  statusNote?: string | null;
  deletedAt?: number | null;
  registrationNumber?: string | null;
  registrationExpiresAt?: number | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiresAt?: number | null;
};

type TrailerRow = {
  _id: string;
  version: number;
  make: string;
  model: string;
  registration: string;
  payloadCapacityKg: number;
  operationalStatus: OperationalStatus;
  statusNote?: string | null;
  deletedAt?: number | null;
  registrationNumber?: string | null;
  registrationExpiresAt?: number | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiresAt?: number | null;
};

type ComplianceState = {
  registrationNumber: string;
  registrationExpiresAt: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiresAt: string;
};

function complianceOf(row: {
  registrationNumber?: string | null;
  registrationExpiresAt?: number | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiresAt?: number | null;
}): ComplianceState {
  return {
    registrationNumber: row.registrationNumber ?? "",
    registrationExpiresAt: row.registrationExpiresAt
      ? new Date(row.registrationExpiresAt).toISOString().slice(0, 10)
      : "",
    insuranceProvider: row.insuranceProvider ?? "",
    insurancePolicyNumber: row.insurancePolicyNumber ?? "",
    insuranceExpiresAt: row.insuranceExpiresAt
      ? new Date(row.insuranceExpiresAt).toISOString().slice(0, 10)
      : "",
  };
}

function complianceChips(row: {
  registrationExpiresAt?: number | null;
  insuranceExpiresAt?: number | null;
}) {
  const now = Date.now();
  const chips: Array<{ label: string; ok: boolean; shown: boolean }> = [
    {
      label: "Reg. expiring",
      ok: false,
      shown:
        row.registrationExpiresAt != null &&
        row.registrationExpiresAt > now &&
        row.registrationExpiresAt < now + 30 * 86_400_000,
    },
    {
      label: "Registration expired",
      ok: false,
      shown:
        row.registrationExpiresAt != null && row.registrationExpiresAt <= now,
    },
    {
      label: "Ins. expiring",
      ok: false,
      shown:
        row.insuranceExpiresAt != null &&
        row.insuranceExpiresAt > now &&
        row.insuranceExpiresAt < now + 30 * 86_400_000,
    },
    {
      label: "Insurance expired",
      ok: false,
      shown: row.insuranceExpiresAt != null && row.insuranceExpiresAt <= now,
    },
  ];
  return chips.filter((chip) => chip.shown);
}

function toDateInputValue(value: number | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function VehicleFleetPage() {
  const [assetTab, setAssetTab] = useState<"vehicles" | "trailers">("vehicles");
  const [complianceFor, setComplianceFor] = useState<{
    kind: "vehicle" | "trailer";
    id: string;
    current: ComplianceState;
  } | null>(null);

  const vehicles = useListVehicle() as VehicleRow[] | undefined;
  const trailers = useListTrailer() as TrailerRow[] | undefined;
  const createVehicle = useCreateVehicle();
  const createTrailer = useCreateTrailer();
  const reviseVehicle = useVehicleReviseDetails();
  const reviseTrailer = useTrailerReviseDetails();
  const updateVehicleStatus = useVehicleUpdateOperationalStatus();
  const updateTrailerStatus = useTrailerUpdateOperationalStatus();
  const updateVehicleRegistration = useVehicleUpdateRegistration();
  const updateVehicleInsurance = useVehicleUpdateInsurance();
  const updateTrailerRegistration = useTrailerUpdateRegistration();
  const updateTrailerInsurance = useTrailerUpdateInsurance();
  const [formMode, setFormMode] = useState<"closed" | "create" | string>(
    "closed",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  const vehicleRows = ((vehicles ?? []) as VehicleRow[]).filter(
    (vehicle) => vehicle.deletedAt == null,
  );
  const trailerRows = ((trailers ?? []) as TrailerRow[]).filter(
    (trailer) => trailer.deletedAt == null,
  );
  const editingVehicle = vehicleRows.find(
    (vehicle) => vehicle._id === formMode,
  );
  const editingTrailer = trailerRows.find(
    (trailer) => trailer._id === formMode,
  );
  const availableVehicles = vehicleRows.filter(
    (vehicle) => vehicle.operationalStatus === "available",
  );
  const availableTrailers = trailerRows.filter(
    (trailer) => trailer.operationalStatus === "available",
  );
  const activeVehicleCapacity = vehicleRows
    .filter((vehicle) => vehicle.operationalStatus !== "retired")
    .reduce((total, vehicle) => total + vehicle.payloadCapacityKg, 0);
  const activeTrailerCapacity = trailerRows
    .filter((trailer) => trailer.operationalStatus !== "retired")
    .reduce((total, trailer) => total + trailer.payloadCapacityKg, 0);

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

    void run(
      editingVehicle ? `edit:${editingVehicle._id}` : "register",
      async () => {
        if (editingVehicle) {
          await reviseVehicle({
            docId: editingVehicle._id,
            version: editingVehicle.version,
            ...details,
          });
          setNotice(`${details.registration} updated.`);
        } else {
          await createVehicle({
            ...details,
            operationalStatus: String(
              data.get("operationalStatus"),
            ) as OperationalStatus,
            statusNote:
              String(data.get("statusNote") ?? "").trim() || undefined,
          });
          setNotice(`${details.registration} added to the fleet.`);
        }
        form.reset();
        setFormMode("closed");
      },
    );
  };

  const submitTrailer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const details = {
      make: String(data.get("make") ?? "").trim(),
      model: String(data.get("model") ?? "").trim(),
      registration: String(data.get("registration") ?? "").trim(),
      payloadCapacityKg: Number(data.get("payloadCapacityKg")),
    };

    void run(
      editingTrailer ? `edit:${editingTrailer._id}` : "register",
      async () => {
        if (editingTrailer) {
          await reviseTrailer({
            docId: editingTrailer._id,
            version: editingTrailer.version,
            ...details,
          });
          setNotice(`${details.registration} updated.`);
        } else {
          await createTrailer({
            ...details,
            operationalStatus: String(
              data.get("operationalStatus"),
            ) as OperationalStatus,
            statusNote:
              String(data.get("statusNote") ?? "").trim() || undefined,
          });
          setNotice(`${details.registration} added to the fleet.`);
        }
        form.reset();
        setFormMode("closed");
      },
    );
  };

  const changeVehicleStatus = (
    vehicle: VehicleRow,
    operationalStatus: OperationalStatus,
  ) => {
    if (operationalStatus === vehicle.operationalStatus) return;
    void run(`status:${vehicle._id}`, async () => {
      await updateVehicleStatus({
        docId: vehicle._id,
        version: vehicle.version,
        operationalStatus,
      });
      setNotice(
        `${vehicle.registration} is now ${formatStatusLabel(operationalStatus).toLowerCase()}.`,
      );
    });
  };

  const changeTrailerStatus = (
    trailer: TrailerRow,
    operationalStatus: OperationalStatus,
  ) => {
    if (operationalStatus === trailer.operationalStatus) return;
    void run(`status:${trailer._id}`, async () => {
      await updateTrailerStatus({
        docId: trailer._id,
        version: trailer.version,
        operationalStatus,
      });
      setNotice(
        `${trailer.registration} is now ${formatStatusLabel(operationalStatus).toLowerCase()}.`,
      );
    });
  };

  const submitCompliance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!complianceFor) return;
    const data = new FormData(event.currentTarget);
    const registrationNumber = String(
      data.get("registrationNumber") ?? "",
    ).trim();
    const registrationExpiresAt = String(
      data.get("registrationExpiresAt") ?? "",
    );
    const insuranceProvider = String(
      data.get("insuranceProvider") ?? "",
    ).trim();
    const insurancePolicyNumber = String(
      data.get("insurancePolicyNumber") ?? "",
    ).trim();
    const insuranceExpiresAt = String(data.get("insuranceExpiresAt") ?? "");
    const kind = complianceFor.kind;
    const id = complianceFor.id;
    void run(`compliance:${id}`, async () => {
      const base = { docId: id };
      if (kind === "vehicle") {
        const row = vehicleRows.find((v) => v._id === id);
        if (!row) throw new Error("Vehicle not found");
        if (registrationNumber && registrationExpiresAt) {
          await updateVehicleRegistration({
            ...base,
            version: row.version,
            registrationNumber,
            registrationExpiresAt: new Date(
              `${registrationExpiresAt}T00:00:00Z`,
            ).getTime(),
          });
        }
        if (insuranceProvider && insurancePolicyNumber && insuranceExpiresAt) {
          await updateVehicleInsurance({
            ...base,
            version: row.version,
            insuranceProvider,
            insurancePolicyNumber,
            insuranceExpiresAt: new Date(
              `${insuranceExpiresAt}T00:00:00Z`,
            ).getTime(),
          });
        }
      } else {
        const row = trailerRows.find((t) => t._id === id);
        if (!row) throw new Error("Trailer not found");
        if (registrationNumber && registrationExpiresAt) {
          await updateTrailerRegistration({
            ...base,
            version: row.version,
            registrationNumber,
            registrationExpiresAt: new Date(
              `${registrationExpiresAt}T00:00:00Z`,
            ).getTime(),
          });
        }
        if (insuranceProvider && insurancePolicyNumber && insuranceExpiresAt) {
          await updateTrailerInsurance({
            ...base,
            version: row.version,
            insuranceProvider,
            insurancePolicyNumber,
            insuranceExpiresAt: new Date(
              `${insuranceExpiresAt}T00:00:00Z`,
            ).getTime(),
          });
        }
      }
      setNotice("Compliance details saved.");
      setComplianceFor(null);
    });
  };

  const assetLabel = assetTab === "vehicles" ? "vehicle" : "trailer";
  const editing = editingVehicle ?? editingTrailer;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Fleet</p>
          <h1 className="display-title mt-2">Vehicle fleet</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Keep owned and leased delivery vehicles and trailers ready for
            dispatch with registration, insurance, payload capacity, and current
            operational status in one source catalog.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setFormMode("create")}
          >
            Register {assetLabel}
          </button>
        </div>
      </header>

      <LogisticsWorkspaceNav />

      <div className="supply-row-actions mt-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={assetTab === "vehicles"}
          className={`btn btn-sm ${assetTab === "vehicles" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setAssetTab("vehicles")}
        >
          Vehicles ({vehicleRows.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={assetTab === "trailers"}
          className={`btn btn-sm ${assetTab === "trailers" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setAssetTab("trailers")}
        >
          Trailers ({trailerRows.length})
        </button>
      </div>

      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {formMode !== "closed" ? (
        assetTab === "vehicles" || editingVehicle ? (
          <VehicleForm
            key={editingVehicle?._id ?? "create"}
            busy={busy != null}
            vehicle={editingVehicle}
            onSubmit={submitVehicle}
            onClose={() => setFormMode("closed")}
          />
        ) : (
          <TrailerForm
            key={editingTrailer?._id ?? "create"}
            busy={busy != null}
            trailer={editingTrailer}
            onSubmit={submitTrailer}
            onClose={() => setFormMode("closed")}
          />
        )
      ) : null}

      {complianceFor ? (
        <ComplianceForm
          key={`${complianceFor.kind}:${complianceFor.id}`}
          kind={complianceFor.kind}
          current={complianceFor.current}
          busy={busy != null}
          onSubmit={submitCompliance}
          onClose={() => setComplianceFor(null)}
        />
      ) : null}

      {assetTab === "vehicles" ? (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Dispatch source record</p>
              <h2>Vehicle catalog</h2>
            </div>
            <span>
              {availableVehicles.length} available ·{" "}
              {activeVehicleCapacity.toLocaleString()} kg active capacity
            </span>
          </div>

          {vehicles === undefined ? (
            <TableSkeleton rows={6} />
          ) : vehicleRows.length === 0 ? (
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
                    <th>Compliance</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {vehicleRows.map((vehicle) => (
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
                        <ComplianceChips row={vehicle} />
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          <select
                            className="input"
                            aria-label={`Status for ${vehicle.registration}`}
                            value={vehicle.operationalStatus}
                            disabled={busy != null}
                            onChange={(event) =>
                              changeVehicleStatus(
                                vehicle,
                                event.currentTarget.value as OperationalStatus,
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
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() =>
                              setComplianceFor({
                                kind: "vehicle",
                                id: vehicle._id,
                                current: complianceOf(vehicle),
                              })
                            }
                          >
                            Registration / insurance
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
      ) : (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Dispatch source record</p>
              <h2>Trailer catalog</h2>
            </div>
            <span>
              {availableTrailers.length} available ·{" "}
              {activeTrailerCapacity.toLocaleString()} kg active capacity
            </span>
          </div>

          {trailers === undefined ? (
            <TableSkeleton rows={4} />
          ) : trailerRows.length === 0 ? (
            <div className="document-empty">
              <p>No trailers are registered.</p>
              <span>
                Add the first trailer to make towed capacity visible to
                dispatch.
              </span>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setFormMode("create")}
                >
                  Register trailer
                </button>
              </div>
            </div>
          ) : (
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Trailer</th>
                    <th>Registration</th>
                    <th>Payload capacity</th>
                    <th>Operational status</th>
                    <th>Compliance</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {trailerRows.map((trailer) => (
                    <tr key={trailer._id}>
                      <td>
                        <strong>
                          {trailer.make} {trailer.model}
                        </strong>
                        {trailer.statusNote ? (
                          <small>{trailer.statusNote}</small>
                        ) : null}
                      </td>
                      <td>{trailer.registration}</td>
                      <td className="supply-number">
                        {trailer.payloadCapacityKg.toLocaleString()} kg
                      </td>
                      <td>
                        <StatusChip status={trailer.operationalStatus} />
                      </td>
                      <td>
                        <ComplianceChips row={trailer} />
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          <select
                            className="input"
                            aria-label={`Status for ${trailer.registration}`}
                            value={trailer.operationalStatus}
                            disabled={busy != null}
                            onChange={(event) =>
                              changeTrailerStatus(
                                trailer,
                                event.currentTarget.value as OperationalStatus,
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
                            onClick={() => setFormMode(trailer._id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() =>
                              setComplianceFor({
                                kind: "trailer",
                                id: trailer._id,
                                current: complianceOf(trailer),
                              })
                            }
                          >
                            Registration / insurance
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
      )}
    </div>
  );
}

function ComplianceChips({
  row,
}: {
  row: {
    registrationExpiresAt?: number | null;
    insuranceExpiresAt?: number | null;
  };
}) {
  const chips = complianceChips(row);
  if (chips.length === 0) {
    return <span className="text-ink-3">OK</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger"
        >
          {chip.label}
        </span>
      ))}
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

function TrailerForm({
  busy,
  trailer,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  trailer?: TrailerRow;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Fleet record</p>
          <h2>{trailer ? "Edit trailer" : "Register trailer"}</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : trailer ? "Save changes" : "Register"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Make
          <input
            name="make"
            className="input"
            defaultValue={trailer?.make}
            placeholder="Bri-Mar"
            required
            autoFocus
          />
        </label>
        <label className="field-label">
          Model
          <input
            name="model"
            className="input"
            defaultValue={trailer?.model}
            placeholder="EH-16"
            required
          />
        </label>
        <label className="field-label">
          Registration
          <input
            name="registration"
            className="input"
            defaultValue={trailer?.registration}
            placeholder="CA 4TR987"
            required
          />
        </label>
        <label className="field-label">
          Payload capacity (kg)
          <input
            name="payloadCapacityKg"
            className="input"
            type="number"
            min={1}
            step={1}
            defaultValue={trailer?.payloadCapacityKg ?? 1}
            required
          />
        </label>
        {!trailer ? (
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

function ComplianceForm({
  kind,
  current,
  busy,
  onSubmit,
  onClose,
}: {
  kind: "vehicle" | "trailer";
  current: ComplianceState;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Fleet compliance</p>
          <h2>
            Registration &amp; insurance —{" "}
            {kind === "vehicle" ? "vehicle" : "trailer"}
          </h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save compliance"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Registration number / certificate
          <input
            name="registrationNumber"
            className="input"
            defaultValue={current.registrationNumber}
            placeholder="e.g. 8ABC123"
          />
        </label>
        <label className="field-label">
          Registration expires
          <BoundedDateInput
            name="registrationExpiresAt"
            className="input"
            defaultValue={current.registrationExpiresAt}
          />
        </label>
        <label className="field-label">
          Insurance provider
          <input
            name="insuranceProvider"
            className="input"
            defaultValue={current.insuranceProvider}
            placeholder="e.g. Progressive Commercial"
          />
        </label>
        <label className="field-label">
          Insurance policy number
          <input
            name="insurancePolicyNumber"
            className="input"
            defaultValue={current.insurancePolicyNumber}
            placeholder="Policy number"
          />
        </label>
        <label className="field-label">
          Insurance expires
          <BoundedDateInput
            name="insuranceExpiresAt"
            className="input"
            defaultValue={current.insuranceExpiresAt}
          />
        </label>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        Fill both registration fields or all three insurance fields to save that
        section. Expiry dates must be in the future — use this form when a
        policy renews.
      </p>
    </form>
  );
}
