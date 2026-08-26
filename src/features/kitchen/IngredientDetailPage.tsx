import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useIngredientLookupApplyToIngredient } from "../../lib/ingredientLookupClient";
import {
  useGetIngredient,
  useIngredientPurge,
  useIngredientReinstate,
  useIngredientSetPreferredVendors,
  useListIngredient,
  useListIngredientPriceObservation,
  useListComponent,
  useListComponentIngredient,
  useListVendor,
} from "../../lib/manifest-convex-react";
import { formatCountNoun, formatMoneyExact } from "../../lib/format";
import { useTrackRecent } from "../../lib/recents";
import { useRouteRecord } from "../../lib/routeRecord";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { IngredientPrimaryImageUploader } from "../attachments/IngredientPrimaryImageUploader";
import { KitchenBookNav } from "./KitchenBookNav";
import {
  latestPriceByIngredient,
  resolveIngredientPrice,
} from "./IngredientPriceHistory";
import { IngredientPriceTrendPanel } from "./IngredientPriceTrendPanel";
import { VendorPriceComparisonPanel } from "./VendorPriceComparisonPanel";
import { IngredientCostingEditor } from "./IngredientCostingEditor";
import { IngredientDetailsEditor } from "./IngredientDetailsEditor";
import { IngredientNutritionEditor } from "./IngredientNutritionEditor";
import { IngredientSubstitutionEditor } from "./IngredientSubstitutionEditor";
import { kitchenCatalogPath } from "./kitchenRoutes";
import { IngredientDatabaseLookup } from "./lookup/IngredientDatabaseLookup";
import type { IngredientAutofillProfile } from "./lookup/ExternalIngredientProfile";

function nutritionPayload(nutrition: IngredientAutofillProfile["nutrition"]) {
  const out: Record<string, number> = {};
  const entries: [
    keyof IngredientAutofillProfile["nutrition"],
    number | null | undefined,
  ][] = [
    ["caloriesPerUnit", nutrition.caloriesPerUnit],
    ["proteinGramsPerUnit", nutrition.proteinGramsPerUnit],
    ["carbsGramsPerUnit", nutrition.carbsGramsPerUnit],
    ["fatGramsPerUnit", nutrition.fatGramsPerUnit],
    ["fiberGramsPerUnit", nutrition.fiberGramsPerUnit],
    ["sugarGramsPerUnit", nutrition.sugarGramsPerUnit],
    ["sodiumMgPerUnit", nutrition.sodiumMgPerUnit],
    ["calciumMgPerUnit", nutrition.calciumMgPerUnit],
    ["ironMgPerUnit", nutrition.ironMgPerUnit],
  ];
  for (const [field, value] of entries) {
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 0) {
      out[field] = Number(value);
    }
  }
  return out as {
    caloriesPerUnit?: number;
    proteinGramsPerUnit?: number;
    carbsGramsPerUnit?: number;
    fatGramsPerUnit?: number;
    fiberGramsPerUnit?: number;
    sugarGramsPerUnit?: number;
    sodiumMgPerUnit?: number;
    calciumMgPerUnit?: number;
    ironMgPerUnit?: number;
  };
}

const policy = new CulinaryLifecyclePolicy();

type PreferredVendor = {
  _id: string;
  name: string;
  status: string;
  deletedAt?: number | null;
};

