import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateDish,
  useCreateDishContainer,
  useDishMakeVersionOf,
  useDishSaveServiceInstructions,
  useDishSetFinishTiming,
  useListDishContainer,
} from "../../lib/manifest-convex-react";
import { useDishFacets, useDishSearch } from "../../lib/useDishesByIds";
import { useActionPrompt } from "../../ui/action-prompt";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import {
  FINISH_TIMINGS,
  type FinishTiming,
  mainDishRows,
  versionsByMain,
  VERSION_NAME_SUGGESTIONS,
} from "./dishVersions";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";
import { dishPath } from "./kitchenRoutes";
import { SERVICE_METHODS } from "./DishContainerEditForm";
import {
  dietTag,
  findDishMatches,
  menuCategory,
  valuesByUse,
} from "./newDishMatch";

// When a dish is finished is part of the dish; service style is set on the
// event, not here (Ryan 2026-10-04).
const BASE_DIETARY = [
  "vegan",
  "vegetarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
];
/** Shown only when the kitchen already uses them. */
const EXTRA_DIETARY = ["halal", "kosher"];

/** How the container goes out, from when the dish is finished. */
function timingLabel(timing: string) {
  return FINISH_TIMINGS.find((entry) => entry.value === timing)?.label ?? "";
}

function containerMethodFor(timing: string) {
  return timing === "finish_at_event" ? "cooked_on_site" : "cooked_at_kitchen";
}

type Dish = NonNullable<ReturnType<typeof useDishSearch>>[number];

function createdIdOf(created: unknown): string | undefined {
  return typeof created === "string"
    ? created
    : (created as { docId?: string } | undefined)?.docId;
}

