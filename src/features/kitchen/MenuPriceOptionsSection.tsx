import { useState, type FormEvent } from "react";
import { useMenuSetPricingOptions } from "../../lib/manifest-convex-react";
import {
  hasMenuPricingOptions,
  readMenuPricingOptions,
  type MenuAddOn,
  type MenuPriceStep,
  type MenuPricingOptions,
} from "../../lib/menuPricing";
import { usePricingRules } from "../../lib/usePricingRules";
import {
  choiceRowsFrom,
  choicesFromRows,
  MenuPriceChoicesEditor,
  type MenuChoiceDish,
} from "./MenuPriceChoicesEditor";

// Each list is typed one row per line, the amount last, so a label can hold
// commas: "Guacamole + salsa bar = 5.95".
const ADD_ON =
  /^(.*\S)\s*[,=]\s*\+?\$?(\d+(?:\.\d+)?)(?:\s*(?:,|\/|per)\s*(?:per\s+)?([a-z][a-z ]*))?$/i;

function parseAddOns(value: string): MenuAddOn[] | string {
  const out: MenuAddOn[] = [];
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = ADD_ON.exec(line);
    if (!match || !(Number(match[2]) > 0))
      return `"${line}" is not an add-on. Write the name, = and the price, then what it is per, like Gluten-free dough = 5 per pizza.`;
    out.push({
      label: match[1],
      price: Number(match[2]),
      per: (match[3] ?? "guest").trim().toLowerCase(),
    });
  }
  return out;
}

function parseSteps(value: string): MenuPriceStep[] | string {
  const out: MenuPriceStep[] = [];
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [upTo, price] = line
      .replace(/\$/g, "")
      .split(/[,=\s]+/)
      .map(Number);
    if (!(upTo > 0) || !(price > 0))
      return `"${line}" is not a price step. Write the count, then the price, like 30, 930.`;
    out.push({ upTo: Math.round(upTo), price });
  }
  return out.sort((a, b) => a.upTo - b.upTo);
}

/**
 * The menu's extra price rules: a per-guest range, named price choices,
 * add-ons and a price table by count. Shown when the company turned the
 * fields on in its price rules, or when this menu already has some.
 */