export function PreferredVendorRankingEditor({
  initialPreferredVendorIds,
  vendors,
  onSave,
  onFailure,
}: {
  initialPreferredVendorIds: string[];
  vendors: PreferredVendor[] | undefined;
  onSave: (preferredVendorIds: string[]) => Promise<void>;
  onFailure: (error: unknown) => void;
}) {
  const [orderedIds, setOrderedIds] = useState<string[]>(
    initialPreferredVendorIds,
  );
  const [candidateId, setCandidateId] = useState("");
  const [saving, setSaving] = useState(false);
  const vendorById = new Map(
    (vendors ?? []).map((vendor) => [vendor._id, vendor]),
  );
  const availableVendors = (vendors ?? []).filter(
    (vendor) =>
      vendor.deletedAt == null &&
      vendor.status === "active" &&
      !orderedIds.includes(vendor._id),
  );
  const dirty =
    orderedIds.join("\u0000") !== initialPreferredVendorIds.join("\u0000");

  const move = (index: number, offset: -1 | 1) => {
    setOrderedIds((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    onFailure(null);
    try {
      await onSave(orderedIds);
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="culinary-section"
      aria-labelledby="preferred-vendors-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Purchasing defaults</p>
          <h2 id="preferred-vendors-heading">Preferred vendors</h2>
        </div>
        <span>{orderedIds.length} ranked</span>
      </div>
      <p className="max-w-160 text-base text-ink-2">
        Weekly purchase drafts use the first choice. Lower-ranked vendors stay
        visible as quick alternatives for the buyer.
      </p>

      {orderedIds.length ? (
        <ol className="mt-4 space-y-2" aria-label="Preferred vendor priority">
          {orderedIds.map((vendorId, index) => {
            const vendor = vendorById.get(vendorId);
            return (
              <li
                key={vendorId}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-panel px-4 py-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-semibold text-panel">
                  {index + 1}
                </span>
                <div className="min-w-48 flex-1">
                  <strong>{vendor?.name ?? "Unavailable vendor"}</strong>
                  <span className="ml-2 text-xs text-ink-3">
                    {index === 0 ? "Primary default" : "Fallback"}
                  </span>
                </div>
                {vendor ? <StatusChip status={vendor.status} /> : null}
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={saving || index === 0}
                    aria-label={`Move ${vendor?.name ?? "vendor"} up`}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={saving || index === orderedIds.length - 1}
                    aria-label={`Move ${vendor?.name ?? "vendor"} down`}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={saving}
                    onClick={() =>
                      setOrderedIds((current) =>
                        current.filter((id) => id !== vendorId),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="document-empty mt-4">
          <p>No preferred vendors yet.</p>
          <span>Purchasing will use the tenant-wide default vendor.</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm text-ink-2">
          Add vendor
          <select
            className="input"
            value={candidateId}
            disabled={
              saving || vendors === undefined || !availableVendors.length
            }
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">
              {vendors === undefined
                ? "Loading vendors…"
                : availableVendors.length
                  ? "Choose an active vendor"
                  : "All active vendors are ranked"}
            </option>
            {availableVendors.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving || !candidateId}
          onClick={() => {
            setOrderedIds((current) => [...current, candidateId]);
            setCandidateId("");
          }}
        >
          Add to ranking
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </section>
  );
}

function PreferredVendorEditor({
  ingredientId,
  version,
  preferredVendorIds,
  legacyPreferredVendorId,
  vendors,
  onFailure,
}: {
  ingredientId: string;
  version: number;
  preferredVendorIds?: string[] | null;
  legacyPreferredVendorId?: string | null;
  vendors: PreferredVendor[] | undefined;
  onFailure: (error: unknown) => void;
}) {
  const savePreferences = useIngredientSetPreferredVendors();
  const initialPreferredVendorIds = preferredVendorIds?.length
    ? preferredVendorIds
    : legacyPreferredVendorId
      ? [legacyPreferredVendorId]
      : [];

  return (
    <PreferredVendorRankingEditor
      initialPreferredVendorIds={initialPreferredVendorIds}
      vendors={vendors}
      onFailure={onFailure}
      onSave={(orderedIds) =>
        savePreferences({
          docId: ingredientId,
          version,
          preferredVendorIds: orderedIds,
          preferredVendorId: orderedIds[0],
        })
      }
    />
  );
}

export function IngredientDetailPage() {
  const { id } = useParams();
  const ingredient = useRouteRecord(useGetIngredient, id);
  useTrackRecent("Ingredient", ingredient?.name);
  const components = useListComponent();
  const lines = useListComponentIngredient();
  const ingredients = useListIngredient();
  const vendors = useListVendor();
  const priceObservations = useListIngredientPriceObservation();
  const purge = useIngredientPurge();
  const reinstate = useIngredientReinstate();
  const applyLookup = useIngredientLookupApplyToIngredient();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  if (!id) return <ErrorState title="Ingredient not found" />;
  if (ingredient === undefined) {
    return (
      <div className="culinary-document culinary-document-compact space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (ingredient === null || ingredient.deletedAt != null) {
    return (
      <ErrorState
        title="Ingredient not found"
        detail="This ingredient is unavailable or no longer exists."
      />
    );
  }

  const componentUses = (lines ?? [])
    .filter(
      (line) => line.deletedAt == null && line.ingredientId === ingredient._id,
    )
    .map((line) => ({
      line,
      component: (components ?? []).find(
        (component) => component._id === line.componentId,
      ),
    }))
    .filter((entry) => entry.component && entry.component.deletedAt == null);

  const actions = policy.ingredientActions(
    String(ingredient.status),
    ingredient.deletedAt,
    { includeRestore: true },
  );
  const ingredientPrices = (priceObservations ?? []).filter(
    (observation) =>
      observation.deletedAt == null &&
      observation.ingredientId === ingredient._id,
  );
  const latestPrice = latestPriceByIngredient(ingredientPrices).get(
    ingredient._id,
  );
  const resolvedPrice = resolveIngredientPrice(
    {
      id: ingredient._id,
      unit: ingredient.unit,
      costPerUnit: ingredient.costPerUnit,
    },
    latestPrice,
  );

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
      <Link
        to={kitchenCatalogPath("ingredients")}
        className="culinary-studio-back"
      >
        ← Ingredient index
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {ingredient.status === "active" ? (
        <div className="mt-4">
          <IngredientDatabaseLookup
            disabled={busy != null}
            label="Update from food database"
            onApply={async (profile: IngredientAutofillProfile) => {
              setFailure(null);
              setBusy("lookup");
              try {
                await applyLookup({
                  docId: ingredient._id,
                  profile: {
                    name: profile.name,
                    unit: profile.unit,
                    category: profile.category,
                    allergens: profile.allergens,
                    isGlutenFree: profile.isGlutenFree,
                    nutrition: nutritionPayload(profile.nutrition),
                  },
                });
              } catch (error) {
                setFailure(error);
                throw error;
              } finally {
                setBusy(null);
              }
            }}
          />
        </div>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Ingredient · Edition {ingredient.version}</p>
            <h1 className="culinary-title-compact">{ingredient.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={() => {
                  void run(action.key, async () => {
                    const args = {
                      docId: ingredient._id,
                      version: ingredient.version,
                    };
                    if (action.key === "purge") await purge(args);
                    if (action.key === "reinstate") await reinstate(args);
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
              <StatusChip status={String(ingredient.status)} />
            </dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{String(ingredient.unit)}</dd>
          </div>
          <div>
            <dt>
              {latestPrice ? "Confirmed cost / unit" : "Catalog cost / unit"}
            </dt>
            <dd>
              {formatMoneyExact(resolvedPrice.costPerUnit)} /{" "}
              {resolvedPrice.unit}
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{ingredient.category || "—"}</dd>
          </div>
          <div>
            <dt>Allergens</dt>
            <dd>
              {ingredient.isGlutenFree ? (
                <span className="chip border-ok/40 bg-ok-soft text-ok mr-2">
                  Gluten free
                </span>
              ) : null}
              {(ingredient.allergens ?? []).length
                ? (ingredient.allergens ?? []).join(", ")
                : ingredient.isGlutenFree
                  ? "None flagged"
                  : "None recorded"}
            </dd>
          </div>
        </dl>
      </header>

      {ingredient.status === "active" ? (
        <section className="culinary-section">
          <div className="culinary-section-heading">
            <h2>Primary image</h2>
          </div>
          <IngredientPrimaryImageUploader
            ingredientId={ingredient._id}
            ingredientVersion={ingredient.version}
            ingredientName={ingredient.name}
            storageId={ingredient.primaryImageStorageId}
            onError={setFailure}
          />
        </section>
      ) : null}

      <IngredientDetailsEditor
        key={`details:${ingredient._id}:${ingredient.version}`}
        ingredient={ingredient}
        onFailure={setFailure}
      />

      <IngredientCostingEditor
        key={`costing:${ingredient._id}:${ingredient.version}`}
        ingredient={ingredient}
        onFailure={setFailure}
      />

      <IngredientNutritionEditor
        key={`nutrition:${ingredient._id}:${ingredient.version}`}
        ingredient={ingredient}
        onFailure={setFailure}
      />

      <IngredientSubstitutionEditor
        key={`substitutes:${ingredient._id}:${ingredient.version}`}
        ingredient={ingredient}
        ingredients={ingredients}
        onFailure={setFailure}
      />

      <PreferredVendorEditor
        key={`${ingredient._id}:${ingredient.version}`}
        ingredientId={ingredient._id}
        version={ingredient.version}
        preferredVendorIds={ingredient.preferredVendorIds}
        legacyPreferredVendorId={ingredient.preferredVendorId}
        vendors={vendors}
        onFailure={setFailure}
      />

      <VendorPriceComparisonPanel
        observations={ingredientPrices}
        vendors={vendors}
      />

      <IngredientPriceTrendPanel
        observations={ingredientPrices}
        vendors={vendors}
        loading={priceObservations === undefined || vendors === undefined}
      />

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Component uses</h2>
          <span>{formatCountNoun(componentUses.length, "component")}</span>
        </div>
        {componentUses.length ? (
          <ul className="ingredient-list">
            {componentUses.map(({ line, component }) => (
              <li key={line._id}>
                <strong>
                  {line.quantity} {String(line.unit)}
                </strong>
                <CulinaryEntityLink kind="component" id={component!._id}>
                  {component!.name}
                </CulinaryEntityLink>
                <span>{line.prepNotes || "No preparation note"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No components use this ingredient yet.</p>
          </div>
        )}
      </section>
    </article>
  );
}
