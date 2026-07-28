import { StatusChip, TableSkeleton } from "../../ui/primitives";
import type { LogisticsAction } from "./LogisticsLifecyclePolicy";

interface PackListItemRow {
  _id: string;
  description: string;
  dishId?: string | null;
  requiredQuantity: number;
  packedQuantity: number;
  unit: string;
  status: unknown;
  version: number;
}

interface PackListItemTableProps {
  loading: boolean;
  items: PackListItemRow[];
  canAddItems: boolean;
  busy: string | null;
  dishName: (dishId?: string | null) => string | null;
  itemActions: (status: string) => LogisticsAction[];
  onAdd: () => void;
  onInvokeItem: (item: PackListItemRow, key: string) => void;
  canSelectItem: (item: PackListItemRow) => boolean;
  isItemSelected: (id: string) => boolean;
  allSelected: boolean;
  onToggleItem: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  selectableCount: number;
  failedItem?: { id: string; message: string } | null;
}

export function PackListItemTable({
  loading,
  items,
  canAddItems,
  busy,
  dishName,
  itemActions,
  onAdd,
  onInvokeItem,
  canSelectItem,
  isItemSelected,
  allSelected,
  onToggleItem,
  onToggleAll,
  selectableCount,
  failedItem,
}: PackListItemTableProps) {
  if (loading) return <TableSkeleton rows={5} />;
  if (items.length === 0) {
    return (
      <div className="document-empty">
        <p>No items on this load sheet.</p>
        <span>
          Add equipment or dish lines while the list is draft or packing.
        </span>
        {canAddItems ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAdd}
            >
              Add item
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="supply-table-wrap">
      <table className="supply-table">
        <thead>
          <tr>
            <th className="w-8">
              <input
                type="checkbox"
                aria-label="Select all pack items with bulk actions"
                checked={allSelected}
                disabled={busy != null || selectableCount === 0}
                onChange={(event) => onToggleAll(event.target.checked)}
              />
            </th>
            <th>Description</th>
            <th>Required</th>
            <th>Packed</th>
            <th>State</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item._id}>
              <td className="w-8">
                {canSelectItem(item) ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.description}`}
                    checked={isItemSelected(item._id)}
                    disabled={busy != null}
                    onChange={(event) =>
                      onToggleItem(item._id, event.target.checked)
                    }
                  />
                ) : null}
              </td>
              <td>
                <strong>{item.description}</strong>
                {dishName(item.dishId) ? (
                  <small>{dishName(item.dishId)}</small>
                ) : null}
                {failedItem?.id === item._id ? (
                  <small className="block text-danger" role="alert">
                    {failedItem.message}
                  </small>
                ) : null}
              </td>
              <td>
                {item.requiredQuantity} {item.unit}
              </td>
              <td>
                {item.packedQuantity} {item.unit}
              </td>
              <td>
                <StatusChip status={String(item.status)} />
              </td>
              <td>
                <div className="supply-row-actions">
                  {String(item.status) === "listed" ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => onInvokeItem(item, "adjust")}
                    >
                      Adjust qty
                    </button>
                  ) : null}
                  {itemActions(String(item.status)).map((action) => (
                    <button
                      key={action.key}
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => onInvokeItem(item, action.key)}
                    >
                      {busy === `${item._id}:${action.key}`
                        ? "Working…"
                        : action.label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