export function MenuPriceOptionsSection({
  menu,
  courses,
  dishes,
  onFailure,
}: Readonly<{
  menu: {
    _id: string;
    version: number;
    status: string;
    pricePerPerson: number;
    pricingOptionsJson?: string | null;
  };
  /** The menu's course names, in menu order. */
  courses: string[];
  /** The menu's dishes, for choices that a dish pick calls for. */
  dishes: MenuChoiceDish[];
  onFailure: (error: unknown) => void;
}>) {
  const rules = usePricingRules();
  const setOptions = useMenuSetPricingOptions();
  const options = readMenuPricingOptions(menu);
  const [choiceRows, setChoiceRows] = useState(() =>
    choiceRowsFrom(options.choices),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!rules) return null;
  if (!rules.menuPriceOptions && !hasMenuPricingOptions(options)) return null;
  const canEdit = menu.status === "draft" || menu.status === "published";

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const choices = choicesFromRows(choiceRows);
    const addOns = parseAddOns(String(data.get("addOns") ?? ""));
    const steps = parseSteps(String(data.get("steps") ?? ""));
    if (typeof choices === "string") return setError(choices);
    if (typeof addOns === "string") return setError(addOns);
    if (typeof steps === "string") return setError(steps);
    setError(null);
    const positive = (key: string) => Math.max(0, Number(data.get(key)) || 0);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const priceTo = positive("priceTo");
    const minimum = positive("minimumAmount");
    const unitsGuests = Math.round(positive("unitsGuests"));
    const next: MenuPricingOptions = {
      priceTo: priceTo > 0 ? priceTo : null,
      choices,
      addOns,
      countUnit: text("countUnit").toLowerCase() || "guests",
      steps,
      minimumSpend:
        minimum > 0
          ? { amount: minimum, label: text("minimumLabel") || "Minimum" }
          : null,
      unitsPer:
        unitsGuests > 0
          ? {
              guests: unitsGuests,
              unit: text("unitsName").toLowerCase() || "station",
            }
          : null,
    };
    const empty = !hasMenuPricingOptions(next);
    setSaving(true);
    onFailure(null);
    setOptions({
      docId: menu._id,
      version: menu.version,
      optionsJson: empty ? undefined : JSON.stringify(next),
    })
      .catch(onFailure)
      .finally(() => setSaving(false));
  };

  const hint = (text: string) => (
    <span className="mt-1 block text-xs font-normal text-ink-3">{text}</span>
  );

  return (
    <section className="culinary-section" aria-labelledby="menu-price-options">
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">This menu</p>
          <h2 id="menu-price-options">Price options</h2>
        </div>
        <span>Proposals offer these when this menu is picked</span>
      </div>
      <form
        key={`${menu._id}:${menu.version}`}
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={save}
      >
        <label className="field-label">
          <span>Per-guest price up to ($)</span>
          <input
            className="input"
            name="priceTo"
            type="number"
            min={0}
            step="0.01"
            disabled={!canEdit || saving}
            defaultValue={options.priceTo ?? ""}
          />
          {hint("Makes a range from the per-guest price, like $4.50–$6.")}
        </label>
        <label className="field-label">
          <span>Price by count: what is counted</span>
          <input
            className="input"
            name="countUnit"
            disabled={!canEdit || saving}
            defaultValue={options.countUnit}
            placeholder="guests"
          />
          {hint("Guests or another word, like pizzas.")}
        </label>
        <MenuPriceChoicesEditor
          rows={choiceRows}
          onChange={setChoiceRows}
          courses={courses}
          dishes={dishes}
          disabled={!canEdit || saving}
        />
        <label className="field-label">
          <span>Smallest spend on this menu ($)</span>
          <input
            className="input"
            name="minimumAmount"
            type="number"
            min={0}
            step="0.01"
            disabled={!canEdit || saving}
            defaultValue={options.minimumSpend?.amount ?? ""}
          />
          {hint("Like a cash bar the host guarantees at $1,500.")}
        </label>
        <label className="field-label">
          <span>Name of that line</span>
          <input
            className="input"
            name="minimumLabel"
            disabled={!canEdit || saving}
            defaultValue={options.minimumSpend?.label ?? ""}
            placeholder="Host guarantee"
          />
        </label>
        <label className="field-label">
          <span>One unit for every (guests)</span>
          <input
            className="input"
            name="unitsGuests"
            type="number"
            min={0}
            step={1}
            disabled={!canEdit || saving}
            defaultValue={options.unitsPer?.guests ?? ""}
          />
          {hint("Like one station for about 50 guests.")}
        </label>
        <label className="field-label">
          <span>Unit name</span>
          <input
            className="input"
            name="unitsName"
            disabled={!canEdit || saving}
            defaultValue={options.unitsPer?.unit ?? ""}
            placeholder="station"
          />
        </label>
        <label className="field-label">
          <span>Add-ons</span>
          <textarea
            className="input"
            name="addOns"
            rows={3}
            disabled={!canEdit || saving}
            defaultValue={options.addOns
              .map((row) => `${row.label} = ${row.price} per ${row.per}`)
              .join("\n")}
          />
          {hint(
            "One per line: the name, = the price, then per guest or per item. Example: Gluten-free dough = 5 per pizza",
          )}
        </label>
        <label className="field-label sm:col-span-2">
          <span>Price by count</span>
          <textarea
            className="input"
            name="steps"
            rows={4}
            disabled={!canEdit || saving}
            defaultValue={options.steps
              .map((row) => `${row.upTo}, ${row.price}`)
              .join("\n")}
          />
          {hint(
            "One per line: up to this many, then the price for all of them, like 30, 930. A count between two lines takes the next one up.",
          )}
        </label>
        {error ? (
          <p role="alert" className="text-base text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEdit || saving}
            title={
              canEdit
                ? undefined
                : "Restore this menu before changing its price options"
            }
          >
            {saving ? "Saving…" : "Save price options"}
          </button>
        </div>
      </form>
    </section>
  );
}
