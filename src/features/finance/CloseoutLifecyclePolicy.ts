import { EventCloseoutFinalizeLifecycle } from "../../generated/manifest-wiring-bindings";

export interface CloseoutAction<Key extends string = string> {
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
  capturedAt: unknown,
  actions: readonly (CloseoutAction<Key> & {
    lifecycle: Lifecycle;
    requiresCapture?: boolean;
  })[],
): CloseoutAction<Key>[] {
  return actions
    .filter((action) => {
      if (action.requiresCapture && capturedAt == null) return false;
      return action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      );
    })
    .map(({ key, label }) => ({ key, label }));
}

const CLOSEOUT_ACTIONS = [
  {
    key: "finalize",
    label: "Finalize",
    lifecycle: EventCloseoutFinalizeLifecycle,
    requiresCapture: true,
  },
] as const;

export class CloseoutLifecyclePolicy {
  closeoutActions(status: string, capturedAt: unknown) {
    return available(status, capturedAt, CLOSEOUT_ACTIONS);
  }
}
