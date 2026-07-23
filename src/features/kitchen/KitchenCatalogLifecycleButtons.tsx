import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import type { KitchenSection } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

type Commands = {
  discontinueIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  retireDish: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateDish: (args: Record<string, unknown>) => Promise<unknown>;
  publishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  unpublishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  archiveMenu: (args: Record<string, unknown>) => Promise<unknown>;
  restoreMenu: (args: Record<string, unknown>) => Promise<unknown>;
};

type Props = {
  section: KitchenSection;
  item: { _id: string; version: number; status: string };
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  commands: Commands;
};

export function KitchenCatalogLifecycleButtons({
  section,
  item,
  busy,
  run,
  commands,
}: Props) {
  const actions =
    section === "ingredients"
      ? policy.ingredientActions(String(item.status))
      : section === "dishes"
        ? policy.dishActions(String(item.status))
        : policy.menuActions(String(item.status));
  if (!actions.length) return null;

  const invoke = (key: string) => {
    const reason = ["discontinue", "retire", "unpublish", "archive"].includes(
      key,
    )
      ? window.prompt("Reason")?.trim()
      : undefined;
    if (
      ["discontinue", "retire", "unpublish", "archive"].includes(key) &&
      !reason
    ) {
      return;
    }
    void run(`${item._id}:${key}`, async () => {
      const args = { docId: item._id, version: item.version };
      if (key === "discontinue") {
        await commands.discontinueIngredient({ ...args, reason });
      }
      if (key === "reinstate") {
        await (section === "ingredients"
          ? commands.reinstateIngredient(args)
          : commands.reinstateDish(args));
      }
      if (key === "retire") await commands.retireDish({ ...args, reason });
      if (key === "markPublished") await commands.publishMenu(args);
      if (key === "unpublish") {
        await commands.unpublishMenu({ ...args, reason });
      }
      if (key === "archive") await commands.archiveMenu({ ...args, reason });
      if (key === "restore") await commands.restoreMenu(args);
    });
  };

  return (
    <div className="culinary-row-actions">
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
