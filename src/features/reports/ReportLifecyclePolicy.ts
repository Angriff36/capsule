import {
  SavedReportDefinitionArchiveLifecycle,
  SavedReportDefinitionRestoreLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface ReportAction<Key extends string = string> {
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
  actions: readonly (ReportAction<Key> & { lifecycle: Lifecycle })[],
): ReportAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const REPORT_ACTIONS = [
  {
    key: "archive",
    label: "Archive",
    lifecycle: SavedReportDefinitionArchiveLifecycle,
  },
  {
    key: "restore",
    label: "Restore",
    lifecycle: SavedReportDefinitionRestoreLifecycle,
  },
] as const;

/** Status actions for SavedReportDefinition from generated lifecycle metadata. */
export class ReportLifecyclePolicy {
  reportActions(status: string) {
    return available(status, REPORT_ACTIONS);
  }

  /** Active defined reports may rename / reshare / retune definition. */
  canEditDefinition(status: string, definedAt: number | null | undefined) {
    return status === "active" && definedAt != null;
  }
}
