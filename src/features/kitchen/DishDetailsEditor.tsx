import { useState, type FormEvent } from "react";
import {
  useDishClassifyAllergens,
  useDishClassifyKind,
  useDishReviseDetails,
  useDishSaveServiceInstructions,
  useDishUpdatePortioning,
} from "../../lib/manifest-convex-react";
import {
  CULINARY_ALLERGENS,
  type CulinaryAllergenCode,
} from "./CulinaryAllergenVocabulary";
import { unitOptionsFor } from "./import/UnitOfMeasureMapper";

// One "Edit dish" section for the catalog record itself. Each group is its own
// command, so each group keeps its own Save button. Every field of a command is
// sent on save (an omitted optional param clears the stored value).

export type DishDetailsTarget = {
  _id: string;
  version: number;
  name: string;
  description?: string | null;
  category?: string | null;
  course?: string | null;
  serviceStyle?: string | null;
  dietaryTags?: readonly string[] | null;
  portionSize: number;
  portionUnit: string;
  serviceInstructions?: string | null;
  serviceInstructionsSource?: string | null;
  allergenSummary?: readonly string[] | null;
  kind?: string | null;
  status: string;
};

type SaveKey =
  "details" | "portioning" | "service" | "allergens" | "kind" | null;

const DISH_KINDS = [
  { value: "food", label: "Food" },
  { value: "supply", label: "Supply (plasticware, place settings)" },
  { value: "service", label: "Service" },
  { value: "package", label: "Package" },
] as const;

type DishKind = (typeof DISH_KINDS)[number]["value"];

function isDishKind(value: string): value is DishKind {
  return DISH_KINDS.some((entry) => entry.value === value);
}

