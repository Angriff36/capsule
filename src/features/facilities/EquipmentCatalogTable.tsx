import { formatMoney } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import type { ShelfMark } from "./equipmentShelfMark";

export type CatalogTableRow = {
  _id: string;
  name: string;
  assetTag: string;
  category: string;
  ownership: string;
  quantity: number;
  purchaseValue: number;
  condition: string;
  status: string;
  homeLocation?: string | null;
  currentLocation?: string | null;
  trackingMode?: string | null;
  serialNumber?: string | null;
  countUnit?: string | null;
  replacementCost?: number | null;
  customerPrice?: number | null;
  vendorId?: string | null;
};

export type CatalogRowAction =
  "recount" | "condition" | "move" | "retire" | "reactivate";

/** The equipment register table: what it is, where it lives, what it is worth. */
export function EquipmentCatalogTable<Row extends CatalogTableRow>({
  rows,
  busy,
  vendorNames,
  onEdit,
  onDetails,
  onAction,
  shelfMark,
}: {
  rows: Row[];
  busy: boolean;
  vendorNames: Map<string, string>;
  onEdit: (row: Row) => void;
  onDetails: (row: Row) => void;
  onAction: (row: Row, action: CatalogRowAction) => void;
  /** Ready / Needs service / Missing items, from open problems. */
  shelfMark?: (row: Row) => ShelfMark | null;
}) {
  return (
    <div className="supply-table-wrap">
      <table className="supply-table phone-cards">
        <thead>
          <tr>
            <th>Equipment</th>
            <th>Category</th>
            <th>Location</th>
            <th>Ownership</th>
            <th>Qty</th>
            <th>Value</th>
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
                <small>
                  {item.assetTag}
                  {item.trackingMode === "serialized"
                    ? ` · serial ${item.serialNumber?.trim() || "not set"}`
                    : ""}
                </small>
                {item.ownership === "rented" ? (
                  <small>
                    from{" "}
                    {(item.vendorId && vendorNames.get(item.vendorId)) ||
                      "vendor not set"}
                  </small>
                ) : null}
              </td>
              <td data-label="Category">{item.category}</td>
              <td data-label="Location">
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
              <td className="supply-number" data-label="Qty">
                {item.quantity}
                {item.countUnit && item.countUnit !== "each" ? (
                  <small>{item.countUnit}</small>
                ) : null}
              </td>
              <td className="supply-number" data-label="Value">
                {formatMoney(item.purchaseValue)}
                {item.replacementCost != null ? (
                  <small>replace {formatMoney(item.replacementCost)}</small>
                ) : null}
                {item.customerPrice != null ? (
                  <small>client {formatMoney(item.customerPrice)}</small>
                ) : null}
              </td>
              <td>
                <StatusChip status={String(item.condition)} />
              </td>
              <td>
                <StatusChip status={String(item.status)} />
                {item.status === "active" && shelfMark?.(item) ? (
                  <>
                    {" "}
                    <StatusChip
                      status="shelf"
                      color={shelfMark(item)!.tone}
                      label={shelfMark(item)!.label}
                    />
                  </>
                ) : null}
              </td>
              <td>
                <div className="supply-row-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => onDetails(item)}
                  >
                    Details
                  </button>
                  {item.status === "active" ? (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => onEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => onAction(item, "recount")}
                      >
                        Recount
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => onAction(item, "condition")}
                      >
                        Condition
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => onAction(item, "move")}
                      >
                        Move
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => onAction(item, "retire")}
                      >
                        Retire
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onAction(item, "reactivate")}
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
  );
}
