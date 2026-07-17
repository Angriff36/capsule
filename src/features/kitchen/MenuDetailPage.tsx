import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGetMenu,
  useMenuArchive,
  useMenuMarkPublished,
  useMenuRestore,
  useMenuUnpublish,
} from "../../lib/manifest-convex-react";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import { kitchenCatalogPath } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

export function MenuDetailPage() {
  const { id } = useParams();
  const menu = useGetMenu(id ?? "skip");
  const publish = useMenuMarkPublished();
  const unpublish = useMenuUnpublish();
  const archive = useMenuArchive();
  const restore = useMenuRestore();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  if (!id) return <ErrorState title="Menu not found" />;
  if (menu === undefined) {
    return (
      <div className="culinary-document culinary-document-compact space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (menu === null || menu.deletedAt != null) {
    return (
      <ErrorState
        title="Menu not found"
        detail="This menu is unavailable or no longer exists."
      />
    );
  }

  const actions = policy.menuActions(String(menu.status));

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="culinary-document culinary-document-compact">
      <Link
        to={kitchenCatalogPath("menus")}
        className="text-[12px] text-ink-3 hover:text-ink"
      >
        ← Menu index
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Menu · Edition {menu.version}</p>
            <h1 className="culinary-title-compact">{menu.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                className={
                  action.key === "markPublished"
                    ? "btn btn-primary"
                    : "btn btn-ghost"
                }
                disabled={busy != null}
                onClick={() => {
                  const reason = ["unpublish", "archive"].includes(action.key)
                    ? window.prompt("Reason")?.trim()
                    : undefined;
                  if (
                    ["unpublish", "archive"].includes(action.key) &&
                    !reason
                  ) {
                    return;
                  }
                  void run(action.key, async () => {
                    const args = { docId: menu._id, version: menu.version };
                    if (action.key === "markPublished") await publish(args);
                    if (action.key === "unpublish") {
                      await unpublish({ ...args, reason: reason! });
                    }
                    if (action.key === "archive") {
                      await archive({ ...args, reason: reason! });
                    }
                    if (action.key === "restore") await restore(args);
                  });
                }}
              >
                {busy === action.key ? "Working…" : action.label}
              </button>
            ))}
          </div>
        </div>
        <dl className="culinary-facts culinary-facts-compact">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusChip status={String(menu.status)} />
            </dd>
          </div>
          <div>
            <dt>Base price</dt>
            <dd>{menu.basePrice}</dd>
          </div>
          <div>
            <dt>Per person</dt>
            <dd>{menu.pricePerPerson}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>
              {menu.minGuests}–{menu.maxGuests || "∞"}
            </dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd>{menu.isTemplate ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </header>

      {menu.description ? (
        <p className="culinary-lead">{menu.description}</p>
      ) : null}
    </article>
  );
}
