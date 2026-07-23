import {
  IngredientDemandConfirmLifecycle,
  IngredientDemandFulfillLifecycle,
  IngredientDemandSupersedeLifecycle,
  InventoryReservationConsumeLifecycle,
  InventoryReservationReleaseLifecycle,
  PurchaseNeedCancelLifecycle,
  PurchaseNeedMarkFulfilledLifecycle,
  PurchaseNeedMarkOrderedLifecycle,
  VendorOrderApproveLifecycle,
  VendorOrderCancelLifecycle,
  VendorOrderConfirmLifecycle,
  VendorOrderMarkPartiallyReceivedLifecycle,
  VendorOrderMarkReceivedLifecycle,
  VendorOrderRequestChangesLifecycle,
  VendorOrderSubmitForApprovalLifecycle,
  VendorOrderSubmitLifecycle,
} from "../../generated/manifest-wiring-bindings";

/** Retained for supply integration guard + API; ledger UI does not offer Confirm. */
void IngredientDemandConfirmLifecycle;

export interface SupplyAction<Key extends string = string> {
  key: Key;
  label: string;
}

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function available<Key extends string>(
  status: string,
  actions: readonly (SupplyAction<Key> & { lifecycle: Lifecycle })[],
): SupplyAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

// Confirm theater removed from the ledger UI — Event.approve foreach-creates
// PurchaseNeed. Manifest IngredientDemand.confirm remains for API/manual paths.
const DEMAND_ACTIONS = [
  {
    key: "fulfill",
    label: "Fulfill",
    lifecycle: IngredientDemandFulfillLifecycle,
  },
  {
    key: "supersede",
    label: "Supersede",
    lifecycle: IngredientDemandSupersedeLifecycle,
  },
] as const;

const RESERVATION_ACTIONS = [
  {
    key: "consume",
    label: "Consume",
    lifecycle: InventoryReservationConsumeLifecycle,
  },
  {
    key: "release",
    label: "Release",
    lifecycle: InventoryReservationReleaseLifecycle,
  },
] as const;

const NEED_ACTIONS = [
  {
    key: "markOrdered",
    label: "Mark ordered",
    lifecycle: PurchaseNeedMarkOrderedLifecycle,
  },
  {
    key: "markFulfilled",
    label: "Fulfill",
    lifecycle: PurchaseNeedMarkFulfilledLifecycle,
  },
  { key: "cancel", label: "Cancel", lifecycle: PurchaseNeedCancelLifecycle },
] as const;

const ORDER_ACTIONS = [
  { key: "submit", label: "Submit", lifecycle: VendorOrderSubmitLifecycle },
  {
    key: "submitForApproval",
    label: "Send for approval",
    lifecycle: VendorOrderSubmitForApprovalLifecycle,
  },
  {
    key: "approve",
    label: "Approve & submit",
    lifecycle: VendorOrderApproveLifecycle,
  },
  {
    key: "requestChanges",
    label: "Request changes",
    lifecycle: VendorOrderRequestChangesLifecycle,
  },
  { key: "confirm", label: "Confirm", lifecycle: VendorOrderConfirmLifecycle },
  {
    key: "markPartiallyReceived",
    label: "Mark partial",
    lifecycle: VendorOrderMarkPartiallyReceivedLifecycle,
  },
  {
    key: "markReceived",
    label: "Mark received",
    lifecycle: VendorOrderMarkReceivedLifecycle,
  },
  { key: "cancel", label: "Cancel", lifecycle: VendorOrderCancelLifecycle },
] as const;

export class SupplyLifecyclePolicy {
  demandActions(status: string) {
    return available(status, DEMAND_ACTIONS);
  }

  reservationActions(status: string) {
    return available(status, RESERVATION_ACTIONS);
  }

  purchaseNeedActions(status: string) {
    return available(status, NEED_ACTIONS);
  }

  orderActions(status: string) {
    return available(status, ORDER_ACTIONS);
  }
}
