import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useListStorageLocation,
  useStorageLocationActivate,
  useStorageLocationDeactivate,
  useStorageLocationReviseDetails,
} from "../../lib/manifest-convex-react";
import { formatCountNoun } from "../../lib/format";
import { useActionPrompt } from "../../ui/action-prompt";
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";

/** Blank clears the saved value; every field is sent on every save. */
const textOrClear = (raw: string | undefined) => raw?.trim() || undefined;

/** Blank clears the value; a non-numeric entry aborts the save. */
const decimalOrClear = (raw: string | undefined) => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
};

const temperatureLabel = (location: {
  minTemperature?: number | null;
  maxTemperature?: number | null;
  temperatureUnit?: string | null;
}) => {
  const unit = location.temperatureUnit?.trim() || "";
  const min = location.minTemperature;
  const max = location.maxTemperature;
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min} – ${max} ${unit}`.trim();
  return `${min ?? max} ${unit}`.trim();
};

export function StorageLocationsPage() {
  const locations = useListStorageLocation();
  const reviseDetails = useStorageLocationReviseDetails();
  const deactivate = useStorageLocationDeactivate();
  const activate = useStorageLocationActivate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const rows = [...(locations ?? [])]
    .filter((location) => location.deletedAt == null)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const editAction = (location: any) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Edit storage location",
        description:
          "Every field is saved together. Leave a field blank to clear it.",
        fields: [
          {
            name: "name",
            label: "Name",
            defaultValue: String(location.name ?? ""),
            required: true,
          },
          {
            name: "locationType",
            label: "Location type",
            defaultValue: String(location.locationType ?? ""),
            placeholder: "e.g. walk-in, freezer, dry storage",
          },
          {
            name: "temperatureZone",
            label: "Temperature zone",
            defaultValue: String(location.temperatureZone ?? ""),
            placeholder: "e.g. chilled, frozen, ambient",
          },
          {
            name: "minTemperature",
            label: "Minimum temperature",
            defaultValue:
              location.minTemperature == null
                ? ""
                : String(location.minTemperature),
            inputType: "number",
          },
          {
            name: "maxTemperature",
            label: "Maximum temperature",
            defaultValue:
              location.maxTemperature == null
                ? ""
                : String(location.maxTemperature),
            inputType: "number",
          },
          {
            name: "temperatureUnit",
            label: "Temperature unit",
            defaultValue: String(location.temperatureUnit ?? ""),
            placeholder: "F or C",
            helper: "Left blank, the saved unit is kept.",
          },
        ],
        confirmLabel: "Save location",
      });
      if (!values) return;
      const name = (values.name ?? "").trim();
      if (!name) return;
      const minTemperature = decimalOrClear(values.minTemperature);
      if (minTemperature === undefined) return;
      const maxTemperature = decimalOrClear(values.maxTemperature);
      if (maxTemperature === undefined) return;
      void run(`${location._id}:edit`, async () => {
        await reviseDetails({
          docId: location._id,
          version: location.version,
          name,
          locationType: textOrClear(values.locationType),
          temperatureZone: textOrClear(values.temperatureZone),
          minTemperature: minTemperature ?? undefined,
          maxTemperature: maxTemperature ?? undefined,
          temperatureUnit: textOrClear(values.temperatureUnit),
        });
      });
    })();
  };

  const deactivateAction = (location: any) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Deactivate storage location",
          description: `${location.name} stops being offered when stock is opened, received, or moved.`,
          label: "Deactivation reason",
          confirmLabel: "Deactivate location",
          cancelLabel: "Keep active",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      void run(`${location._id}:deactivate`, async () => {
        await deactivate({
          docId: location._id,
          version: location.version,
          reason,
        });
      });
    })();
  };

  const activateAction = (location: any) => {
    void run(`${location._id}:activate`, async () => {
      await activate({ docId: location._id, version: location.version });
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Storage locations"
        lead="Where stock is held, and which places stock may still be moved into."
        actions={
          <Link to="/inventory/stock" className="btn btn-primary">
            Register a location
          </Link>
        }
      />
      <InventoryWorkspaceNav />
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Inventory · Places</p>
            <h2>Every storage place</h2>
          </div>
          <span>{formatCountNoun(rows.length, "location")}</span>
        </div>
        {locations === undefined ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <div className="document-empty">
            <p>No storage location is registered.</p>
            <span>
              Register the first walk-in, freezer, or dry store on the stock
              book, then manage it here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Zone</th>
                  <th>Temperature</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((location) => {
                  const active = String(location.status) === "active";
                  const registered = location.registeredAt != null;
                  return (
                    <tr key={location._id}>
                      <td>
                        <strong>{location.name}</strong>
                      </td>
                      <td>{location.locationType || "—"}</td>
                      <td>{location.temperatureZone || "—"}</td>
                      <td>{temperatureLabel(location)}</td>
                      <td>
                        <StatusChip status={String(location.status)} />
                        {location.deactivationReason ? (
                          <small>{location.deactivationReason}</small>
                        ) : null}
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null || !active || !registered}
                            title={
                              !registered
                                ? "This location is not registered yet."
                                : !active
                                  ? "Activate the location before editing it."
                                  : undefined
                            }
                            onClick={() => editAction(location)}
                          >
                            {busy === `${location._id}:edit`
                              ? "Working…"
                              : "Edit"}
                          </button>
                          {active ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null || !registered}
                              title={
                                registered
                                  ? undefined
                                  : "This location is not registered yet."
                              }
                              onClick={() => deactivateAction(location)}
                            >
                              {busy === `${location._id}:deactivate`
                                ? "Working…"
                                : "Deactivate"}
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => activateAction(location)}
                            >
                              {busy === `${location._id}:activate`
                                ? "Working…"
                                : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