function isAllergenCode(value: string): value is CulinaryAllergenCode {
  return CULINARY_ALLERGENS.some((entry) => entry.code === value);
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function DishDetailsEditor({
  dish,
  onFailure,
}: Readonly<{
  dish: DishDetailsTarget;
  onFailure: (error: unknown) => void;
}>) {
  const reviseDetails = useDishReviseDetails();
  const updatePortioning = useDishUpdatePortioning();
  const saveServiceInstructions = useDishSaveServiceInstructions();
  const classifyAllergens = useDishClassifyAllergens();
  const classifyKind = useDishClassifyKind();

  const [name, setName] = useState(dish.name);
  const [description, setDescription] = useState(dish.description ?? "");
  const [category, setCategory] = useState(dish.category ?? "");
  const [course, setCourse] = useState(dish.course ?? "");
  const [serviceStyle, setServiceStyle] = useState(dish.serviceStyle ?? "");
  const [dietaryTags, setDietaryTags] = useState(
    (dish.dietaryTags ?? []).join(", "),
  );
  const [portionSize, setPortionSize] = useState(String(dish.portionSize));
  const [portionUnit, setPortionUnit] = useState(String(dish.portionUnit));
  const [instructions, setInstructions] = useState(
    dish.serviceInstructions ?? "",
  );
  // Provenance of the guidance. A person typing it here is the source, so the
  // field starts at "manual" and stays editable for imported text.
  const [instructionsSource, setInstructionsSource] = useState(
    dish.serviceInstructionsSource ?? "manual",
  );
  const [allergens, setAllergens] = useState<CulinaryAllergenCode[]>(
    (dish.allergenSummary ?? []).filter(isAllergenCode),
  );
  const [kind, setKind] = useState(dish.kind ?? "food");
  const [saving, setSaving] = useState<SaveKey>(null);

  // reviseDetails, updatePortioning, saveServiceInstructions and
  // classifyAllergens all guard `status == "active"`. classifyKind does not.
  const isActive = dish.status === "active";
  const lockedTitle = isActive
    ? undefined
    : "Reinstate this dish before editing it";

  const args = { docId: dish._id, version: dish.version };

  const run = async (
    key: Exclude<SaveKey, null>,
    work: () => Promise<void>,
  ) => {
    setSaving(key);
    onFailure(null);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(null);
    }
  };

  const onSaveDetails = (event: FormEvent) => {
    event.preventDefault();
    if (!isActive) return;
    void run("details", async () => {
      await reviseDetails({
        ...args,
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        course: course.trim() || undefined,
        serviceStyle: serviceStyle.trim() || undefined,
        dietaryTags: parseTags(dietaryTags),
      });
    });
  };

  const onSavePortioning = (event: FormEvent) => {
    event.preventDefault();
    if (!isActive) return;
    const size = Number(portionSize);
    if (!Number.isFinite(size) || size <= 0) return;
    void run("portioning", async () => {
      await updatePortioning({ ...args, portionSize: size, portionUnit });
    });
  };

  const onSaveService = (event: FormEvent) => {
    event.preventDefault();
    if (!isActive) return;
    const source = instructionsSource.trim();
    if (!source) return;
    void run("service", async () => {
      await saveServiceInstructions({
        ...args,
        instructions: instructions.trim(),
        source,
      });
    });
  };

  const onSaveAllergens = () => {
    if (!isActive) return;
    void run("allergens", async () => {
      await classifyAllergens({ ...args, allergenSummary: allergens });
    });
  };

  const onSaveKind = () => {
    if (!isDishKind(kind)) return;
    void run("kind", async () => {
      await classifyKind({ ...args, kind });
    });
  };

  return (
    <section className="culinary-section" aria-labelledby="dish-edit-heading">
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Catalog record</p>
          <h2 id="dish-edit-heading">Edit dish</h2>
        </div>
        {isActive ? null : <span>Reinstate to edit</span>}
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSaveDetails}>
        <label className="field-label sm:col-span-2">
          <span>Name</span>
          <input
            className="input"
            value={name}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="field-label sm:col-span-2">
          <span>Description (customer facing)</span>
          <textarea
            className="input"
            rows={2}
            value={description}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Category</span>
          <input
            className="input"
            value={category}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Apps, entrees, desserts…"
          />
        </label>
        <label className="field-label">
          <span>Course</span>
          <input
            className="input"
            value={course}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setCourse(event.target.value)}
            placeholder="First, main, dessert…"
          />
        </label>
        <label className="field-label">
          <span>Service style</span>
          <input
            className="input"
            value={serviceStyle}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setServiceStyle(event.target.value)}
            placeholder="Plated, buffet, passed…"
          />
        </label>
        <label className="field-label">
          <span>Dietary tags (comma separated)</span>
          <input
            className="input"
            value={dietaryTags}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setDietaryTags(event.target.value)}
            placeholder="vegetarian, gluten free"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isActive || saving != null}
            title={lockedTitle}
          >
            {saving === "details" ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <form
        className="mt-6 grid gap-3 sm:grid-cols-2"
        onSubmit={onSavePortioning}
      >
        <div className="culinary-section-heading sm:col-span-2">
          <h3 className="text-lg font-semibold text-ink">Portioning</h3>
        </div>
        <label className="field-label">
          <span>Portion size</span>
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            value={portionSize}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setPortionSize(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Portion unit</span>
          <select
            className="input"
            value={portionUnit}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setPortionUnit(event.target.value)}
          >
            {unitOptionsFor(String(dish.portionUnit)).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isActive || saving != null}
            title={lockedTitle}
          >
            {saving === "portioning" ? "Saving…" : "Save portioning"}
          </button>
        </div>
      </form>

      <form className="mt-6 grid gap-3" onSubmit={onSaveService}>
        <div className="culinary-section-heading">
          <h3 className="text-lg font-semibold text-ink">
            Service instructions
          </h3>
          <span>Reusable guidance, not event-specific notes</span>
        </div>
        <label className="field-label">
          <span>Instructions</span>
          <textarea
            className="input"
            rows={4}
            value={instructions}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Serve in the chafer on low. Refill from the backup pan."
          />
        </label>
        <label className="field-label">
          <span>Source (where this guidance came from)</span>
          <input
            className="input"
            value={instructionsSource}
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onChange={(event) => setInstructionsSource(event.target.value)}
            required
          />
        </label>
        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              !isActive || saving != null || !instructionsSource.trim().length
            }
            title={lockedTitle}
          >
            {saving === "service" ? "Saving…" : "Save service instructions"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="culinary-section-heading">
          <h3 className="text-lg font-semibold text-ink">Allergens</h3>
          <span>{allergens.length} flagged</span>
        </div>
        <fieldset className="mt-2 grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">Allergens declared on this dish</legend>
          {CULINARY_ALLERGENS.map((allergen) => (
            <label
              key={allergen.code}
              className="flex items-center gap-2 text-base"
            >
              <input
                type="checkbox"
                checked={allergens.includes(allergen.code)}
                disabled={!isActive || saving != null}
                title={lockedTitle}
                onChange={(event) =>
                  setAllergens((current) =>
                    event.target.checked
                      ? [...current, allergen.code]
                      : current.filter((code) => code !== allergen.code),
                  )
                }
              />
              <span>{allergen.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isActive || saving != null}
            title={lockedTitle}
            onClick={onSaveAllergens}
          >
            {saving === "allergens" ? "Saving…" : "Save allergens"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="culinary-section-heading">
          <h3 className="text-lg font-semibold text-ink">Kind</h3>
          <span>Supplies and services never enter food purchasing</span>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="field-label">
            <span>This dish row is</span>
            <select
              className="input"
              value={kind}
              disabled={saving != null}
              onChange={(event) => setKind(event.target.value)}
            >
              {DISH_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving != null}
            onClick={onSaveKind}
          >
            {saving === "kind" ? "Saving…" : "Save kind"}
          </button>
        </div>
      </div>
    </section>
  );
}
