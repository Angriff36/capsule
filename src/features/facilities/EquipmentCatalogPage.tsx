import { useState, type FormEvent } from "react";
import {
  useCreateEquipment,
  useEquipmentReactivate,
  useEquipmentRecount,
  useEquipmentRetire,
  useEquipmentUpdateCondition,
  useListEquipment,
} from "../../lib/manifest-convex-react";
import { formatMoney } from "../../lib/format";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { EquipmentMaintenanceBoard } from "./EquipmentMaintenanceBoard";

const CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
  "out_of_service",
] as const;

const CATEGORY_SUGGESTIONS = [
  "Cooking",
  "Serving",
  "Holding",
  "Furniture",
  "Linens",
  "Shelter",
  "Transport",
];

export function EquipmentCatalogPage() {
  const equipment = useListEquipment();
  const createEquipment = useCreateEquipment();
  const updateCondition = useEquipmentUpdateCondition();
  const recount = useEquipmentRecount();
  const retire = useEquipmentRetire();
  const reactivate = useEquipmentReactivate();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

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
      await createEquipment({
        name: String(data.get("name") ?? "").trim(),
        assetTag: String(data.get("assetTag") ?? "").trim(),
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

  const rowAction = (item: any, key: string) => {
    void run(`${item._id}:${key}`, async () => {
      const base = { docId: item._id, version: item.version };
      if (key === "recount") {
        const quantity = Number(window.prompt("Actual quantity"));
        if (!Number.isInteger(quantity) || quantity < 0) return;
        await recount({ ...base, actualQuantity: quantity });
      }
      if (key === "condition") {
        const condition = window
          .prompt(`Condition (${CONDITIONS.join(", ")})`, item.condition)
          ?.trim();
        if (!condition || !CONDITIONS.includes(condition as any)) return;
        await updateCondition({
          ...base,
          condition: condition as (typeof CONDITIONS)[number],
        });
      }
      if (key === "retire") {
        const reason = window.prompt("Retirement reason")?.trim();
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
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Register equipment
          </button>
        </div>
      </header>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {showForm ? (
        <EquipmentForm
          busy={busy != null}
          onSubmit={submit}
          onClose={() => setShowForm(false)}
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

function EquipmentForm({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Governed facilities command</p>
          <h2>Register equipment</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : "Register"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Name
          <input name="name" className="input" required autoFocus />
        </label>
        <label className="field-label">
          Asset tag
          <input name="assetTag" className="input" required />
        </label>
        <label className="field-label">
          Category
          <input
            name="category"
            className="input"
            required
            list="equipment-categories"
          />
          <datalist id="equipment-categories">
            {CATEGORY_SUGGESTIONS.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        <label className="field-label">
          Ownership
          <select name="ownership" className="input">
            <option value="owned">Owned</option>
            <option value="rented">Rented</option>
          </select>
        </label>
        <label className="field-label">
          Quantity
          <input
            name="quantity"
            className="input"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            required
          />
        </label>
        <label className="field-label">
          Purchase value (per unit)
          <input
            name="purchaseValue"
            className="input"
            type="number"
            min={0}
            step="any"
            defaultValue={0}
            required
          />
        </label>
        <label className="field-label">
          Condition
          <select name="condition" className="input" defaultValue="good">
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
