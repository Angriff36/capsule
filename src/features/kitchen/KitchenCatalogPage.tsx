import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import { useGenerateUploadUrl } from "../../lib/fileStorageClient";
import type { Id } from "../../lib/api";
import { scaleNutritionFromGramsToUnit } from "../../lib/nutritionUnitScale";
import {
  useCreateIngredient,
  useCreateMenu,
  useCreateComponent,
  useCreateAttachment,
  useIngredientSetPrimaryImage,
  useIngredientSetNutrition,
  useDishPurge,
  useDishReinstate,
  useIngredientPurge,
  useIngredientReinstate,
  useListIngredient,
  useListMenu,
  useListComponent,
  useComponentPurge,
  useMenuArchive,
  useMenuMarkPublished,
  useMenuRestore,
  useMenuUnpublish,
} from "../../lib/manifest-convex-react";
import { useDishPages, useDishSearch } from "../../lib/useDishesByIds";
import { TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { useSuccessToast } from "../../ui/useSuccessToast";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { culinaryCatalogVisibility } from "./CulinaryCatalogVisibility";
import { mainDishRows } from "./dishVersions";
import { KitchenBookNav } from "./KitchenBookNav";
import { KitchenCatalogCards, type CatalogItem } from "./KitchenCatalogCards";
import { KitchenCatalogCreateForm } from "./KitchenCatalogCreateForm";
import { NewDishPanel } from "./NewDishPanel";
import { KitchenCatalogDisplayCache } from "./KitchenCatalogDisplayCache";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  KITCHEN_SECTIONS,
  KITCHEN_SECTION_SINGULAR,
  COMPONENT_IMPORT_PATH,
  componentPath,
  ingredientPath,
  type KitchenSection,
} from "./kitchenRoutes";
import { uploadCatalogPrimaryImage } from "../attachments/catalogPrimaryImageUpload";
import { parseIngredientAllergensFromForm } from "./IngredientAllergenFieldset";
import { parseIngredientNutritionFromForm } from "./lookup/parseIngredientNutritionFromForm";
import {
  useIngredientLookupApplyImageToIngredient,
  useIngredientLookupApplyCostToIngredient,
} from "../../lib/ingredientLookupClient";
import { UNIT_OF_MEASURE } from "./import/UnitOfMeasureMapper";
import { useListViewState } from "../list-state/useListViewState";
import { ListStateManager } from "../list-state/ListStateManager";
import { useListOrigin } from "../list-state/listOrigin";

const UNITS = UNIT_OF_MEASURE;

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

export function KitchenCatalogPage({ section }: { section: KitchenSection }) {
  if (section === "ingredients") return <IngredientCatalogPage />;
  if (section === "components") return <ComponentCatalogPage />;
  if (section === "dishes") return <DishCatalogPage />;
  return <MenuCatalogPage />;
}

function IngredientCatalogPage() {
  const data = useListIngredient();
  return (
    <KitchenCatalogPageContent
      section="ingredients"
      data={data as CatalogItem[] | undefined}
    />
  );
}

function ComponentCatalogPage() {
  const data = useListComponent();
  return (
    <KitchenCatalogPageContent
      section="components"
      data={data as CatalogItem[] | undefined}
    />
  );
}

function DishCatalogPage() {
  // 5,800 dishes on live: a page at a time, or the server's name search;
  // never the whole catalog.
  const [{ search }] = useListViewState(kitchenListState);
  const typed = search.trim();
  const pages = useDishPages(typed === "");
  const found = useDishSearch(typed, typed !== "");
  const data = typed ? found : pages.rows;
  // Versions show as tabs on their main dish, not as rows of their own.
  const mains = useMemo(() => (data ? mainDishRows(data) : undefined), [data]);
  return (
    <>
      <KitchenCatalogPageContent
        section="dishes"
        data={mains as CatalogItem[] | undefined}
      />
      {!typed && pages.canLoadMore ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pages.loadingMore}
          onClick={pages.loadMore}
        >
          {pages.loadingMore ? "Loading…" : "Load more dishes"}
        </button>
      ) : null}
    </>
  );
}

function MenuCatalogPage() {
  const data = useListMenu();
  return (
    <KitchenCatalogPageContent
      section="menus"
      data={data as CatalogItem[] | undefined}
    />
  );
}

