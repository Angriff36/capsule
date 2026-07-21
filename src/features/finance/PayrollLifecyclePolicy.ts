import {
  PayrollInputFinalizeLifecycle,
  PayrollInputMarkVoidedLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface PayrollAction<Key extends string = string> {
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
  actions: readonly (PayrollAction<Key> & { lifecycle: Lifecycle })[],
): PayrollAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const PAYROLL_ACTIONS = [
  {
    key: "finalize",
    label: "Finalize",
    lifecycle: PayrollInputFinalizeLifecycle,
  },
  {
    key: "void",
    label: "Void",
    lifecycle: PayrollInputMarkVoidedLifecycle,
  },
] as const;

export class PayrollLifecyclePolicy {
  payrollActions(status: string) {
    return available(status, PAYROLL_ACTIONS);
  }
}
