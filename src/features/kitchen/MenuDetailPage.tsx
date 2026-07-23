import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useCreateMenu,
  useCreateMenuDish,
  useGetMenu,
  useListDish,
  useListDishRecipe,
  useListIngredient,
  useListIngredientPriceObservation,
  useListMenuDish,
  useListRecipeIngredient,
  useMenuArchive,
  useMenuDishUpdateSellingPrice,
  useMenuMarkPublished,
  useMenuRestore,
  useMenuUnpublish,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import { buildMenuProfitability } from "./MenuProfitabilityAnalysis";
import { MenuProfitabilityPanel } from "./MenuProfitabilityPanel";
import {
  allergenMatrixPath,
  kitchenCatalogPath,
  menuPath,
} from "./kitchenRoutes";
import { duplicateMenu } from "./menuTemplates";
import { useTenantBranding } from "../admin/tenantBranding";
import { downloadMenuPdf } from "./menuPdf";

const policy = new CulinaryLifecyclePolicy();

export function MenuDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const menu = useGetMenu(id ?? "skip");
  useTrackRecent("Menu", menu?.name);
  const dishes = useListDish();
  const menuDishes = useListMenuDish();
  const dishRecipes = useListDishRecipe();
  const recipeIngredients = useListRecipeIngredient();
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const { branding } = useTenantBranding();
  const publish = useMenuMarkPublished();
  const unpublish = useMenuUnpublish();
  const archive = useMenuArchive();
  const restore = useMenuRestore();
  const updateSellingPrice = useMenuDishUpdateSellingPrice();
  const createMenu = useCreateMenu();
  const createMenuDish = useCreateMenuDish();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedMenuDishes = useMemo(
    () =>
      (menuDishes ?? []).filter(
        (selection) => selection.deletedAt == null && selection.menuId === id,
      ),
    [id, menuDishes],
  );
  const profitability = useMemo(
    () =>
      buildMenuProfitability({
        menuDishes: selectedMenuDishes.map((selection) => ({
          id: selection._id,
          version: selection.version,
          dishId: selection.dishId,
          sortOrder: selection.sortOrder,
          sellingPrice: selection.sellingPrice,
          course: selection.course,
          deletedAt: selection.deletedAt,
        })),
        dishes: (dishes ?? []).map((dish) => ({
          id: dish._id,
          name: dish.name,
          deletedAt: dish.deletedAt,
        })),
        dishRecipes: (dishRecipes ?? []).map((attachment) => ({
          id: attachment._id,
          dishId: attachment.dishId,
          recipeId: attachment.recipeId,
          yieldQuantity: attachment.yieldQuantity,
          batchMultiplier: attachment.batchMultiplier,
          deletedAt: attachment.deletedAt,
        })),
        recipeIngredients: (recipeIngredients ?? []).map((line) => ({
          id: line._id,
          recipeId: line.recipeId,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          deletedAt: line.deletedAt,
        })),
        ingredients: (ingredients ?? []).map((ingredient) => ({
          id: ingredient._id,
          name: ingredient.name,
          unit: ingredient.unit,
          costPerUnit: ingredient.costPerUnit,
          deletedAt: ingredient.deletedAt,
        })),
        priceObservations: priceObservations ?? [],
      }),
    [
      dishes,
      dishRecipes,
      ingredients,
      priceObservations,
      recipeIngredients,
      selectedMenuDishes,
    ],
  );
  const profitabilityLoading =
    dishes === undefined ||
    menuDishes === undefined ||
    dishRecipes === undefined ||
    recipeIngredients === undefined ||
    ingredients === undefined ||
    priceObservations === undefined;

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
      {notice ? (
        <p className="mt-4 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Menu · Edition {menu.version}</p>
            <h1 className="culinary-title-compact">{menu.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={
                busy != null || dishes === undefined || menuDishes === undefined
              }
              onClick={() => {
                setFailure(null);
                setNotice(null);
                void downloadMenuPdf({
                  menu,
                  dishes: selectedMenuDishes.map((selection) => ({
                    selection,
                    dish: dishes?.find((dish) => dish._id === selection.dishId),
                  })),
                  branding,
                })
                  .then(() => setNotice("Menu PDF downloaded."))
                  .catch((error) => setFailure(error));
              }}
            >
              Download PDF
            </button>
            <Link
              to={allergenMatrixPath("menu", menu._id)}
              className="btn btn-ghost"
            >
              Allergen matrix
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy != null || menuDishes === undefined}
              onClick={() => {
                const isTemplate = !menu.isTemplate;
                const name = window
                  .prompt(
                    isTemplate ? "Template name" : "New menu name",
                    isTemplate ? `${menu.name} template` : menu.name,
                  )
                  ?.trim();
                if (!name) return;
                setNotice(null);
                void run("duplicate", async () => {
                  const createdId = await duplicateMenu({
                    source: menu,
                    dishLines: selectedMenuDishes,
                    name,
                    isTemplate,
                    createMenu,
                    createMenuDish,
                  });
                  navigate(menuPath(createdId));
                });
              }}
            >
              {busy === "duplicate"
                ? "Duplicating…"
                : menu.isTemplate
                  ? "New menu from template"
                  : "Save as template"}
            </button>
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

      <MenuProfitabilityPanel
        analysis={profitability}
        loading={profitabilityLoading}
        busySelectionId={
          busy?.startsWith("reprice:") ? busy.slice("reprice:".length) : null
        }
        onReprice={async (row, sellingPrice) => {
          const busyKey = `reprice:${row.menuDishId}`;
          setFailure(null);
          setNotice(null);
          setBusy(busyKey);
          try {
            await updateSellingPrice({
              docId: row.menuDishId,
              version: row.menuDishVersion,
              sellingPrice,
            });
            setNotice(`${row.dishName} price updated.`);
          } catch (error) {
            setFailure(error);
            throw error;
          } finally {
            setBusy(null);
          }
        }}
      />
    </article>
  );
}