const kitchenListState = new ListStateManager<{
  search: string;
  category: string;
  sort: "name-asc" | "name-desc" | "category";
  showHidden: boolean;
}>({
  search: {
    key: "q",
    defaultValue: "",
    parse: (value) => value ?? "",
    serialize: (value) => value || null,
  },
  category: {
    key: "category",
    defaultValue: "all",
    parse: (value) => value ?? "all",
    serialize: (value) => (value === "all" ? null : value),
  },
  sort: {
    key: "sort",
    defaultValue: "name-asc",
    parse: (value) =>
      value === "name-desc" || value === "category" ? value : "name-asc",
    serialize: (value) => (value === "name-asc" ? null : value),
  },
  showHidden: {
    key: "hidden",
    defaultValue: false,
    parse: (value) => value === "1",
    serialize: (value) => (value ? "1" : null),
  },
});

function KitchenCatalogPageContent({
  section,
  data,
}: {
  section: KitchenSection;
  data: CatalogItem[] | undefined;
}) {
  const tenantId = useAuthStatus()?.tenantId ?? null;
  const navigate = useNavigate();
  const listOrigin = useListOrigin();
  const createIngredient = useCreateIngredient();
  const createComponent = useCreateComponent();
  const createMenu = useCreateMenu();
  const generateUploadUrl = useGenerateUploadUrl();
  const createAttachment = useCreateAttachment();
  const setIngredientPrimaryImage = useIngredientSetPrimaryImage();
  const setIngredientNutrition = useIngredientSetNutrition();
  const applyLookupImage = useIngredientLookupApplyImageToIngredient();
  const applyLookupCost = useIngredientLookupApplyCostToIngredient();
  const purgeIngredient = useIngredientPurge();
  const reinstateIngredient = useIngredientReinstate();
  const purgeDish = useDishPurge();
  const reinstateDish = useDishReinstate();
  const purgeComponent = useComponentPurge();
  const publishMenu = useMenuMarkPublished();
  const unpublishMenu = useMenuUnpublish();
  const archiveMenu = useMenuArchive();
  const restoreMenu = useMenuRestore();
  const [listState, setListState] = useListViewState(kitchenListState);
  const { search, category, sort, showHidden } = listState;
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt();
  const { notifySuccess, host: successToastHost } = useSuccessToast();
  const deferredSearch = useDeferredValue(search);

  const visibleRows = useMemo(
    () =>
      (showHidden
        ? (data ?? [])
        : culinaryCatalogVisibility.filterLive(data ?? [])) as CatalogItem[],
    [data, showHidden],
  );
  const categories = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of visibleRows) {
      const label = item.category?.trim() || "Uncategorized";
      const value = label.toLocaleLowerCase();
      const current = counts.get(value);
      counts.set(value, {
        label: current?.label ?? label,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [
      { value: "all", label: "All items", count: visibleRows.length },
      ...Array.from(counts, ([value, entry]) => ({
        value,
        label: entry.label,
        count: entry.count,
      })).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [visibleRows]);

  useEffect(() => {
    if (
      data !== undefined &&
      !categories.some((option) => option.value === category)
    ) {
      setListState({ category: "all" });
    }
  }, [categories, category, data, setListState]);

  const rows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return visibleRows
      .filter((item) => {
        const itemCategory = item.category?.trim() || "Uncategorized";
        if (
          category !== "all" &&
          itemCategory.toLocaleLowerCase() !== category
        ) {
          return false;
        }
        if (!query) return true;
        return [
          item.name,
          item.category,
          item.description,
          item.cuisine,
          item.course,
          item.versionNames,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        );
      })
      .sort((a, b) => {
        if (sort === "category") {
          const categoryOrder = String(a.category ?? "").localeCompare(
            String(b.category ?? ""),
          );
          if (categoryOrder !== 0) return categoryOrder;
        }
        const nameOrder = String(a.name).localeCompare(String(b.name));
        return sort === "name-desc" ? -nameOrder : nameOrder;
      });
  }, [category, deferredSearch, sort, visibleRows]);
  if (data !== undefined) {
    KitchenCatalogDisplayCache.write(tenantId, section, rows);
  }
  const displayRows =
    data === undefined
      ? KitchenCatalogDisplayCache.read(tenantId, section)
      : rows;
  const listLoading = data === undefined && displayRows.length === 0;

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("create", async () => {
      if (section === "ingredients") {
        const name = String(data.get("name") ?? "").trim();
        const duplicate = culinaryCanonicalMatcher.likelyDuplicate(
          visibleRows,
          name,
        );
        if (
          duplicate &&
          !(await prompt.askConfirm({
            title: "Possible duplicate ingredient",
            description: `An ingredient named "${duplicate.name}" already exists (edition ${duplicate.editionNumber ?? 1}). Prefer linking a new edition from the ingredient detail when you mean a version.`,
            confirmLabel: "Create anyway",
          }))
        ) {
          return;
        }
        const { allergens, isGlutenFree } =
          parseIngredientAllergensFromForm(data);
        const unit = String(data.get("unit"));
        const servingGramsRaw = optional(data.get("lookupServingGrams"));
        const parsedServingGrams = servingGramsRaw
          ? Number(servingGramsRaw)
          : NaN;
        const servingGramsPerUnit =
          Number.isFinite(parsedServingGrams) && parsedServingGrams > 0
            ? parsedServingGrams
            : undefined;
        const gramsPerMlRaw = optional(data.get("lookupGramsPerMl"));
        const parsedGramsPerMl = gramsPerMlRaw ? Number(gramsPerMlRaw) : NaN;
        const lookupGramsPerMl =
          Number.isFinite(parsedGramsPerMl) && parsedGramsPerMl > 0
            ? parsedGramsPerMl
            : undefined;
        const lookupProductName =
          optional(data.get("lookupProductName")) ?? name;
        const lookupUsed = data.get("lookupUsed") === "true";
        const formCost = Number(data.get("costPerUnit"));
        const costPerUnit =
          Number.isFinite(formCost) && formCost >= 0 ? formCost : 0;
        const created = (await createIngredient({
          name,
          unit: unit as (typeof UNITS)[number],
          costPerUnit,
          category: optional(data.get("category")),
          allergens: allergens.length ? allergens : undefined,
          isGlutenFree,
        })) as { docId: string };
        if (lookupUsed && costPerUnit <= 0) {
          try {
            await applyLookupCost({
              docId: created.docId as Id<"ingredients">,
              barcode: optional(data.get("lookupBarcode")),
              productName: lookupProductName,
              brandOwner: optional(data.get("lookupBrandOwner")),
              category:
                optional(data.get("lookupCategory")) ??
                optional(data.get("category")),
              catalogUnit: unit,
              servingGramsPerUnit,
            });
          } catch {
            // Ingredient exists; cost can be filled from the detail page.
          }
        }
        let ingredientVersion = 1;
        try {
          const rawNutrition = parseIngredientNutritionFromForm(data);
          const gramNutrition = Object.fromEntries(
            Object.entries(rawNutrition).filter(
              ([, value]) => value != null && Number(value) > 0,
            ),
          );
          const pendingNutrition = scaleNutritionFromGramsToUnit(
            gramNutrition,
            unit,
            servingGramsPerUnit,
            {
              gramsPerMl: lookupGramsPerMl,
              foodName: lookupProductName,
            },
          );
          if (pendingNutrition && Object.keys(pendingNutrition).length > 0) {
            await setIngredientNutrition({
              docId: created.docId,
              version: ingredientVersion,
              ...pendingNutrition,
            });
            ingredientVersion += 1;
          }
          const photo = data.get("photo");
          if (photo instanceof File && photo.size > 0) {
            await uploadCatalogPrimaryImage(
              photo,
              "ingredient",
              created.docId,
              ingredientVersion,
              {
                generateUploadUrl,
                createAttachment,
                setPrimaryImage: setIngredientPrimaryImage,
              },
            );
          } else {
            const lookupImageUrl = optional(data.get("lookupImageUrl"));
            if (lookupImageUrl) {
              const imageResult = await applyLookupImage({
                docId: created.docId as Id<"ingredients">,
                imageUrl: lookupImageUrl,
              });
              if (!imageResult.imageApplied) {
                setFailure(
                  new Error(
                    "Ingredient saved, but the lookup photo could not be imported.",
                  ),
                );
                notifySuccess(
                  `Created ${name}. Photo import failed — open the ingredient to upload manually.`,
                );
                navigate(ingredientPath(created.docId));
                return;
              }
            }
          }
        } catch (enrichmentError) {
          setFailure(enrichmentError);
          notifySuccess(
            `Created ${name}. Photo or nutrition failed — open the ingredient to finish.`,
          );
          navigate(ingredientPath(created.docId));
          return;
        }
        navigate(ingredientPath(created.docId));
        return;
      } else if (section === "components") {
        const created = await createComponent({
          name: String(data.get("name") ?? "").trim(),
          yieldQuantity: Number(data.get("yieldQuantity")),
          yieldUnit: String(data.get("yieldUnit")) as (typeof UNITS)[number],
          batchMultiplier: Number(data.get("batchMultiplier")),
          category: optional(data.get("category")),
          cuisine: optional(data.get("cuisine")),
          description: optional(data.get("description")),
          instructions: optional(data.get("instructions")),
        });
        navigate(componentPath(created.docId));
        return;
      } else {
        const name = String(data.get("name") ?? "").trim();
        const minGuests = Number(data.get("minGuests"));
        const maxGuests = Number(data.get("maxGuests"));

        // Validate guest range before submission (matches Manifest constraint wording)
        if (minGuests > 0 && maxGuests > 0 && minGuests > maxGuests) {
          throw new Error(
            "This menu's max guests can't be less than min guests. Set it to zero for no limit, or raise it to match min guests.",
          );
        }

        await createMenu({
          name,
          description: optional(data.get("description")),
          category: optional(data.get("category")),
          isTemplate: data.get("isTemplate") === "on",
          basePrice: Number(data.get("basePrice")),
          pricePerPerson: Number(data.get("pricePerPerson")),
          minGuests,
          maxGuests,
        });
        notifySuccess(`Menu "${name}" created.`);
      }
      form.reset();
      setShowCreate(false);
    });
  };

  const sectionLabel =
    KITCHEN_SECTIONS.find((entry) => entry.key === section)?.label ?? section;
  const title = sectionLabel;
  const subtitle = `Browse and open ${sectionLabel.toLowerCase()} — then open the one that needs work.`;
  const lifecycleCommands = {
    purgeIngredient,
    reinstateIngredient,
    purgeDish,
    reinstateDish,
    purgeComponent,
    publishMenu,
    unpublishMenu,
    archiveMenu,
    restoreMenu,
  };
  return (
    <div className="component-book-stage culinary-studio">
      <header className="component-book-masthead">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>
        </div>
        <div className="component-book-masthead-actions">
          {section === "components" ? (
            <Link to={COMPONENT_IMPORT_PATH} className="btn btn-ghost">
              Import recipe
            </Link>
          ) : null}
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate
              ? "Close form"
              : `New ${KITCHEN_SECTION_SINGULAR[section]}`}
          </button>
        </div>
      </header>

      <KitchenBookNav />
      {host}
      {successToastHost}
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {showCreate && section === "dishes" ? (
        <NewDishPanel onClose={() => setShowCreate(false)} />
      ) : showCreate ? (
        <KitchenCatalogCreateForm
          section={section}
          busy={busy === "create"}
          onSubmit={submit}
        />
      ) : null}

      <section className="component-catalog">
        <div className="component-index-heading">
          <h2 className="text-lg font-semibold text-ink">
            All {sectionLabel.toLowerCase()}
            <span className="ml-2 text-sm font-medium text-ink-2">
              {formatCountNoun(displayRows.length, "item")}
            </span>
          </h2>
        </div>
        <div className="component-toolbar">
          <label className="component-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setListState({ search: event.target.value })}
              placeholder={`Search ${sectionLabel.toLowerCase()} by name or category…`}
              aria-label={`Search ${sectionLabel.toLowerCase()}`}
            />
          </label>
          <label className="culinary-toolbar-field culinary-category-select">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) =>
                setListState({ category: event.target.value })
              }
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="culinary-toolbar-field">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) =>
                setListState({
                  sort: event.target.value as
                    "name-asc" | "name-desc" | "category",
                })
              }
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="category">Category</option>
            </select>
          </label>
          {section === "dishes" ||
          section === "ingredients" ||
          section === "components" ? (
            <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) =>
                  setListState({ showHidden: event.target.checked })
                }
              />
              Show deleted / retired
            </label>
          ) : null}
        </div>

        {listLoading ? (
          <div className="card">
            <TableSkeleton rows={7} />
          </div>
        ) : displayRows.length === 0 ? (
          search ? (
            <div className="component-filter-empty">
              <p>Nothing matches this search.</p>
            </div>
          ) : (
            <div className="component-empty-state">
              <div
                className="component-book-mark"
                aria-hidden="true"
                data-label={`HOUSE\n${sectionLabel.toUpperCase()}`}
              >
                <span />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-ink">
                  No {sectionLabel.toLowerCase()} yet
                </h3>
                <p className="mt-2 max-w-110 text-ink-2">
                  Add the first {KITCHEN_SECTION_SINGULAR[section]} with the
                  button above.
                </p>
              </div>
            </div>
          )
        ) : (
          <KitchenCatalogCards
            section={section}
            rows={displayRows as never}
            viewKey={`${section}:${category}:${deferredSearch}:${sort}:${showHidden}`}
            categories={categories}
            activeCategory={category}
            onCategoryChange={(next) => setListState({ category: next })}
            busy={busy}
            showHidden={showHidden}
            run={run}
            commands={lifecycleCommands}
            origin={listOrigin}
            loaded={data !== undefined}
          />
        )}
      </section>
    </div>
  );
}
