import { useActionPrompt } from "../../ui/action-prompt";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import type { KitchenSection } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

type Commands = {
  purgeIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  purgeDish: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateDish: (args: Record<string, unknown>) => Promise<unknown>;
  purgeComponent?: (args: Record<string, unknown>) => Promise<unknown>;
  publishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  unpublishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  archiveMenu: (args: Record<string, unknown>) => Promise<unknown>;
  restoreMenu: (args: Record<string, unknown>) => Promise<unknown>;
};

type Props = {
  section: KitchenSection;
  item: {
    _id: string;
    version: number;
    status: string;
    deletedAt?: number | null;
  };
  busy: string | null;
  showHidden?: boolean;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  commands: Commands;
};

export function KitchenCatalogLifecycleButtons({
  section,
  item,
  busy,
  showHidden = false,
  run,
  commands,
}: Props) {
  const { prompt, host } = useActionPrompt();
  const deletedAt = item.deletedAt ?? null;
  const actions =
    section === "ingredients"
      ? policy.ingredientActions(String(item.status), deletedAt, {
          includeRestore: showHidden,
        })
      : section === "dishes"
        ? policy.dishActions(String(item.status), deletedAt, {
            includeRestore: showHidden,
          })
        : section === "components"
          ? deletedAt == null
            ? [{ key: "purge", label: "Delete" }]
            : []
          : policy.menuActions(String(item.status));
  if (!actions.length) return null;

  const invoke = (key: string) => {
    void (async () => {
      const needsReason = key === "unpublish" || key === "archive";
      const reason = needsReason
        ? (
            await prompt.askReason({
              title: key === "unpublish" ? "Unpublish menu" : "Archive menu",
              description:
                key === "unpublish"
                  ? "Take this menu back off the published list."
                  : "Archive this menu.",
              label: "Reason",
              confirmLabel: key === "unpublish" ? "Unpublish" : "Archive",
            })
          )?.trim()
        : undefined;
      if (needsReason && !reason) return;

      await run(`${item._id}:${key}`, async () => {
        const args = { docId: item._id, version: item.version };
        if (key === "purge") {
          if (section === "ingredients") {
            await commands.purgeIngredient(args);
          } else if (section === "components") {
            await commands.purgeComponent?.(args);
          } else {
            await commands.purgeDish(args);
          }
        }
        if (key === "reinstate") {
          await (section === "ingredients"
            ? commands.reinstateIngredient(args)
            : commands.reinstateDish(args));
        }
        if (key === "markPublished") await commands.publishMenu(args);
        if (key === "unpublish") {
          await commands.unpublishMenu({ ...args, reason });
        }
        if (key === "archive") await commands.archiveMenu({ ...args, reason });
        if (key === "restore") await commands.restoreMenu(args);
      });
    })();
  };

  return (
    <div className="culinary-row-actions">
      {host}
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy != null}
          onClick={() => invoke(action.key)}
        >
          {busy === `${item._id}:${action.key}` ? "Working…" : action.label}
        </button>
      ))}
    </div>
  );
}
