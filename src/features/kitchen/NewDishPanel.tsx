import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateDish,
  useDishLabelVersion,
  useDishMakeVersionOf,
} from "../../lib/manifest-convex-react";
import { useWholeDishList } from "../../lib/useDishesByIds";
import { useActionPrompt } from "../../ui/action-prompt";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import {
  mainDishRows,
  versionsByMain,
  VERSION_NAME_SUGGESTIONS,
} from "./dishVersions";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";
import { dishPath } from "./kitchenRoutes";
import { findDishMatches, valuesByUse } from "./newDishMatch";

const BASE_DIETARY = [
  "vegan",
  "vegetarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
];

type Dish = NonNullable<ReturnType<typeof useWholeDishList>>[number];

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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  const top = options.slice(0, 5);
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
        placeholder="Pick or type a new one"
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
 * the same food already on file; adding it as a version of that dish is one
 * tap. Everything else is picked from what the kitchen already uses.
 */
export function NewDishPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const allDishes = useWholeDishList();
  const createDish = useCreateDish();
  const makeVersionOf = useDishMakeVersionOf();
  const labelVersion = useDishLabelVersion();
  const { prompt, host } = useActionPrompt();
  const [name, setName] = useState("");
  const [finish, setFinish] = useState("");
  const [category, setCategory] = useState("");
  const [course, setCourse] = useState("");
  const [serviceStyle, setServiceStyle] = useState("");
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
  const options = useMemo(
    () => ({
      category: valuesByUse(live.map((dish) => dish.category)),
      course: valuesByUse(live.map((dish) => dish.course)),
      serviceStyle: valuesByUse(live.map((dish) => dish.serviceStyle)),
      dietary: valuesByUse(live.flatMap((dish) => dish.dietaryTags ?? [])),
    }),
    [live],
  );
  const dietaryChoices = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [...BASE_DIETARY, ...options.dietary.slice(0, 8)]) {
      if (seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase());
      // Keep the kitchen's own spelling of a common tag.
      out.push(
        options.dietary.find((t) => t.toLowerCase() === tag.toLowerCase()) ??
          tag,
      );
    }
    for (const tag of dietary) if (!seen.has(tag.toLowerCase())) out.push(tag);
    return out;
  }, [options.dietary, dietary]);

  const matches = useMemo(() => findDishMatches(mains, name), [mains, name]);
  const sameFood = matches.find((match) => match.sameFood)?.dish;
  const steerToVersion = Boolean(sameFood && finish);

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
        finish ||
        ((
          await prompt.askFields({
            title: `Add a version of ${main.name}`,
            description:
              "Name the way this dish is served, for example Finish at Kitchen or Drop Off.",
            fields: [
              {
                name: "label",
                label: "Version name",
                suggestions: VERSION_NAME_SUGGESTIONS,
                required: true,
              },
            ],
            confirmLabel: "Add version",
          })
        )?.label?.trim() ??
          "");
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
        serviceStyle: serviceStyle.trim() || undefined,
        dietaryTags: dietary.length ? dietary : undefined,
      });
      const createdId = createdIdOf(created);
      if (!createdId) return;
      if (finish) {
        try {
          // Its tab reads "Drop Off" (not "Main") once versions are added.
          await labelVersion({ docId: createdId, label: finish });
        } catch {
          // The dish is saved; the tab name can be set on the dish page.
        }
      }
      // Ingredients, recipes and prep steps are added on the dish page.
      navigate(dishPath(createdId));
    });
  };

  const toggleDietary = (tag: string) =>
    setDietary((current) =>
      current.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...current, tag],
    );

  return (
    <>
      {host}
      <form
        onSubmit={submit}
        className="culinary-create-form mx-auto grid max-w-2xl gap-5"
        aria-label="New dish"
      >
        <div>
          <p className="eyebrow">New dish</p>
          <h2 className="font-display text-xl">Add a dish</h2>
          <p className="mt-1 text-sm text-ink-2">
            Start with the name. We check the dish list as you type so the same
            food is not added twice.
          </p>
        </div>
        {failure ? <CulinaryFailureBanner error={failure} /> : null}

        <div className="grid gap-1.5">
          <label
            htmlFor="new-dish-name"
            className="text-sm font-medium text-ink"
          >
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
          {name.trim().length >= 3 && allDishes === undefined ? (
            <p className="text-xs text-ink-3">Checking the dish list…</p>
          ) : null}
          {matches.length > 0 && !steerToVersion ? (
            <div
              className="mt-1 rounded-sm border border-line bg-inset p-2"
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
                    <span className="min-w-0 flex-1">
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
          ) : null}
        </div>

        <fieldset className="grid gap-1.5" disabled={busy}>
          <legend className="mb-1.5 text-sm font-medium text-ink">
            How is it served?
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              label="None"
              pressed={finish === ""}
              onClick={() => setFinish("")}
            />
            {VERSION_NAME_SUGGESTIONS.map((label) => (
              <Chip
                key={label}
                label={label}
                pressed={finish === label}
                onClick={() => setFinish(finish === label ? "" : label)}
              />
            ))}
          </div>
        </fieldset>

        {steerToVersion && sameFood ? (
          <div
            className="grid gap-2 rounded-sm border border-accent bg-accent-soft p-3"
            role="region"
            aria-label="Add as a version"
          >
            <p className="text-sm text-ink">
              <strong>{sameFood.name}</strong> is already on file. Add “{finish}
              ” as a version of it, so it shares the same recipe.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => addAsVersion(sameFood)}
              >
                {versionWithLabel(sameFood, finish)
                  ? `Open its ${finish} version`
                  : `Add ${finish} version`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate(dishPath(sameFood._id))}
              >
                Open {sameFood.name}
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PickOrAdd
              id="new-dish-category"
              label="Category"
              value={category}
              onChange={setCategory}
              options={options.category}
              disabled={busy}
            />
          </div>
          <PickOrAdd
            id="new-dish-course"
            label="Course"
            value={course}
            onChange={setCourse}
            options={options.course}
            disabled={busy}
          />
          <PickOrAdd
            id="new-dish-service-style"
            label="Service style"
            value={serviceStyle}
            onChange={setServiceStyle}
            options={options.serviceStyle}
            disabled={busy}
          />
        </div>

        <fieldset className="grid gap-1.5" disabled={busy}>
          <legend className="mb-1.5 text-sm font-medium text-ink">
            Dietary
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {dietaryChoices.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                pressed={dietary.some(
                  (t) => t.toLowerCase() === tag.toLowerCase(),
                )}
                onClick={() => toggleDietary(tag)}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <span id="new-dish-portion" className="text-sm font-medium text-ink">
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
                  {unit}
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
      </form>
    </>
  );
}
