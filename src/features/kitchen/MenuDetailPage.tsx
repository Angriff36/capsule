import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useCreateMenu,
  useCreateMenuDish,
  useGetMenu,
  useListDish,
  useListDishComponent,
  useListDishIngredient,
  useListIngredient,
  useListIngredientPriceObservation,
  useListMenuDish,
  useListComponent,
  useListComponentIngredient,
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
import { MenuDishManager } from "./MenuDishManager";
import { buildMenuProfitability } from "./MenuProfitabilityAnalysis";
import { MenuProfitabilityPanel } from "./MenuProfitabilityPanel";
import {
  calculateComponentNutrition,
  sumPerGuestNutrition,
  toNutritionIngredient,
  type ComponentNutritionLineInput,
} from "./ComponentNutrition";
import { ComponentNutritionPanel } from "./ComponentNutritionPanel";
import {
  allergenMatrixPath,
  kitchenCatalogPath,
  menuPath,
} from "./kitchenRoutes";
import { duplicateMenu } from "./menuTemplates";
import { useTenantBranding } from "../admin/tenantBranding";
import { downloadMenuPdf, type MenuPdfLayout } from "./menuPdf";
import { deriveAllergenRows } from "./AllergenMatrixPage";

const policy = new CulinaryLifecyclePolicy();

export function MenuDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const menu = useGetMenu(id ?? "skip");
  useTrackRecent("Menu", menu?.name);
  const dishes = useListDish();
  const menuDishes = useListMenuDish();
  const dishComponents = useListDishComponent();
  const dishIngredients = useListDishIngredient();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
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
  const [pdfLayout, setPdfLayout] = useState<MenuPdfLayout>("card");
  const selectedMenuDishes = useMemo(
    () =>
      (menuDishes ?? []).filter(
        (selection) => selection.deletedAt == null && selection.menuId === id,
      ),
    [id, menuDishes],
  );
  const allergensByDish = useMemo(() => {
    const rows = deriveAllergenRows({
      dishIds: selectedMenuDishes.map((selection) => String(selection.dishId)),
      dishes: dishes ?? [],
      dishComponents: dishComponents ?? [],
      componentIngredients: componentIngredients ?? [],
      ingredients: ingredients ?? [],
    });
    const map = new Map<string, string[]>();
    for (const { dish, sources } of rows) {
      map.set(String(dish._id), [...sources.keys()]);
    }
    return map;
  }, [
    selectedMenuDishes,
    dishes,
    dishComponents,
    componentIngredients,
    ingredients,
  ]);
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
        dishComponents: (dishComponents ?? []).map((attachment) => ({
          id: attachment._id,
          dishId: attachment.dishId,
          componentId: attachment.componentId,
          yieldQuantity: attachment.yieldQuantity,
          batchMultiplier: attachment.batchMultiplier,
          deletedAt: attachment.deletedAt,
        })),
        dishIngredients: (dishIngredients ?? []).map((line) => ({
          id: line._id,
          dishId: line.dishId,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          wasteFactor: line.wasteFactor,
          addedAt: line.addedAt,
          deletedAt: line.deletedAt,
        })),
        componentIngredients: (componentIngredients ?? []).map((line) => ({
          id: line._id,
          componentId: line.componentId,
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
      dishComponents,
      dishIngredients,
      ingredients,
      priceObservations,
      componentIngredients,
      selectedMenuDishes,
    ],
  );
  const profitabilityLoading =
    dishes === undefined ||
    menuDishes === undefined ||
    dishComponents === undefined ||
    dishIngredients === undefined ||
    componentIngredients === undefined ||
    ingredients === undefined ||
    priceObservations === undefined;

  // Per-guest nutrition = one portion of each component composing each dish on the
  // menu. Operational estimate; it does not re-scale for dish-level component yields.
  const menuNutrition = useMemo(() => {
    const dishIds = new Set(
      selectedMenuDishes.map((selection) => String(selection.dishId)),
    );
    const nutritionIngredients = (ingredients ?? [])
      .filter((ingredient) => ingredient.deletedAt == null)
      .map(toNutritionIngredient);
    const linesByComponent = new Map<string, ComponentNutritionLineInput[]>();
    for (const line of componentIngredients ?? []) {
      if (line.deletedAt != null) continue;
      const list = linesByComponent.get(line.componentId) ?? [];
      list.push({
        id: line._id,
        ingredientId: line.ingredientId,
        quantity: Number(line.quantity),
        unit: line.unit,
      });
      linesByComponent.set(line.componentId, list);
    }
    const componentById = new Map(
      (components ?? []).map((component) => [component._id, component]),
    );
    const summaries = (dishComponents ?? [])
      .filter(
        (attachment) =>
          attachment.deletedAt == null &&
          dishIds.has(String(attachment.dishId)),
      )
      .map((attachment) => {
        const component = componentById.get(attachment.componentId);
        return calculateComponentNutrition({
          lines: linesByComponent.get(attachment.componentId) ?? [],
          ingredients: nutritionIngredients,
          servesPerYield: Number(
            (component as { servesPerYield?: number } | undefined)
              ?.servesPerYield ?? 1,
          ),
        });
      });
    return sumPerGuestNutrition(summaries);
  }, [
    selectedMenuDishes,
    dishComponents,
    components,
    componentIngredients,
    ingredients,
  ]);
  const nutritionLoading =
    dishComponents === undefined ||
    components === undefined ||
    componentIngredients === undefined ||
    ingredients === undefined;
  const menuNutritionNote =
    menuNutrition.componentCount === 0
      ? "Add dishes with components to estimate per-guest nutrition."
      : `Estimated across ${menuNutrition.componentCount} component${menuNutrition.componentCount === 1 ? "" : "s"} on this menu${menuNutrition.isComplete ? "" : ` (${menuNutrition.measuredComponentCount} with recorded nutrition)`}.`;

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
    <article className="culinary-document culinary-document-compact culinary-studio">
      <Link to={kitchenCatalogPath("menus")} className="culinary-studio-back">
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
            <select
              className="input"
              aria-label="Menu PDF layout"
              value={pdfLayout}
              disabled={busy != null}
              onChange={(event) =>
                setPdfLayout(event.target.value as MenuPdfLayout)
              }
            >
              <option value="card">Card layout</option>
              <option value="buffet">Buffet list</option>
            </select>
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
                  layout: pdfLayout,
                  dishes: selectedMenuDishes.map((selection) => ({
                    selection,
                    dish: dishes?.find((dish) => dish._id === selection.dishId),
                    allergens:
                      allergensByDish.get(String(selection.dishId)) ?? [],
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

      <MenuDishManager
        menuId={menu._id}
        menuStatus={String(menu.status)}
        menuDishes={selectedMenuDishes}
        dishes={(dishes ?? []).map((dish) => ({
          _id: dish._id,
          name: dish.name,
          description: dish.description,
          allergenSummary: dish.allergenSummary,
          primaryImageStorageId: dish.primaryImageStorageId,
          editionNumber: dish.editionNumber,
          deletedAt: dish.deletedAt,
          status: String(dish.status),
          mergedIntoDishId: dish.mergedIntoDishId,
          canonicalDishId: dish.canonicalDishId,
        }))}
        onError={setFailure}
      />

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

      <ComponentNutritionPanel
        heading="Per-guest nutrition"
        portionLabel="per guest"
        totals={
          menuNutrition.componentCount > 0 ? menuNutrition.perGuest : null
        }
        coverageNote={menuNutritionNote}
        loading={nutritionLoading}
      />
    </article>
  );
}
