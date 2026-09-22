/**
 * Catalog reclassification planner (2026-09-21).
 * Design: docs/systems/culinary-catalog-reclassification.md
 *
 * For every Dish the TPP menus import created, decide what the row really is:
 * rules first (TPP category + verb from the recipe export, the owner's day-of
 * rule), then Jev (TypeSafe System One) only for rows the rules leave open.
 * Records the decisions as suggestions through the authored seam; a person
 * approves them on /kitchen/cleanup. Never writes a Dish, Component or task.
 *
 *   bun --env-file=.env.local scripts/catalog-reclassification-plan.ts [--dry-run] [--no-jev] [--url <convex url>]
 *
 * Reads:  work/tpp-recipes/tpp-recipes-full.json (TPP recipe export)
 *         .artifacts/jev-menu-item-kind-probe/result.json (cached Jev answers, optional)
 * Writes: .artifacts/catalog-reclassification/plan.json (always)
 *         suggestion links on the backend (unless --dry-run)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import {
  classifyTppItem,
  type TppMenuItem,
} from "../convex/lib/culinaryModel/tppImport";
import { resolveTppUnit } from "../convex/lib/culinaryModel/units";
import {
  decideReclassification,
  nameKey,
  TIMING_TAG,
  type JevRowKind,
  type ReclassifyDecision,
} from "../convex/lib/culinaryModel/catalogReclassification";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, fallback = "") => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")
    ? argv[i + 1]!
    : fallback;
};
const DRY_RUN = flag("--dry-run");
const NO_JEV = flag("--no-jev");
const URL = opt("--url", process.env.CONVEX_URL ?? "");
const EXPORT = resolve(process.cwd(), "work/tpp-recipes/tpp-recipes-full.json");
const JEV_CACHE = resolve(
  process.cwd(),
  ".artifacts/jev-menu-item-kind-probe/result.json",
);
const OUT_DIR = resolve(process.cwd(), ".artifacts/catalog-reclassification");
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

// ------------------------------------------------------------ TPP export
interface ExportEntry {
  MenuItemSak: number;
  discontinued?: boolean;
  item: TppMenuItem & { mi_SubBusinessSak: number };
  raw: string;
}
interface TppExport {
  unitMeasures: Record<string, string>;
  items: ExportEntry[];
}

const tpp = JSON.parse(readFileSync(EXPORT, "utf8")) as TppExport;
const bySak = new Map<string, ExportEntry>();
const byName = new Map<string, ExportEntry[]>();
const parentsOf = new Map<string, Set<string>>();
for (const entry of tpp.items) {
  const sak = String(entry.MenuItemSak);
  bySak.set(sak, entry);
  const key = nameKey(entry.item.mi_ItemName);
  byName.set(key, [...(byName.get(key) ?? []), entry]);
  for (const row of entry.item.Recipe ?? []) {
    if (row.recp_SubMenuItemSak == null) continue;
    const child = String(row.recp_SubMenuItemSak);
    parentsOf.set(child, (parentsOf.get(child) ?? new Set()).add(sak));
  }
}

// ------------------------------------------------------------ Jev (cached + live)
const jevCache = new Map<string, { kind: JevRowKind; confidence: number }>();
if (existsSync(JEV_CACHE)) {
  const rows = JSON.parse(readFileSync(JEV_CACHE, "utf8")) as {
    name: string;
    choice: JevRowKind;
    confidence: number;
    source?: string;
  }[];
  for (const row of rows) {
    if (row.source === "rule") continue;
    jevCache.set(nameKey(row.name), {
      kind: row.choice,
      confidence: row.confidence,
    });
  }
}

const JEV_CRITERIA: Record<JevRowKind, string> = {
  served_dish:
    "A finished menu item a guest receives and eats: an entree, appetizer, salad, pizza, dessert, side dish, beverage. Named as the thing served, e.g. 'Chicken Marsala', 'Caesar Salad', 'Side Item - Sauteed Mushrooms'.",
  kitchen_batch:
    "A sub-recipe the kitchen makes in bulk to use inside dishes, not served on its own. Usually starts with Make, Cook, Roast, Bake, Brine, Marinate, Smoke, and yields a batch: 'Make orange cream cheese glaze', 'Roast chicken carnitas', 'Make Honey Cinnamon Butter'.",
  prep_step:
    "A single prep or portioning instruction on one ingredient or item, not a recipe: 'Portion 2oz salmon filet', 'Portion spring mix', 'Cut lemons', 'Immersion blend pomodoro to thin', 'Portion salt into shaker'.",
  supply:
    "A non-food item packed or served with food: plasticware, plates, napkins, boxes, lids, foil, chafers, place settings. 'Portion disposable plate and set of plasticware' is a supply, not a prep step.",
  package:
    "A bundle or meal package sold as one line that contains several dishes: 'Pizza, Salad, and Bread for 50', 'Box Lunch', 'Taco Bar for 100', a meal for N people.",
  service:
    "Labor, a fee, a pricing rule, or a presentation modifier rather than food: 'Cake cutting', 'Vending minimum', 'Make it a Platter', 'Delivery', 'Staffing'.",
  placeholder:
    "A stand-in for a choice not yet made: 'TBD', 'Chef's Choice', 'Special Item', 'One Off Item', 'Custom', 'DONT USE'.",
  other: "None of the above fits, or the name gives too little to tell.",
};

let jevCalls = 0;
async function askJev(
  name: string,
  description: string | null,
  portion: string | null,
): Promise<{ kind: JevRowKind; confidence: number } | null> {
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
  if (NO_JEV || !apiKey) return null;
  const body = {
    state: { name, description, portion },
    model: JEV_MODEL,
    questions: {
      row_kind: {
        type: "choice",
        instructions:
          "This is one row from a catering company's menu-item catalog. What kind of row is it? Judge from the name first; the portion and description help.",
        criteria: JEV_CRITERIA,
      },
    },
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      jevCalls += 1;
      const json = (await res.json()) as {
        answers: { row_kind: { choice: JevRowKind; confidence: number } };
      };
      return {
        kind: json.answers.row_kind.choice,
        confidence: json.answers.row_kind.confidence,
      };
    }
    if (res.status === 429 || res.status === 529) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `Jev ${res.status} for "${name}": ${(await res.text()).slice(0, 200)}`,
    );
  }
  return null;
}

// ------------------------------------------------------------ backend
if (!URL) {
  console.error("CONVEX_URL (or --url) is required");
  process.exit(2);
}
const client = new ConvexHttpClient(URL);
client.setAuth(await new CapsuleAgentAuthManager().resolveJwt());
const catalog = await client.query(api.catalogReclassification.candidates, {});
console.log(
  `${catalog.rows.length} imported dish rows, ${catalog.components.length} recipes, ${catalog.dishTasks.length} dish tasks, ${catalog.dishes.length} live dishes (${URL})`,
);

const componentsByName = new Map<string, string>();
for (const c of catalog.components) {
  const key = nameKey(c.name);
  if (!componentsByName.has(key))
    componentsByName.set(key, String(c.componentId));
}
const tasksByName = new Map<string, string[]>();
for (const t of catalog.dishTasks) {
  const key = nameKey(t.name);
  tasksByName.set(key, [...(tasksByName.get(key) ?? []), String(t.dishTaskId)]);
}
const dishesByName = new Map<string, string[]>();
for (const d of catalog.dishes) {
  const key = nameKey(d.name);
  dishesByName.set(key, [...(dishesByName.get(key) ?? []), String(d.dishId)]);
}

// ------------------------------------------------------------ plan
type Suggestion = Parameters<
  typeof client.mutation<typeof api.catalogReclassification.recordSuggestions>
>[1]["suggestions"][number];

const suggestions: Suggestion[] = [];
const tally = new Map<string, number>();
const bump = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);

for (const row of catalog.rows) {
  const key = nameKey(row.name);
  // Prefer the export entry that is a prep-list item when several share a name.
  const entries = byName.get(key) ?? [];
  const entry =
    entries.find(
      (e) => (e.item.mic_Category ?? "").trim() === "Prep List Item",
    ) ??
    entries[0] ??
    null;
  const item = entry?.item ?? null;
  const sak = entry ? String(entry.MenuItemSak) : null;
  const classification = item
    ? classifyTppItem({ ...item, Recipe: item.Recipe ?? [] })
    : null;
  const parentSaks = sak ? [...(parentsOf.get(sak) ?? [])] : [];
  const hasOwnRows = (item?.Recipe?.length ?? 0) > 0;

  let jev = jevCache.get(key) ?? null;
  const rulesDecide =
    TIMING_TAG.test(row.name) ||
    (item?.mic_Category ?? "").trim() === "Prep List Item" ||
    classification?.role === "supply";
  if (!jev && !rulesDecide) {
    jev = await askJev(row.name, null, null);
    if (jev) jevCache.set(key, jev);
  }

  const decision: ReclassifyDecision = decideReclassification({
    name: row.name,
    tppCategory: item?.mic_Category?.trim() || null,
    tppRole: classification?.role ?? null,
    hasParents: parentSaks.length > 0,
    hasOwnRows,
    jev,
  });

  const parents = parentSaks.map((parentSak) => {
    const parent = bySak.get(parentSak)!;
    const parentName = parent.item.mi_ItemName.trim();
    const dishIds = (dishesByName.get(nameKey(parentName)) ?? []).filter(
      (id) => id !== String(row.dishId),
    );
    return {
      sak: parentSak,
      name: parentName,
      dishId: (dishIds[0] ?? null) as never,
    };
  });

  const yieldLabel = item
    ? (tpp.unitMeasures[String(item.mi_YieldSak)] ?? "")
    : "";
  const yieldUnit = yieldLabel ? resolveTppUnit(yieldLabel).unit : null;
  const notes: string[] = [];
  if (yieldLabel && !yieldUnit)
    notes.push(
      `TPP yield unit "${yieldLabel}" has no Capsule unit; batch is used`,
    );
  if (!entry) notes.push("Not found in the TPP recipe export");
  if (entries.length > 1)
    notes.push(`${entries.length} TPP items share this name`);

  suggestions.push({
    dishId: row.dishId,
    externalId: row.externalId,
    kind: decision.kind,
    source: decision.source,
    confidence: decision.confidence,
    ready: decision.ready,
    category: decision.category,
    tpp: item
      ? {
          sak: sak!,
          account: String(item.mi_SubBusinessSak),
          category: item.mic_Category?.trim() || null,
          role: classification?.role ?? null,
          yieldQuantity: Number(item.mi_YieldAmt) || 0,
          yieldUnit,
          yieldLabel,
        }
      : null,
    parents,
    existing: {
      componentId: (decision.kind === "kitchen_batch"
        ? (componentsByName.get(key) ?? null)
        : null) as never,
      dishTaskIds: (decision.kind === "prep_step"
        ? (tasksByName.get(key) ?? [])
        : []) as never,
    },
    sourceText: entry
      ? [
          `TPP menu item ${sak} (${item?.mic_Category?.trim() || "no category"})`,
          `Yield: ${item?.mi_YieldAmt ?? ""} ${yieldLabel}`.trim(),
          ...(item?.Recipe ?? []).map(
            (r) =>
              `${r.recphis_MajorAmt} ${r.unitMeas_Description} — ${r.NAME}`,
          ),
        ].join("\n")
      : null,
    notes,
  });
  bump(
    `${decision.kind} · ${decision.source.startsWith("rule") ? "rule" : "jev"} · ${decision.ready ? "ready" : "look"}`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/plan.json`, JSON.stringify(suggestions, null, 2));
const summary = Object.fromEntries([...tally.entries()].sort());
console.log(
  JSON.stringify(
    { rows: suggestions.length, jevLiveCalls: jevCalls, summary },
    null,
    2,
  ),
);

if (DRY_RUN) {
  console.log(
    `dry run: plan written to ${OUT_DIR}/plan.json, nothing recorded`,
  );
  process.exit(0);
}
let inserted = 0;
let refreshed = 0;
let kept = 0;
for (let i = 0; i < suggestions.length; i += 100) {
  const res = await client.mutation(
    api.catalogReclassification.recordSuggestions,
    {
      suggestions: suggestions.slice(i, i + 100),
    },
  );
  inserted += res.inserted;
  refreshed += res.refreshed;
  kept += res.kept;
}
console.log(
  `recorded: ${inserted} new, ${refreshed} refreshed, ${kept} kept (already decided or applied)`,
);
