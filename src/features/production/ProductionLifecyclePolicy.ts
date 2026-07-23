import {
  PrepTaskCancelLifecycle,
  PrepTaskClaimLifecycle,
  PrepTaskCompleteLifecycle,
  PrepTaskMarkBlockedLifecycle,
  PrepTaskReleaseLifecycle,
  PrepTaskStartLifecycle,
  PrepTaskUnblockLifecycle,
  QualityCheckFailLifecycle,
  QualityCheckPassLifecycle,
  QualityCheckReinspectLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface ProductionAction<Key extends string = string> {
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
  actions: readonly (ProductionAction<Key> & { lifecycle: Lifecycle })[],
): ProductionAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const PREP_ACTIONS = [
  { key: "claim", label: "Claim", lifecycle: PrepTaskClaimLifecycle },
  { key: "release", label: "Release", lifecycle: PrepTaskReleaseLifecycle },
  { key: "start", label: "Start", lifecycle: PrepTaskStartLifecycle },
  { key: "complete", label: "Complete", lifecycle: PrepTaskCompleteLifecycle },
  {
    key: "markBlocked",
    label: "Block",
    lifecycle: PrepTaskMarkBlockedLifecycle,
  },
  { key: "unblock", label: "Unblock", lifecycle: PrepTaskUnblockLifecycle },
  { key: "cancel", label: "Cancel", lifecycle: PrepTaskCancelLifecycle },
] as const;

const QUALITY_ACTIONS = [
  { key: "pass", label: "Pass", lifecycle: QualityCheckPassLifecycle },
  { key: "fail", label: "Fail", lifecycle: QualityCheckFailLifecycle },
  {
    key: "reinspect",
    label: "Reinspect",
    lifecycle: QualityCheckReinspectLifecycle,
  },
] as const;

function nextStatus(
  key: string,
  from: string,
  actions: readonly { key: string; lifecycle: Lifecycle }[],
): string | undefined {
  const action = actions.find((entry) => entry.key === key);
  return action?.lifecycle.find(
    (transition) => transition.proven && transition.from === from,
  )?.to;
}

export class ProductionLifecyclePolicy {
  prepActions(status: string) {
    return available(status, PREP_ACTIONS);
  }

  qualityActions(status: string) {
    return available(status, QUALITY_ACTIONS);
  }

  /** Proven target status for a prep transition, for optimistic UI. */
  prepNextStatus(key: string, from: string) {
    return nextStatus(key, from, PREP_ACTIONS);
  }

  /** Proven target status for a quality transition, for optimistic UI. */
  qualityNextStatus(key: string, from: string) {
    return nextStatus(key, from, QUALITY_ACTIONS);
  }
}
