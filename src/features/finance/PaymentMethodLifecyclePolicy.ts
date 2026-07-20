import {
  PaymentMethodExpireLifecycle,
  PaymentMethodInvalidateLifecycle,
  PaymentMethodReactivateLifecycle,
  PaymentMethodRemoveLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface PaymentMethodAction<Key extends string = string> {
  key: Key;
  label: string;
}

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function availableFromLifecycle<Key extends string>(
  status: string,
  actions: readonly (PaymentMethodAction<Key> & { lifecycle: Lifecycle })[],
): PaymentMethodAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const STATUS_ACTIONS = [
  { key: "expire", label: "Expire", lifecycle: PaymentMethodExpireLifecycle },
  {
    key: "invalidate",
    label: "Invalidate",
    lifecycle: PaymentMethodInvalidateLifecycle,
  },
  {
    key: "reactivate",
    label: "Reactivate",
    lifecycle: PaymentMethodReactivateLifecycle,
  },
  { key: "remove", label: "Remove", lifecycle: PaymentMethodRemoveLifecycle },
] as const;

/**
 * Derives PaymentMethod row actions from generated lifecycle metadata plus
 * command guards that are not status transitions (default toggle; remove from
 * expired/invalid).
 */
export class PaymentMethodLifecyclePolicy {
  methodActions(status: string, isDefault: boolean): PaymentMethodAction[] {
    const actions: PaymentMethodAction[] = [
      ...availableFromLifecycle(status, STATUS_ACTIONS),
    ];

    // Command allows remove from expired/invalid; lifecycle metadata only proves active→removed.
    if (
      (status === "expired" || status === "invalid") &&
      !actions.some((action) => action.key === "remove")
    ) {
      actions.push({ key: "remove", label: "Remove" });
    }

    if (status === "active") {
      if (isDefault) {
        actions.unshift({ key: "clearDefault", label: "Clear default" });
      } else {
        actions.unshift({ key: "makeDefault", label: "Make default" });
      }
    }

    return actions;
  }
}
