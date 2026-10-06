import {
  DeliveryCancelLifecycle,
  DeliveryConfirmDeliveryLifecycle,
  DeliveryMarkFailedLifecycle,
  DeliveryStartTransitLifecycle,
  PackListCancelLifecycle,
  PackListDispatchLifecycle,
  PackListItemMarkMissingLifecycle,
  PackListItemMarkPackedLifecycle,
  PackListMarkLoadedLifecycle,
  PackListMarkPackedLifecycle,
  PackListStartPackingLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface LogisticsAction<Key extends string = string> {
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
  actions: readonly (LogisticsAction<Key> & { lifecycle: Lifecycle })[],
): LogisticsAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const PACK_LIST_ACTIONS = [
  {
    key: "startPacking",
    label: "Start packing",
    lifecycle: PackListStartPackingLifecycle,
  },
  {
    key: "markPacked",
    label: "Mark packed",
    lifecycle: PackListMarkPackedLifecycle,
  },
  {
    key: "markLoaded",
    label: "Mark loaded",
    lifecycle: PackListMarkLoadedLifecycle,
  },
  { key: "dispatch", label: "Dispatch", lifecycle: PackListDispatchLifecycle },
  { key: "cancel", label: "Cancel list", lifecycle: PackListCancelLifecycle },
] as const;

const PACK_ITEM_ACTIONS = [
  {
    key: "markPacked",
    label: "Mark packed",
    lifecycle: PackListItemMarkPackedLifecycle,
  },
  {
    key: "markMissing",
    label: "Mark missing",
    lifecycle: PackListItemMarkMissingLifecycle,
  },
] as const;

const DELIVERY_ACTIONS = [
  {
    key: "startTransit",
    label: "Start transit",
    lifecycle: DeliveryStartTransitLifecycle,
  },
  {
    key: "confirmDelivery",
    label: "Confirm delivery",
    lifecycle: DeliveryConfirmDeliveryLifecycle,
  },
  {
    key: "markFailed",
    label: "Mark failed",
    lifecycle: DeliveryMarkFailedLifecycle,
  },
  {
    key: "cancel",
    label: "Cancel delivery",
    lifecycle: DeliveryCancelLifecycle,
  },
] as const;

export class LogisticsLifecyclePolicy {
  packListActions(status: string) {
    // Start packing on a packed or loaded list reopens it.
    return available(status, PACK_LIST_ACTIONS).map((action) =>
      action.key === "startPacking" && status !== "draft"
        ? { ...action, label: "Back to packing" }
        : action,
    );
  }

  packItemActions(status: string) {
    return available(status, PACK_ITEM_ACTIONS);
  }

  deliveryActions(status: string) {
    return available(status, DELIVERY_ACTIONS);
  }
}
