import { Link } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import type { ReorderSuggestion } from "./reorderSuggestion";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { vendorContactRoleLabel } from "./vendorContactRoles";
import type { VendorPerformance } from "./vendorPerformance";
import { IngredientCatalogLabel } from "../kitchen/IngredientCatalogLabel";
import type { IngredientCatalogRow } from "../kitchen/IngredientCatalogLabel";

const formatQty = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const policy = new SupplyLifecyclePolicy();

const percent = (value: number) => `${Math.round(value * 100)}%`;

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

type VendorContact = {
  _id: string;
  vendorId: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

export type PurchasingQueueSplitProps = {
  needsLoading: boolean;
  activeNeeds: PurchaseNeed[];
  activeVendors: Vendor[];
  vendorPerformance: Map<string, VendorPerformance>;
  vendorsLoading: boolean;
  busy: string | null;
  canSelectNeed: (need: PurchaseNeed) => boolean;
  isNeedSelected: (id: string) => boolean;
  onToggleNeed: (id: string, on: boolean) => void;
  linkedLine: (need: PurchaseNeed) => VendorOrderLine | undefined;
  reorderSuggestion: (need: PurchaseNeed) => ReorderSuggestion | undefined;
  ingredientName: (id: string) => string;
  ingredients?: readonly IngredientCatalogRow[];
  eventName: (id: string) => string;
  onNeedAction: (need: PurchaseNeed, key: string) => void;
  onOnboardVendor: () => void;
  vendorContacts: VendorContact[];
  onAddContact: (vendorId: string) => void;
};

export function PurchasingQueueSplit({
  needsLoading,
  activeNeeds,
  activeVendors,
  vendorPerformance,
  vendorsLoading,
  busy,
  canSelectNeed,
  isNeedSelected,
  onToggleNeed,
  linkedLine,
  reorderSuggestion,
  ingredientName,
  ingredients,
  eventName,
  onNeedAction,
  onOnboardVendor,
  vendorContacts,
  onAddContact,
}: PurchasingQueueSplitProps) {
  return (
    <div className="supply-split">
      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Open demand</p>
            <h2>Purchase needs</h2>
          </div>
          <span>{formatCountNoun(activeNeeds.length, "need")}</span>
        </div>
        {needsLoading ? (
          <TableSkeleton rows={6} />
        ) : activeNeeds.length === 0 ? (
          <div className="document-empty">
            <p>No purchase needs are open.</p>
            <span>
              Approve an event with calculated component demand to open needs
              here (weekly draft is maintained automatically).
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
              const suggestion = reorderSuggestion(need);
              return (
                <li key={need._id}>
                  {canSelectNeed(need) ? (
                    <label className="flex items-center gap-2 self-start">
                      <input
                        type="checkbox"
                        aria-label={`Select ${ingredientName(need.ingredientId)}`}
                        checked={isNeedSelected(need._id)}
                        disabled={busy != null}
                        onChange={(event) =>
                          onToggleNeed(need._id, event.target.checked)
                        }
                      />
                    </label>
                  ) : null}
                  <div>
                    {ingredients ? (
                      <IngredientCatalogLabel
                        ingredientId={need.ingredientId}
                        ingredients={ingredients}
                        link
                      />
                    ) : (
                      <strong>{ingredientName(need.ingredientId)}</strong>
                    )}
                    <span>
                      {eventName(need.eventId)} · {need.requiredQuantity}{" "}
                      {need.unit}
                    </span>
                    {suggestion && suggestion.suggestedQuantity > 0 ? (
                      <small
                        className="block text-ink-2"
                        data-testid="reorder-suggestion"
                        title={`Demand ${formatQty(suggestion.demand)} + par top-up ${formatQty(
                          suggestion.parShortfall,
                        )}${
                          suggestion.bufferFraction > 0
                            ? ` + ${Math.round(suggestion.bufferFraction * 100)}% variance buffer`
                            : ""
                        }`}
                      >
                        Suggest order: {formatQty(suggestion.suggestedQuantity)}{" "}
                        {need.unit}
                      </small>
                    ) : null}
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
            {activeVendors.map((vendor) => {
              const contacts = vendorContacts.filter(
                (contact) => contact.vendorId === vendor._id,
              );
              const performance = vendorPerformance.get(vendor._id);
              return (
                <li key={vendor._id}>
                  <div>
                    <strong>
                      {vendor.name}
                      {performance?.score != null ? (
                        <span
                          className="ml-2 text-ink-2"
                          title="Rolling 90-day performance: on-time delivery, order fill accuracy, price stability"
                        >
                          {performance.score}/100
                        </span>
                      ) : null}
                    </strong>
                    <span>
                      {vendor.email || vendor.phone || "No contact shown"}
                    </span>
                    {performance?.score != null ? (
                      <small className="block">
                        {[
                          performance.onTimeRate != null
                            ? `On-time ${percent(performance.onTimeRate)}`
                            : null,
                          performance.fillAccuracy != null
                            ? `Fill ${percent(performance.fillAccuracy)}`
                            : null,
                          performance.priceStability != null
                            ? `Price stability ${percent(performance.priceStability)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {` · ${performance.sampleSize} order${performance.sampleSize === 1 ? "" : "s"}`}
                      </small>
                    ) : null}
                    {contacts.map((contact) => (
                      <small key={contact._id} className="block">
                        {vendorContactRoleLabel(contact.role)} · {contact.name}
                        {contact.phone ? ` · ${contact.phone}` : ""}
                        {contact.email ? ` · ${contact.email}` : ""}
                      </small>
                    ))}
                    <button
                      type="button"
                      className="text-link mt-1 self-start"
                      onClick={() => onAddContact(vendor._id)}
                    >
                      + Add contact
                    </button>
                  </div>
                  <StatusChip status={String(vendor.status)} />
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
