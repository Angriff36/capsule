import {
  MenuArchiveLifecycle,
  MenuMarkPublishedLifecycle,
  MenuRestoreLifecycle,
  MenuUnpublishLifecycle,
  ComponentPublishVersionLifecycle,
  ComponentRetractLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface CulinaryAction<Key extends string = string> {
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
  actions: readonly (CulinaryAction<Key> & { lifecycle: Lifecycle })[],
): CulinaryAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const COMPONENT_PUBLISH_ACTIONS = [
  {
    key: "publishVersion",
    label: "Publish",
    lifecycle: ComponentPublishVersionLifecycle,
  },
  {
    key: "retract",
    label: "Return to draft",
    lifecycle: ComponentRetractLifecycle,
  },
] as const;

const MENU_ACTIONS = [
  {
    key: "markPublished",
    label: "Publish",
    lifecycle: MenuMarkPublishedLifecycle,
  },
  {
    key: "unpublish",
    label: "Return to draft",
    lifecycle: MenuUnpublishLifecycle,
  },
  { key: "archive", label: "Archive", lifecycle: MenuArchiveLifecycle },
  { key: "restore", label: "Restore draft", lifecycle: MenuRestoreLifecycle },
] as const;

/**
 * Kitchen lifecycle buttons. Delete is always one click (purge) when the row
 * is still visible — no restore-first, no reason prompt.
 */
export class CulinaryLifecyclePolicy {
  componentActions(status: string, deletedAt?: number | null) {
    const actions: CulinaryAction[] = [
      ...available(status, COMPONENT_PUBLISH_ACTIONS),
    ];
    if (deletedAt == null) {
      actions.push({ key: "purge", label: "Delete" });
    }
    return actions;
  }

  ingredientActions(
    status: string,
    deletedAt?: number | null,
    options?: { includeRestore?: boolean },
  ) {
    const actions: CulinaryAction[] = [];
    if (deletedAt == null) {
      actions.push({ key: "purge", label: "Delete" });
    } else if (options?.includeRestore && status === "discontinued") {
      actions.push({ key: "reinstate", label: "Restore" });
    }
    return actions;
  }

  dishActions(
    status: string,
    deletedAt?: number | null,
    options?: { includeRestore?: boolean },
  ) {
    const actions: CulinaryAction[] = [];
    if (deletedAt == null) {
      actions.push({ key: "purge", label: "Delete" });
    } else if (options?.includeRestore && status === "retired") {
      actions.push({ key: "reinstate", label: "Restore" });
    }
    return actions;
  }

  menuActions(status: string) {
    return available(status, MENU_ACTIONS);
  }
}
