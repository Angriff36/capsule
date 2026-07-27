import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useCreateDish,
  useCreateIngredient,
  useCreateMenu,
  useCreateComponent,
  useDishPurge,
  useDishReinstate,
  useIngredientPurge,
  useIngredientReinstate,
  useListDish,
  useListIngredient,
  useListMenu,
  useListComponent,
  useComponentPurge,
  useMenuArchive,
  useMenuMarkPublished,
  useMenuRestore,
  useMenuUnpublish,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { culinaryCatalogVisibility } from "./CulinaryCatalogVisibility";
import { KitchenBookNav } from "./KitchenBookNav";
import { KitchenCatalogCards } from "./KitchenCatalogCards";
import { KitchenCatalogCreateForm } from "./KitchenCatalogCreateForm";
import {
  KITCHEN_SECTION_SINGULAR,
  COMPONENT_IMPORT_PATH,
  dishPath,
  componentPath,
  type KitchenSection,
} from "./kitchenRoutes";
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
  const components = useListComponent();
  const dishes = useListDish();
  const menus = useListMenu();
  const createIngredient = useCreateIngredient();
  const createComponent = useCreateComponent();
  const createDish = useCreateDish();
  const createMenu = useCreateMenu();
  const purgeIngredient = useIngredientPurge();
  const reinstateIngredient = useIngredientReinstate();
  const purgeDish = useDishPurge();
  const reinstateDish = useDishReinstate();
  const purgeComponent = useComponentPurge();
  const publishMenu = useMenuMarkPublished();
  const unpublishMenu = useMenuUnpublish();
  const archiveMenu = useMenuArchive();
  const restoreMenu = useMenuRestore();
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const data = { components, ingredients, dishes, menus }[section];
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = showHidden
      ? (data ?? [])
      : culinaryCatalogVisibility.filterLive(data ?? []);
    return base
      .filter((item) =>
        query
          ? [item.name, "category" in item ? item.category : undefined]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
          : true,
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [data, search, showHidden]);

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
        const created = await createDish({
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
        // Prep templates, containers and components all live on the detail page,
        // and adding them is always the next step. Land there like components do.
        navigate(dishPath(created.docId));
        return;
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
          <p className="eyebrow">Culinary book · {title}</p>
          <h1 className="display-title mt-2">The house book</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Browse and open {section} as cards — then drill into the record that
            needs work.
          </p>
        </div>
        <div className="component-book-masthead-actions">
          {section === "components" ? (
            <Link to={COMPONENT_IMPORT_PATH} className="btn btn-ghost">
              Import component
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

      <section className="component-catalog">
        <div className="component-index-heading">
          <div>
            <p className="eyebrow">Live index</p>
            <h2 className="font-display mt-1 text-3xl">{title}</h2>
          </div>
          <span className="font-mono text-[11px] text-ink-3">
            {rows.length} records
          </span>
        </div>
        <div className="component-toolbar">
          <label className="component-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${section}…`}
            />
          </label>
          {section === "dishes" ||
          section === "ingredients" ||
          section === "components" ? (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
              />
              Show deleted / retired
            </label>
          ) : null}
        </div>

        {data === undefined ? (
          <div className="card">
            <TableSkeleton rows={7} />
          </div>
        ) : rows.length === 0 ? (
          search ? (
            <div className="component-filter-empty">
              <p>No records match this search.</p>
            </div>
          ) : (
            <div className="component-empty-state">
              <div className="component-book-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <p className="eyebrow">Blank first edition</p>
                <h3 className="font-display mt-2 text-4xl">
                  Every kitchen needs a house book.
                </h3>
                <p className="mt-3 max-w-110 text-ink-2">
                  Create the first {KITCHEN_SECTION_SINGULAR[section]} through
                  the generated Manifest command.
                </p>
              </div>
            </div>
          )
        ) : (
          <KitchenCatalogCards
            section={section}
            rows={rows as never}
            busy={busy}
            showHidden={showHidden}
            run={run}
            commands={lifecycleCommands}
          />
        )}
      </section>
    </div>
  );
}
