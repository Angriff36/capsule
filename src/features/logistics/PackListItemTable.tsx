import { StatusChip, TableSkeleton } from "../../ui/primitives";
import type { LogisticsAction } from "./LogisticsLifecyclePolicy";
import { CulinaryEntityLink } from "../kitchen/CulinaryEntityLink";
import {
  packingItemDescription,
  packingAssociationMissing,
} from "../../lib/packingDisplay";
import { PackLineWhy } from "./PackLineWhy";
import type { PackLineFacts } from "./packLineExplanation";
import { packReturnSummary } from "./packReturn";

export interface PackListItemRow extends PackLineFacts {
  _id: string;
  description: string;
  note?: string | null;
  sentInstead?: string | null;
  dishId?: string | null;
  requiredQuantity: number;
  packedQuantity: number;
  packedByPersonId?: string | null;
  missingByPersonId?: string | null;
  sentInsteadByPersonId?: string | null;
  checkedQuantity?: number | null;
  checkedByPersonId?: string | null;
  loadedQuantity?: number | null;
  returnedQuantity?: number | null;
  usedQuantity?: number | null;
  lostQuantity?: number | null;
  damagedQuantity?: number | null;
  returnFinding?: string | null;
  returnCountedAt?: number | null;
  returnCountedByPersonId?: string | null;
  unit: string;
  status: unknown;
  version: number;
}

export interface PackListItemTableProps {
  loading: boolean;
  items: PackListItemRow[];
  canAddItems: boolean;
  /** Note and remove stay available until the list is dispatched or cancelled. */
  canEditLines: boolean;
  /** Second check, on-truck and return counts: any list that is not cancelled. */
  canCount?: boolean;
  busy: string | null;
  dishName: (dishId?: string | null) => string | null;
  packedByName: (personId?: string | null) => string | null;
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
  /** View-specific line buttons (the truck-load view adds "Truck"). */
  extraActions?: (
    item: PackListItemRow,
  ) => Array<{ key: string; label: string }>;
}

export function PackListItemTable({
  loading,
  items,
  canAddItems,
  canEditLines,
  busy,
  dishName,
  packedByName,
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
  extraActions,
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
            <tr key={item._id} data-line-id={item._id}>
              <td className="w-8">
                {canSelectItem(item) ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${packingItemDescription(item.description)}`}
                    checked={isItemSelected(item._id)}
                    disabled={busy != null}
                    onChange={(event) =>
                      onToggleItem(item._id, event.target.checked)
                    }
                  />
                ) : null}
              </td>
              <td>
                <strong>{packingItemDescription(item.description)}</strong>
                {item.dishId ? (
                  dishName(item.dishId) ? (
                    <small className="block">
                      For{" "}
                      <CulinaryEntityLink kind="dish" id={item.dishId}>
                        {dishName(item.dishId)}
                      </CulinaryEntityLink>
                    </small>
                  ) : (
                    <small className="block">Dish unavailable</small>
                  )
                ) : packingAssociationMissing(item.description) ? (
                  <small className="block">No link on file</small>
                ) : null}
                {item.note ? (
                  <small className="block">Note: {item.note}</small>
                ) : null}
                {item.sentInstead ? (
                  <small className="block">
                    Sent instead: {item.sentInstead}
                    {packedByName(item.sentInsteadByPersonId)
                      ? ` · ${packedByName(item.sentInsteadByPersonId)}`
                      : ""}
                  </small>
                ) : null}
                {String(item.status) === "missing" &&
                packedByName(item.missingByPersonId) ? (
                  <small className="block">
                    Marked missing by {packedByName(item.missingByPersonId)}
                  </small>
                ) : null}
                <PackLineWhy line={item} />
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
                {packedByName(item.packedByPersonId) ? (
                  <small className="block">
                    {packedByName(item.packedByPersonId)}
                  </small>
                ) : null}
                {item.checkedQuantity != null ? (
                  <small className="block">
                    Checked {item.checkedQuantity}
                    {packedByName(item.checkedByPersonId)
                      ? ` · ${packedByName(item.checkedByPersonId)}`
                      : ""}
                  </small>
                ) : null}
                {item.loadedQuantity != null ? (
                  <small className="block">
                    On truck {item.loadedQuantity}
                  </small>
                ) : null}
                {item.returnCountedAt != null ? (
                  <small className="block">
                    {packReturnSummary(item)}
                    {packedByName(item.returnCountedByPersonId)
                      ? ` · ${packedByName(item.returnCountedByPersonId)}`
                      : ""}
                  </small>
                ) : null}
                {item.returnFinding ? (
                  <small className="block">Found: {item.returnFinding}</small>
                ) : null}
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
                  {(extraActions?.(item) ?? []).map((action) => (
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
                  {canEditLines ? (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onInvokeItem(item, "sentInstead")}
                      >
                        {item.sentInstead
                          ? "Edit sent instead"
                          : "Sent instead"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onInvokeItem(item, "note")}
                      >
                        {item.note ? "Edit note" : "Note"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          onInvokeItem(
                            item,
                            item.excludedAt != null ? "putBack" : "leaveOff",
                          )
                        }
                      >
                        {item.excludedAt != null ? "Put back" : "Leave off"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onInvokeItem(item, "remove")}
                      >
                        {busy === `${item._id}:remove` ? "Working…" : "Remove"}
                      </button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
