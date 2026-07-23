import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useCreateDish,
  useCreateIngredient,
  useCreateMenu,
  useCreateRecipe,
  useDishReinstate,
  useDishRetire,
  useIngredientDiscontinue,
  useIngredientReinstate,
  useListDish,
  useListIngredient,
  useListMenu,
  useListRecipe,
  useMenuArchive,
  useMenuMarkPublished,
  useMenuRestore,
  useMenuUnpublish,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { DishPrimaryImage } from "./DishPrimaryImage";
import { KitchenBookNav } from "./KitchenBookNav";
import { KitchenCatalogCreateForm } from "./KitchenCatalogCreateForm";
import { KitchenCatalogLifecycleButtons } from "./KitchenCatalogLifecycleButtons";
import {
  RECIPE_IMPORT_PATH,
  dishPath,
  ingredientPath,
  menuPath,
  recipePath,
  type KitchenSection,
} from "./kitchenRoutes";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { UNIT_OF_MEASURE } from "./import/UnitOfMeasureMapper";

const UNITS = UNIT_OF_MEASURE;

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function csv(value: FormDataEntryValue | null) {
  const result = String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return result.length ? result : undefined;
}

export function KitchenCatalogPage({ section }: { section: KitchenSection }) {
  const navigate = useNavigate();
  const ingredients = useListIngredient();
  const recipes = useListRecipe();
  const dishes = useListDish();
  const menus = useListMenu();
  const createIngredient = useCreateIngredient();
  const createRecipe = useCreateRecipe();
  const createDish = useCreateDish();
  const createMenu = useCreateMenu();
  const discontinueIngredient = useIngredientDiscontinue();
  const reinstateIngredient = useIngredientReinstate();
  const retireDish = useDishRetire();
  const reinstateDish = useDishReinstate();
  const publishMenu = useMenuMarkPublished();
  const unpublishMenu = useMenuUnpublish();
  const archiveMenu = useMenuArchive();
  const restoreMenu = useMenuRestore();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const data = { recipes, ingredients, dishes, menus }[section];
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? [])
      .filter((item) => item.deletedAt == null)
      .filter((item) =>
        query
          ? [item.name, "category" in item ? item.category : undefined]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
          : true,
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [data, search]);

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
          ingredients ?? [],
          name,
        );
        if (
          duplicate &&
          !window.confirm(
            `An ingredient named "${duplicate.name}" already exists (edition ${duplicate.editionNumber ?? 1}). Create anyway? Prefer linking a new edition from the ingredient detail when you mean a version.`,
          )
        ) {
          return;
        }
        await createIngredient({
          name,
          unit: String(data.get("unit")) as (typeof UNITS)[number],
          costPerUnit: Number(data.get("costPerUnit")),
          category: optional(data.get("category")),
          allergens: csv(data.get("allergens")) as
            | (
                | "milk"
                | "eggs"
                | "fish"
                | "crustacean_shellfish"
                | "tree_nuts"
                | "peanuts"
                | "wheat"
                | "soybeans"
                | "sesame"
              )[]
            | undefined,
        });
      } else if (section === "recipes") {
        const created = await createRecipe({
          name: String(data.get("name") ?? "").trim(),
          yieldQuantity: Number(data.get("yieldQuantity")),
          yieldUnit: String(data.get("yieldUnit")) as (typeof UNITS)[number],
          batchMultiplier: Number(data.get("batchMultiplier")),
          category: optional(data.get("category")),
          cuisine: optional(data.get("cuisine")),
          description: optional(data.get("description")),
          instructions: optional(data.get("instructions")),
        });
        navigate(recipePath(created.docId));
        return;
      } else if (section === "dishes") {
        const name = String(data.get("name") ?? "").trim();
        const duplicate = culinaryCanonicalMatcher.likelyDuplicate(
          dishes ?? [],
          name,
        );
        if (
          duplicate &&
          !window.confirm(
            `A dish named "${duplicate.name}" already exists (edition ${duplicate.editionNumber ?? 1}). Create anyway? Use dish detail → Create new edition for a versioned edition.`,
          )
        ) {
          return;
        }
        await createDish({
          name,
          portionSize: Number(data.get("portionSize")),
          portionUnit: String(
            data.get("portionUnit"),
          ) as (typeof UNITS)[number],
          description: optional(data.get("description")),
          category: optional(data.get("category")),
          course: optional(data.get("course")),
          serviceStyle: optional(data.get("serviceStyle")),
          dietaryTags: csv(data.get("dietaryTags")),
        });
      } else {
        await createMenu({
          name: String(data.get("name") ?? "").trim(),
          description: optional(data.get("description")),
          category: optional(data.get("category")),
          isTemplate: data.get("isTemplate") === "on",
          basePrice: Number(data.get("basePrice")),
          pricePerPerson: Number(data.get("pricePerPerson")),
          minGuests: Number(data.get("minGuests")),
          maxGuests: Number(data.get("maxGuests")),
        });
      }
      form.reset();
      setShowCreate(false);
    });
  };

  const title = section[0].toUpperCase() + section.slice(1);
  return (
    <div className="recipe-book-stage">
      <header className="recipe-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · {title}</p>
          <h1 className="display-title mt-2">The house book</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Source-backed recipes, ingredients, plated dishes, and publishable
            menu records.
          </p>
        </div>
        <div className="recipe-book-masthead-actions">
          {section === "recipes" ? (
            <Link to={RECIPE_IMPORT_PATH} className="btn btn-ghost">
              Import recipe
            </Link>
          ) : null}
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close form" : `New ${section.slice(0, -1)}`}
          </button>
        </div>
      </header>

      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {showCreate ? (
        <KitchenCatalogCreateForm
          section={section}
          busy={busy === "create"}
          onSubmit={submit}
        />
      ) : null}

      <section className="recipe-catalog">
        <div className="recipe-index-heading">
          <div>
            <p className="eyebrow">Live index</p>
            <h2 className="font-display mt-1 text-3xl">{title}</h2>
          </div>
          <span className="font-mono text-[11px] text-ink-3">
            {rows.length} records
          </span>
        </div>
        <div className="recipe-toolbar">
          <label className="recipe-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${section}…`}
            />
          </label>
        </div>

        {data === undefined ? (
          <div className="card">
            <TableSkeleton rows={7} />
          </div>
        ) : rows.length === 0 ? (
          search ? (
            <div className="recipe-filter-empty">
              <p>No records match this search.</p>
            </div>
          ) : (
            <div className="recipe-empty-state">
              <div className="recipe-book-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <p className="eyebrow">Blank first edition</p>
                <h3 className="font-display mt-2 text-4xl">
                  Every kitchen needs a house book.
                </h3>
                <p className="mt-3 max-w-110 text-ink-2">
                  Create the first {section.slice(0, -1)} through the generated
                  Manifest command.
                </p>
              </div>
            </div>
          )
        ) : (
          <ul className="recipe-index">
            {rows.map((item, index) => {
              const content = (
                <>
                  <span className="recipe-index-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 items-start gap-2">
                    {section === "dishes" && "primaryImageStorageId" in item ? (
                      <DishPrimaryImage
                        storageId={item.primaryImageStorageId as string | null}
                        alt={item.name}
                        size="thumb"
                      />
                    ) : null}
                    <span>
                      <strong className="recipe-index-name">{item.name}</strong>
                      <small className="recipe-index-description">
                        {"description" in item
                          ? item.description || "No description recorded"
                          : "category" in item
                            ? item.category || "Unclassified"
                            : ""}
                      </small>
                      {section === "dishes" && "allergenSummary" in item ? (
                        <AllergenIconRow
                          codes={item.allergenSummary as string[]}
                          className="mt-1"
                        />
                      ) : null}
                    </span>
                  </span>
                  <span className="recipe-index-taxonomy">
                    {"category" in item
                      ? item.category || "Unclassified"
                      : "Culinary"}
                    <small>
                      {section === "recipes" && "cuisine" in item
                        ? item.cuisine || "No cuisine"
                        : section.slice(0, -1)}
                    </small>
                  </span>
                  <span className="recipe-index-tags">
                    {section === "ingredients" && "unit" in item ? (
                      <span>{String(item.unit)}</span>
                    ) : null}
                    {section === "dishes" && "course" in item && item.course ? (
                      <span>{item.course}</span>
                    ) : null}
                    {section === "menus" &&
                    "isTemplate" in item &&
                    item.isTemplate ? (
                      <span>Template</span>
                    ) : null}
                  </span>
                  <span className="recipe-index-state">
                    <span
                      className={
                        String(item.status) === "active" ||
                        String(item.status) === "published"
                          ? "active"
                          : "inactive"
                      }
                    >
                      {String(item.status)}
                    </span>
                    <small>v{item.version}</small>
                  </span>
                  <span className="recipe-index-arrow">→</span>
                </>
              );
              return (
                <li key={item._id}>
                  {section === "recipes" ? (
                    <Link to={recipePath(item._id)}>{content}</Link>
                  ) : section === "ingredients" ? (
                    <div className="culinary-index-row">
                      <CulinaryEntityLink kind="ingredient" id={item._id}>
                        {content}
                      </CulinaryEntityLink>
                      <KitchenCatalogLifecycleButtons
                        section={section}
                        item={item}
                        busy={busy}
                        run={run}
                        commands={{
                          discontinueIngredient,
                          reinstateIngredient,
                          retireDish,
                          reinstateDish,
                          publishMenu,
                          unpublishMenu,
                          archiveMenu,
                          restoreMenu,
                        }}
                      />
                    </div>
                  ) : section === "dishes" ? (
                    <div className="culinary-index-row">
                      <CulinaryEntityLink kind="dish" id={item._id}>
                        {content}
                      </CulinaryEntityLink>
                      <KitchenCatalogLifecycleButtons
                        section={section}
                        item={item}
                        busy={busy}
                        run={run}
                        commands={{
                          discontinueIngredient,
                          reinstateIngredient,
                          retireDish,
                          reinstateDish,
                          publishMenu,
                          unpublishMenu,
                          archiveMenu,
                          restoreMenu,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="culinary-index-row">
                      <CulinaryEntityLink kind="menu" id={item._id}>
                        {content}
                      </CulinaryEntityLink>
                      <KitchenCatalogLifecycleButtons
                        section={section}
                        item={item}
                        busy={busy}
                        run={run}
                        commands={{
                          discontinueIngredient,
                          reinstateIngredient,
                          retireDish,
                          reinstateDish,
                          publishMenu,
                          unpublishMenu,
                          archiveMenu,
                          restoreMenu,
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