function Chip({
  label,
  pressed,
  onClick,
  disabled,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        pressed
          ? "border-accent bg-accent-soft font-medium text-ink"
          : "border-line-2 bg-panel text-ink-2 hover:border-line hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/** Pick one of the most-used values, or type any other (a new one is fine). */
function PickOrAdd({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  chips = 5,
  placeholder = "Pick or type a new one",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  chips?: number;
  placeholder?: string;
}) {
  const top = options.slice(0, chips);
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        list={`${id}-list`}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={`${id}-list`}>
        {options.slice(0, 200).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {top.length ? (
        <div className="flex flex-wrap gap-1.5">
          {top.map((option) => (
            <Chip
              key={option}
              label={option}
              disabled={disabled}
              pressed={value.trim().toLowerCase() === option.toLowerCase()}
              onClick={() =>
                onChange(
                  value.trim().toLowerCase() === option.toLowerCase()
                    ? ""
                    : option,
                )
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The "New dish" panel (Ryan 2026-10-04). Name first, with a live check for
 * the same food already on file; adding it as a version (a tab of that dish)
 * is one tap.
 */
export function NewDishPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const allContainers = useListDishContainer();
  const createDish = useCreateDish();
  const makeVersionOf = useDishMakeVersionOf();
  const setFinishTiming = useDishSetFinishTiming();
  const saveServiceInstructions = useDishSaveServiceInstructions();
  const defineContainer = useCreateDishContainer();
  const { prompt, host } = useActionPrompt();
  const [name, setName] = useState("");
  // Dishes named like the one being typed (the duplicate check) and the
  // newest dishes' categories, courses and tags (the suggestions); never
  // the whole catalog.
  const typedName = name.trim();
  const allDishes = useDishSearch(typedName, typedName.length >= 3);
  const facets = useDishFacets();
  const [timing, setTiming] = useState<FinishTiming | "">("");
  const [instructions, setInstructions] = useState("");
  const [containerName, setContainerName] = useState("");
  const [servingsPerContainer, setServingsPerContainer] = useState("25");
  const [containerMethod, setContainerMethod] = useState("");
  const [category, setCategory] = useState("");
  const [course, setCourse] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [portionSize, setPortionSize] = useState("1");
  const [portionUnit, setPortionUnit] = useState("each");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const live = useMemo(
    () =>
      (allDishes ?? []).filter(
        (dish) => dish.deletedAt == null && dish.mergedIntoDishId == null,
      ),
    [allDishes],
  );
  const mains = useMemo(() => mainDishRows(live), [live]);
  const versions = useMemo(() => versionsByMain(live), [live]);
  const options = useMemo(() => {
    const sample = facets ?? [];
    const usedTags = new Set(
      sample.flatMap((dish) => (dish.dietaryTags ?? []).map(dietTag)),
    );
    return {
      category: valuesByUse(sample.map((dish) => menuCategory(dish.category))),
      course: valuesByUse(sample.map((dish) => dish.course)),
      container: valuesByUse(
        (allContainers ?? [])
          .filter((row) => row.deletedAt == null)
          .map((row) => row.name),
      ),
      dietary: [
        ...BASE_DIETARY,
        ...EXTRA_DIETARY.filter((tag) => usedTags.has(tag)),
      ],
    };
  }, [facets, allContainers]);

  const matches = useMemo(() => findDishMatches(mains, name), [mains, name]);
  const sameFood = matches.find((match) => match.sameFood)?.dish;
  const method = containerMethod || containerMethodFor(timing);

  const versionWithLabel = (main: Dish, label: string) => {
    const wanted = label.trim().toLowerCase();
    if (main.versionLabel?.trim().toLowerCase() === wanted) return main;
    return (versions.get(main._id) ?? []).find(
      (version) => version.versionLabel?.trim().toLowerCase() === wanted,
    );
  };

  const run = async (work: () => Promise<void>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const addAsVersion = (main: Dish) =>
    void (async () => {
      const label =
        (
          await prompt.askFields({
            title: `Add a version of ${main.name}`,
            description:
              "A version is a tab on the dish: the same food made another way. Name the tab, for example Mini, Vegan or Finish at Event.",
            fields: [
              {
                name: "label",
                label: "Tab name",
                defaultValue: timingLabel(timing),
                suggestions: VERSION_NAME_SUGGESTIONS,
                required: true,
              },
            ],
            confirmLabel: "Add version",
          })
        )?.label?.trim() ?? "";
      if (!label) return;
      const existing = versionWithLabel(main, label);
      if (existing) {
        navigate(dishPath(existing._id));
        return;
      }
      await run(async () => {
        const created = await createDish({
          name: `${main.name} - ${label}`,
          portionSize: main.portionSize,
          portionUnit: main.portionUnit,
          description: main.description ?? undefined,
          category: main.category ?? undefined,
          course: main.course ?? undefined,
          serviceStyle: main.serviceStyle ?? undefined,
          dietaryTags: main.dietaryTags,
          allergenSummary: main.allergenSummary,
        });
        const createdId = createdIdOf(created);
        if (!createdId) return;
        await makeVersionOf({ docId: createdId, mainDishId: main._id, label });
        if (timing) {
          try {
            await setFinishTiming({ docId: createdId, timing });
          } catch {
            // It can be set next to the version tabs on the dish page.
          }
        }
        navigate(dishPath(createdId));
      });
    })();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      const size = Number(portionSize);
      const created = await createDish({
        name: trimmed,
        portionSize: Number.isFinite(size) && size > 0 ? size : 1,
        portionUnit,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        course: course.trim() || undefined,
        dietaryTags: dietary.length ? dietary : undefined,
      });
      const createdId = createdIdOf(created);
      if (!createdId) return;
      // The dish is saved. Each step below can be redone on the dish page,
      // so one that fails does not stop the others.
      if (timing) {
        try {
          await setFinishTiming({ docId: createdId, timing });
        } catch {
          // It can be set next to the version tabs on the dish page.
        }
      }
      if (instructions.trim()) {
        try {
          await saveServiceInstructions({
            docId: createdId,
            instructions: instructions.trim(),
            source: "manual",
          });
        } catch {
          // Serving instructions can be typed again on the dish page.
        }
      }
      if (containerName.trim()) {
        const servings = Math.round(Number(servingsPerContainer));
        try {
          await defineContainer({
            dishId: createdId,
            name: containerName.trim(),
            serviceMethod: method,
            servingsPerContainer:
              Number.isFinite(servings) && servings >= 1 ? servings : 1,
            baseQuantity: 0,
          });
        } catch {
          // The container can be added in the dish page's containers panel.
        }
      }
      // Ingredients, recipes and prep steps are added on the dish page.
      navigate(dishPath(createdId));
    });
  };

  const toggleDietary = (tag: string) =>
    setDietary((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );

  const sectionTitle = "text-sm font-semibold text-ink";

  return (
    <>
      {host}
      <form
        onSubmit={submit}
        className="culinary-create-form grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]"
        aria-label="New dish"
      >
        <div className="grid content-start gap-4">
          <div>
            <p className="eyebrow">New dish</p>
            <h2 className="font-display text-xl">Add a dish</h2>
            <p className="mt-1 text-sm text-ink-2">
              Start with the name. We check the dish list as you type so the
              same food is not added twice.
            </p>
          </div>
          {failure ? <CulinaryFailureBanner error={failure} /> : null}
          <div className="grid gap-1.5">
            <label htmlFor="new-dish-name" className={sectionTitle}>
              Dish name
            </label>
            <input
              id="new-dish-name"
              name="name"
              className="input text-base"
              required
              autoFocus
              autoComplete="off"
              disabled={busy}
              value={name}
              placeholder="For example Carne Asada Street Taco"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>

        {/* Beside the form on wide screens, under the name on phones. */}
        <aside className="grid content-start gap-3 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {name.trim().length >= 3 && allDishes === undefined ? (
            <p className="text-xs text-ink-3">Checking the dish list…</p>
          ) : null}
          {matches.length > 0 ? (
            <div
              className="rounded-sm border border-line bg-inset p-2"
              role="region"
              aria-label="Already on file"
            >
              <p className="px-1 pb-1 text-xs font-medium text-ink-2">
                {sameFood
                  ? "This dish is already on file"
                  : "Similar dishes already on file"}
              </p>
              <ul className="grid gap-1">
                {matches.map(({ dish, sameFood: same }) => (
                  <li
                    key={dish._id}
                    className="flex flex-wrap items-center gap-2 rounded-xs bg-panel px-2 py-1.5"
                  >
                    <span className="min-w-40 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {dish.name}
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {[
                          same ? "Same food" : null,
                          dish.category,
                          dish.versionCount
                            ? `${dish.versionCount} version${dish.versionCount === 1 ? "" : "s"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(dishPath(dish._id))}
                      >
                        Open it
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => addAsVersion(dish)}
                      >
                        Add as a version
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hidden rounded-sm border border-dashed border-line p-3 text-sm text-ink-3 lg:block">
              Dishes already on file show here as you type the name.
            </p>
          )}
        </aside>

        <div className="grid content-start gap-6">
          <fieldset className="grid gap-1.5" disabled={busy}>
            <legend className={`${sectionTitle} mb-0.5`}>
              When is it finished?
            </legend>
            <p className="text-xs text-ink-3">
              It can change how the dish is served and what is packed for it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="None"
                pressed={timing === ""}
                onClick={() => setTiming("")}
              />
              {FINISH_TIMINGS.map(({ value, label }) => (
                <Chip
                  key={value}
                  label={label}
                  pressed={timing === value}
                  onClick={() => setTiming(timing === value ? "" : value)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset
            className="grid gap-3 rounded-sm border border-line p-3"
            disabled={busy}
          >
            <legend className={`${sectionTitle} px-1`}>How it’s served</legend>
            <label className="field-label">
              Serving instructions
              <textarea
                className="input min-h-20 py-2"
                placeholder="For example: Set on the buffet in a chafer. Top with cilantro and lime just before guests arrive."
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>
            <PickOrAdd
              id="new-dish-container"
              label="Container"
              value={containerName}
              onChange={setContainerName}
              options={options.container}
              chips={6}
              placeholder="For example Full hotel pan"
            />
            {containerName.trim() ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field-label">
                  Servings per container
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={servingsPerContainer}
                    onChange={(event) =>
                      setServingsPerContainer(event.target.value)
                    }
                  />
                </label>
                <label className="field-label">
                  Goes out
                  <select
                    className="input"
                    value={method}
                    onChange={(event) => setContainerMethod(event.target.value)}
                  >
                    {SERVICE_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <PickOrAdd
              id="new-dish-category"
              label="Category"
              value={category}
              onChange={setCategory}
              options={options.category}
              chips={8}
              disabled={busy}
            />
            <PickOrAdd
              id="new-dish-course"
              label="Course"
              value={course}
              onChange={setCourse}
              options={options.course}
              disabled={busy}
            />
          </div>

          <fieldset className="grid gap-1.5" disabled={busy}>
            <legend className={`${sectionTitle} mb-1.5`}>Dietary</legend>
            <div className="flex flex-wrap gap-1.5">
              {options.dietary.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  pressed={dietary.includes(tag)}
                  onClick={() => toggleDietary(tag)}
                />
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <span id="new-dish-portion" className={sectionTitle}>
              Portion per guest
            </span>
            <div
              className="flex items-center gap-2"
              role="group"
              aria-labelledby="new-dish-portion"
            >
              <input
                aria-label="Portion amount"
                className="input w-24"
                type="number"
                min={0.01}
                step="0.01"
                required
                disabled={busy}
                value={portionSize}
                onChange={(event) => setPortionSize(event.target.value)}
              />
              <select
                aria-label="Portion unit"
                className="input w-36"
                disabled={busy}
                value={portionUnit}
                onChange={(event) => setPortionUnit(event.target.value)}
              >
                {SELECTABLE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="rounded-sm border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">
              More details
            </summary>
            <label className="field-label mt-2">
              Description
              <textarea
                className="input min-h-20 py-2"
                disabled={busy}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </details>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <p className="mr-auto text-xs text-ink-3">
              Next you add the ingredients, recipes and prep steps.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className={`btn ${sameFood ? "btn-secondary" : "btn-primary"}`}
              disabled={busy || !name.trim()}
            >
              {busy
                ? "Saving…"
                : sameFood
                  ? "Create a separate dish anyway"
                  : "Create dish"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
