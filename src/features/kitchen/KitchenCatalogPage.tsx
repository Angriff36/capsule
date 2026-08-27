import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import { useGenerateUploadUrl } from "../../lib/fileStorageClient";
import type { Id } from "../../lib/api";
import { scaleNutritionFromGramsToUnit } from "../../lib/nutritionUnitScale";
import {
  useCreateDish,
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
import { useActionPrompt } from "../../ui/action-prompt";
import { useSuccessToast } from "../../ui/useSuccessToast";
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
  ingredientPath,
  type KitchenSection,
} from "./kitchenRoutes";
import { uploadCatalogPrimaryImage } from "../attachments/catalogPrimaryImageUpload";
import { parseIngredientAllergensFromForm } from "./IngredientAllergenFieldset";
import { parseIngredientNutritionFromForm } from "./lookup/parseIngredientNutritionFromForm";
import {
  useIngredientLookupApplyImageToIngredient,
  useIngredientLookupResolveCreateCost,
} from "../../lib/ingredientLookupClient";
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
  const generateUploadUrl = useGenerateUploadUrl();
  const createAttachment = useCreateAttachment();
  const setIngredientPrimaryImage = useIngredientSetPrimaryImage();
  const setIngredientNutrition = useIngredientSetNutrition();
  const applyLookupImage = useIngredientLookupApplyImageToIngredient();
  const resolveCreateLookupCost = useIngredientLookupResolveCreateCost();
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
  const { prompt, host } = useActionPrompt();
  const { notifySuccess, host: successToastHost } = useSuccessToast();

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
        const lookupProductName =
          optional(data.get("lookupProductName")) ?? name;
        const formCost = Number(data.get("costPerUnit"));
        const resolvedCost = await resolveCreateLookupCost({
          barcode: optional(data.get("lookupBarcode")),
          productName: lookupProductName,
          brandOwner: optional(data.get("lookupBrandOwner")),
          category:
            optional(data.get("lookupCategory")) ??
            optional(data.get("category")),
          catalogUnit: unit,
          servingGramsPerUnit,
          formCost: Number.isFinite(formCost) && formCost >= 0 ? formCost : 0,
          lookupUsed: data.get("lookupUsed") === "true",
        });
        const created = (await createIngredient({
          name,
          unit: unit as (typeof UNITS)[number],
          costPerUnit: resolvedCost.costPerUnit,
          category: optional(data.get("category")),
          allergens: allergens.length ? allergens : undefined,
          isGlutenFree,
        })) as { docId: string };
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
      } else if (section === "dishes") {
        const name = String(data.get("name") ?? "").trim();
        const duplicate = culinaryCanonicalMatcher.likelyDuplicate(
          dishes ?? [],
          name,
        );
        if (
          duplicate &&
          !(await prompt.askConfirm({
            title: "Possible duplicate dish",
            description: `A dish named "${duplicate.name}" already exists (edition ${duplicate.editionNumber ?? 1}). Use dish detail → Create new edition for a versioned edition.`,
            confirmLabel: "Create anyway",
          }))
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
        const name = String(data.get("name") ?? "").trim();
        const minGuests = Number(data.get("minGuests"));
        const maxGuests = Number(data.get("maxGuests"));

        // Validate guest range before submission (matches Manifest constraint wording)
        if (minGuests > 0 && maxGuests > 0 && minGuests > maxGuests) {
          throw new Error(
            "Menu max guests must be zero (unlimited) or at least min guests",
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
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-ink-2">
            Browse and open {section} — then drill into the record that needs
            work.
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
      {host}
      {successToastHost}
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
          <h2 className="text-lg font-semibold text-ink">
            All {section}
            <span className="ml-2 text-sm font-medium text-ink-2">
              {formatCountNoun(rows.length, "record")}
            </span>
          </h2>
        </div>
        <div className="component-toolbar">
          <label className="component-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${section} by name or category…`}
              aria-label={`Search ${section}`}
            />
          </label>
          {section === "dishes" ||
          section === "ingredients" ||
          section === "components" ? (
            <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
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
                <h3 className="text-xl font-semibold text-ink">
                  No {section} yet
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
