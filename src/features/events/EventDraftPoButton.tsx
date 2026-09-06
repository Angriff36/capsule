import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendorOrder,
  useCreateVendorOrderLine,
  useListIngredient,
  useListIngredientDemand,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
  useListWeeklyPurchasingConfig,
} from "../../lib/manifest-convex-react";
import { EventDraftPoCoordinator } from "./EventDraftPoCoordinator";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import { useDraftPurchaseOrder } from "../../lib/safeMaterialization";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";

type Props = {
  eventId: string;
  eventStage: string;
};

export function EventDraftPoButton({ eventId, eventStage }: Props) {
  const demands = useListIngredientDemand();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const ingredients = useListIngredient();
  const vendors = useListVendor();
  const configs = useListWeeklyPurchasingConfig();
  const createOrder = useCreateVendorOrder();
  const createLine = useCreateVendorOrderLine();
  const materializeDraft = useDraftPurchaseOrder();
  const [busy, setBusy] = useState(false);
  const { notice, setNotice } = useActionNotice();
  const { error, setError } = useActionFailure();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState("");

  const activeVendors = useMemo(
    () =>
      (vendors ?? []).filter(
        (vendor) =>
          vendor.deletedAt == null && String(vendor.status) === "active",
      ),
    [vendors],
  );
  const defaultVendorId =
    (configs ?? []).find((row) => row.deletedAt == null)?.defaultVendorId ?? "";
  const chosenVendorId =
    vendorId || defaultVendorId || activeVendors[0]?._id || "";

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setOrderId(null);
    try {
      const result = await new EventDraftPoCoordinator({
        createOrder: async (input) => {
          const created = (await createOrder(input)) as { docId: string };
          return { docId: created.docId };
        },
        createLine: async (input) => {
          const created = (await createLine(input)) as { docId: string };
          return { docId: created.docId };
        },
        materialize: async (input) => {
          const scope = `event-draft-po:${eventId}:${chosenVendorId}`;
          const pending = beginPendingOperation(scope, input);
          const created = await materializeDraft({
            ...pending.payload,
            operationKey: pending.key,
          } as never);
          confirmPendingOperation(scope);
          return created;
        },
      }).draftFromNeeds({
        eventId,
        eventStage,
        vendorId: chosenVendorId,
        demands: (demands ?? []).map((row) => ({
          id: row._id,
          eventId: row.eventId,
          ingredientId: row.ingredientId,
          requiredQuantity: Number(row.requiredQuantity),
          unit: String(row.unit),
          status: String(row.status),
          deletedAt: row.deletedAt,
        })),
        orders: (orders ?? []).map((row) => ({
          id: row._id,
          eventId: row.eventId,
          vendorId: row.vendorId,
          status: String(row.status),
          deletedAt: row.deletedAt,
        })),
        lines: (lines ?? []).map((row) => ({
          id: row._id,
          vendorOrderId: row.vendorOrderId,
          ingredientId: row.ingredientId,
          ingredientDemandId: row.ingredientDemandId,
          status: row.status != null ? String(row.status) : null,
          deletedAt: row.deletedAt,
        })),
        ingredients: (ingredients ?? []).map((row) => ({
          id: row._id,
          unit: String(row.unit),
          costPerUnit: Number(row.costPerUnit),
          deletedAt: row.deletedAt,
        })),
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setOrderId(result.vendorOrderId);
      setNotice(
        result.recovered
          ? `Recovered the already-saved draft PO with ${result.lineCount} line${result.lineCount === 1 ? "" : "s"}; no duplicate order or lines were added.`
          : result.createdOrder
            ? `Drafted a PO with ${result.lineCount} line${result.lineCount === 1 ? "" : "s"} from this event's needs.`
            : `Added ${result.lineCount} line${result.lineCount === 1 ? "" : "s"} to the existing draft PO.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not draft a PO from this event's needs.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="draft-po-from-event-needs">
      <div className="flex flex-wrap items-end gap-2">
        <label className="field-label">
          Vendor
          <select
            className="field-input w-48"
            value={chosenVendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="">Select a vendor…</option>
            {activeVendors.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !chosenVendorId}
          onClick={() => void run()}
        >
          {busy ? "Drafting…" : "Draft PO from this event's needs"}
        </button>
      </div>
      <p className="text-sm text-ink-3">
        Planning events can draft a PO from current needs. Approving the event
        is not required.
      </p>
      {error ? (
        <p className="text-base text-danger" role="status">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}{" "}
          {orderId ? (
            <Link className="underline" to={`/inventory/orders/${orderId}`}>
              Open draft PO
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
