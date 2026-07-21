import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";

const policy = new SupplyLifecyclePolicy();

type PurchaseNeed = {
  _id: string;
  ingredientId: string;
  eventId: string;
  requiredQuantity: number | string;
  unit: string;
  status: string;
  ingredientDemandId: string;
  version: number;
};

type VendorOrderLine = {
  _id: string;
  vendorOrderId: string;
  ingredientDemandId?: string | null;
  status: string;
  deletedAt?: number | null;
};

type Vendor = {
  _id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
};

export type PurchasingQueueSplitProps = {
  needsLoading: boolean;
  activeNeeds: PurchaseNeed[];
  activeVendors: Vendor[];
  vendorsLoading: boolean;
  selectedNeedIds: Set<string>;
  setSelectedNeedIds: Dispatch<SetStateAction<Set<string>>>;
  busy: string | null;
  openCancellableNeeds: PurchaseNeed[];
  needCanCancel: (need: PurchaseNeed) => boolean;
  linkedLine: (need: PurchaseNeed) => VendorOrderLine | undefined;
  ingredientName: (id: string) => string;
  eventName: (id: string) => string;
  onNeedAction: (need: PurchaseNeed, key: string) => void;
  onBulkCancel: () => void;
  onOnboardVendor: () => void;
};

export function PurchasingQueueSplit({
  needsLoading,
  activeNeeds,
  activeVendors,
  vendorsLoading,
  selectedNeedIds,
  setSelectedNeedIds,
  busy,
  openCancellableNeeds,
  needCanCancel,
  linkedLine,
  ingredientName,
  eventName,
  onNeedAction,
  onBulkCancel,
  onOnboardVendor,
}: PurchasingQueueSplitProps) {
  return (
    <div className="supply-split">
      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Open demand</p>
            <h2>Purchase needs</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {activeNeeds.some(needCanCancel) ? (
              <>
                <label className="flex items-center gap-2 text-[12px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={
                      openCancellableNeeds.length > 0 &&
                      openCancellableNeeds.every((need) =>
                        selectedNeedIds.has(need._id),
                      )
                    }
                    disabled={busy != null || openCancellableNeeds.length === 0}
                    onChange={(event) => {
                      setSelectedNeedIds(
                        event.target.checked
                          ? new Set(
                              openCancellableNeeds.map((need) => need._id),
                            )
                          : new Set(),
                      );
                    }}
                  />
                  Select all visible open
                </label>
                {selectedNeedIds.size ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy != null}
                    onClick={onBulkCancel}
                  >
                    {busy === "bulk-cancel-needs"
                      ? "Cancelling…"
                      : `Cancel ${selectedNeedIds.size} selected`}
                  </button>
                ) : null}
              </>
            ) : null}
            <span>{activeNeeds.length} needs</span>
          </div>
        </div>
        {needsLoading ? (
          <TableSkeleton rows={6} />
        ) : activeNeeds.length === 0 ? (
          <div className="document-empty">
            <p>No purchase needs are open.</p>
            <span>
              Approve an event with calculated recipe demand to open needs here
              (weekly draft is maintained automatically).
            </span>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Events
              </Link>
              <Link to="/inventory/demand" className="btn btn-ghost btn-sm">
                Demand ledger
              </Link>
            </div>
          </div>
        ) : (
          <ul className="purchase-queue">
            {activeNeeds.map((need) => {
              const line = linkedLine(need);
              const cancellable = needCanCancel(need);
              return (
                <li key={need._id}>
                  {cancellable ? (
                    <label className="flex items-center gap-2 self-start">
                      <input
                        type="checkbox"
                        checked={selectedNeedIds.has(need._id)}
                        disabled={busy != null}
                        onChange={(event) => {
                          setSelectedNeedIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(need._id);
                            else next.delete(need._id);
                            return next;
                          });
                        }}
                      />
                    </label>
                  ) : null}
                  <div>
                    <strong>{ingredientName(need.ingredientId)}</strong>
                    <span>
                      {eventName(need.eventId)} · {need.requiredQuantity}{" "}
                      {need.unit}
                    </span>
                  </div>
                  <StatusChip status={String(need.status)} />
                  <div className="supply-row-actions">
                    {policy
                      .purchaseNeedActions(String(need.status))
                      .map((action) => (
                        <button
                          key={action.key}
                          className="btn btn-ghost btn-sm"
                          disabled={
                            busy != null ||
                            (action.key === "markOrdered" && !line)
                          }
                          title={
                            action.key === "markOrdered" && !line
                              ? "Add an order line linked to this demand first"
                              : undefined
                          }
                          onClick={() => onNeedAction(need, action.key)}
                        >
                          {busy === `${need._id}:${action.key}`
                            ? "Working…"
                            : action.label}
                        </button>
                      ))}
                  </div>
                  {line ? (
                    <small>
                      Line {line._id.slice(-8)} · order{" "}
                      {line.vendorOrderId.slice(-8)}
                    </small>
                  ) : (
                    <small>No linked order line</small>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <aside className="vendor-index">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Supplier book</p>
            <h2>Vendors</h2>
          </div>
          <span>{activeVendors.length}</span>
        </div>
        {vendorsLoading ? (
          <TableSkeleton rows={4} />
        ) : activeVendors.length === 0 ? (
          <div className="document-empty">
            <p>No vendors onboarded.</p>
            <span>Add a supplier before opening an order folio.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOnboardVendor}
              >
                Onboard vendor
              </button>
            </div>
          </div>
        ) : (
          <ul>
            {activeVendors.map((vendor) => (
              <li key={vendor._id}>
                <div>
                  <strong>{vendor.name}</strong>
                  <span>
                    {vendor.email || vendor.phone || "No contact shown"}
                  </span>
                </div>
                <StatusChip status={String(vendor.status)} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
