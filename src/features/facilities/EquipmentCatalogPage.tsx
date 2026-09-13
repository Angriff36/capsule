import { useState, type FormEvent } from "react";
import {
  useCreateEquipment,
  useEquipmentReactivate,
  useEquipmentRecount,
  useEquipmentRetire,
  useEquipmentReviseDetails,
  useEquipmentUpdateCondition,
  useListEquipment,
} from "../../lib/manifest-convex-react";
import { formatMoney } from "../../lib/format";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { EquipmentMaintenanceBoard } from "./EquipmentMaintenanceBoard";
import { FacilitiesWorkspaceNav } from "./FacilitiesWorkspaceNav";
import { EquipmentBulkAddPanel } from "./EquipmentBulkAddPanel";
import { assetTagFor } from "./equipmentPackListParser";
import {
  EQUIPMENT_CONDITIONS as CONDITIONS,
  EquipmentForm,
  type EquipmentDetailRow,
} from "./EquipmentForm";

export function EquipmentCatalogPage() {
  const equipment = useListEquipment();
  const createEquipment = useCreateEquipment();
  const updateCondition = useEquipmentUpdateCondition();
  const recount = useEquipmentRecount();
  const retire = useEquipmentRetire();
  const reactivate = useEquipmentReactivate();
  const reviseDetails = useEquipmentReviseDetails();
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<EquipmentDetailRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt();

  const rows = (equipment ?? []).filter((item) => item.deletedAt == null);
  const activeRows = rows.filter((item) => item.status === "active");
  const ownedValue = activeRows
    .filter((item) => item.ownership === "owned")
    .reduce((sum, item) => sum + item.quantity * item.purchaseValue, 0);

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("register", async () => {
      const name = String(data.get("name") ?? "").trim();
      const typedTag = String(data.get("assetTag") ?? "").trim();
      await createEquipment({
        name,
        assetTag:
          typedTag ||
          assetTagFor(name, new Set(rows.map((item) => item.assetTag))),
        category: String(data.get("category") ?? "").trim(),
        ownership: String(data.get("ownership")) as "owned" | "rented",
        quantity: Number(data.get("quantity")),
        purchaseValue: Number(data.get("purchaseValue")),
        condition: String(data.get("condition")) as (typeof CONDITIONS)[number],
      });
      element.reset();
      setShowForm(false);
    });
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    const item = editing;
    if (!item) return;
    void run("revise", async () => {
      await reviseDetails({
        docId: item._id,
        version: item.version,
        name: String(data.get("name") ?? "").trim(),
        category: String(data.get("category") ?? "").trim(),
        ownership: String(data.get("ownership")) as "owned" | "rented",
        purchaseValue: Number(data.get("purchaseValue")),
        homeLocation: String(data.get("homeLocation") ?? "").trim(),
        currentLocation: String(data.get("currentLocation") ?? "").trim(),
      });
      element.reset();
      setEditing(null);
    });
  };

  const rowAction = (item: any, key: string) => {
    void run(`${item._id}:${key}`, async () => {
      const base = { docId: item._id, version: item.version };
      if (key === "recount") {
        const values = await prompt.askFields({
          title: "Recount equipment",
          description: `Record the actual counted quantity for ${item.name}.`,
          fields: [
            {
              name: "quantity",
              label: "Actual quantity",
              inputType: "number",
              defaultValue: String(item.quantity),
              required: true,
            },
          ],
          confirmLabel: "Save recount",
        });
        if (!values) return;
        const quantity = Number(values.quantity);
        if (!Number.isInteger(quantity) || quantity < 0) return;
        await recount({ ...base, actualQuantity: quantity });
      }
      if (key === "condition") {
        const values = await prompt.askFields({
          title: "Update condition",
          description: `Set the current condition of ${item.name}.`,
          fields: [
            {
              name: "condition",
              label: "Condition",
              defaultValue: String(item.condition),
              options: CONDITIONS.map((condition) => ({
                value: condition,
                label: condition.replace("_", " "),
              })),
              required: true,
            },
          ],
          confirmLabel: "Update condition",
        });
        const condition = values?.condition?.trim();
        if (!condition || !CONDITIONS.includes(condition as any)) return;
        await updateCondition({
          ...base,
          condition: condition as (typeof CONDITIONS)[number],
        });
      }
      if (key === "retire") {
        const reason = (
          await prompt.askReason({
            title: "Retire equipment",
            description: `Retire ${item.name} from the catalog.`,
            label: "Retirement reason",
            confirmLabel: "Retire equipment",
            tone: "danger",
          })
        )?.trim();
        if (!reason) return;
        await retire({ ...base, reason });
      }
      if (key === "reactivate") await reactivate(base);
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Facilities · Equipment</p>
          <h1 className="display-title mt-2">Equipment catalog</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Owned and rented kitchen and service equipment — chafing dishes,
            ovens, tents, linens — with asset tag, quantity, value, and current
            condition. The basis for maintenance and event checkout.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setEditing(null);
              setShowForm(false);
              setShowBulk(true);
            }}
            data-testid="equipment-open-bulk"
          >
            Paste a pack list
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setShowBulk(false);
              setShowForm(true);
            }}
          >
            Register equipment
          </button>
        </div>
      </header>
      <FacilitiesWorkspaceNav />
      {host}
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {bulkNotice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
          role="status"
        >
          {bulkNotice}
        </p>
      ) : null}
      {showBulk ? (
        <EquipmentBulkAddPanel
          existing={rows}
          busy={busy != null}
          register={async (args) => {
            setFailure(null);
            setBusy("bulk");
            try {
              return await createEquipment(args);
            } catch (error) {
              setFailure(error);
              throw error;
            } finally {
              setBusy(null);
            }
          }}
          onDone={(added) =>
            setBulkNotice(
              `${added} item${added === 1 ? "" : "s"} added to the catalog — they can be reserved on any event now.`,
            )
          }
          onClose={() => setShowBulk(false)}
        />
      ) : null}
      {showForm ? (
        <EquipmentForm
          busy={busy != null}
          onSubmit={submit}
          onClose={() => setShowForm(false)}
        />
      ) : null}
      {editing ? (
        <EquipmentForm
          busy={busy != null}
          onSubmit={submitEdit}
          onClose={() => setEditing(null)}
          editItem={editing}
        />
      ) : null}

      <EquipmentMaintenanceBoard equipment={rows as EquipmentRow[]} />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Asset register</p>
            <h2>Catalog</h2>
          </div>
          <span>
            {activeRows.length} active · owned value {formatMoney(ownedValue)}
          </span>
        </div>
        {equipment === undefined ? (
          <TableSkeleton rows={7} />
        ) : rows.length === 0 ? (
          <div className="document-empty">
            <p>No equipment is registered.</p>
            <span>
              Register the first asset — chafers, ovens, tents, linens.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Ownership</th>
                  <th>Qty</th>
                  <th>Purchase value</th>
                  <th>Condition</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.assetTag}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>
                      {item.homeLocation ? (
                        <div>
                          <div>{item.homeLocation}</div>
                          {item.currentLocation &&
                          item.currentLocation !== item.homeLocation ? (
                            <small>now: {item.currentLocation}</small>
                          ) : null}
                        </div>
                      ) : item.currentLocation ? (
                        <small>{item.currentLocation}</small>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusChip status={String(item.ownership)} />
                    </td>
                    <td className="supply-number">{item.quantity}</td>
                    <td className="supply-number">
                      {formatMoney(item.purchaseValue)}
                    </td>
                    <td>
                      <StatusChip status={String(item.condition)} />
                    </td>
                    <td>
                      <StatusChip status={String(item.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {item.status === "active" ? (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => {
                                setShowForm(false);
                                setEditing(item);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => rowAction(item, "recount")}
                            >
                              Recount
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => rowAction(item, "condition")}
                            >
                              Condition
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => rowAction(item, "retire")}
                            >
                              Retire
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => rowAction(item, "reactivate")}
                          >
                            Reactivate
                          </button>
                        )}
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

type EquipmentRow = {
  _id: string;
  name: string;
  assetTag: string;
  condition: string;
  status: string;
  registeredAt?: number | null;
  deletedAt?: number | null;
};
