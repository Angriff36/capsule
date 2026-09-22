/**
 * Catalog reclassification planner (2026-09-21).
 * Design: docs/systems/culinary-catalog-reclassification.md
 *
 * For every Dish the TPP menus import created, decide what the row really is.
 * Order of authority:
 *   1. The 2026-09-14 TPP recipe import's own map (.artifacts/tpp-recipe-import):
 *      it already matched TPP items to Capsule dishes and wrote the recipes and
 *      dish tasks. A row it matched as a dish IS a dish; a row whose TPP item it
 *      made a recipe for IS that recipe; a row whose TPP item it wrote as tasks
 *      under its parents IS a prep step. Exact ids, no guessing.
 *   2. Rules over the TPP recipe export (category, verb, the owner's day-of rule).
 *   3. Jev (TypeSafe System One) only for rows neither of the above settles.
 * Records the decisions as suggestions through the authored seam; a person
 * approves them on /kitchen/cleanup. Never writes a Dish, Component or task.
 *
 *   bun --env-file=.env.local scripts/catalog-reclassification-plan.ts [--dry-run] [--no-jev] [--url <convex url>]
 *   bun scripts/catalog-reclassification-plan.ts --offline   # no backend: the production picture from the files alone
 *   Auth: CATALOG_PLAN_JWT (a Clerk session token for the account to run as) or the agent token.
 *   --tpp-import-dir <dir>   where tpp-capsule-map.json + state.json live (default .artifacts/tpp-recipe-import)
 *
 * Reads:  work/tpp-recipes/tpp-recipes-full.json (TPP recipe export)
 *         .artifacts/tpp-recipe-import/{tpp-capsule-map.json,state.json} (when present and for this backend)
 *         .artifacts/jev-menu-item-kind-probe/result.json (cached Jev answers, optional)
 *         work/tpp-menus-1..3.json (offline mode only: the rows the menus import loaded)
 * Writes: .artifacts/catalog-reclassification/plan.json (always)
 *         suggestion links on the backend (unless --dry-run / --offline)
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
  TPP_PREP_LIST_CATEGORY,
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
const OFFLINE = flag("--offline");
const NO_JEV = flag("--no-jev") || OFFLINE;
const IMPORT_DIR = resolve(
  process.cwd(),
  opt("--tpp-import-dir", ".artifacts/tpp-recipe-import"),
);
const EXPORT = resolve(process.cwd(), "work/tpp-recipes/tpp-recipes-full.json");
const JEV_CACHE = resolve(
  process.cwd(),
  ".artifacts/jev-menu-item-kind-probe/result.json",
);
const OUT_DIR = resolve(process.cwd(), ".artifacts/catalog-reclassification");
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const trimUrl = (u: string) => u.trim().replace(/\/$/, "");

// ------------------------------------------------------------ TPP recipe export
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

// ------------------------------------------------------------ the 2026-09-14 TPP recipe import (exact ids)
interface ImportMap {
  url: string;
  components: Record<string, string>;
  dishes: Record<string, string[]>;
}
interface ImportState {
  dishTasks: Record<string, string>;
}
let importMap: ImportMap | null = null;
let importState: ImportState | null = null;
const mapPath = resolve(IMPORT_DIR, "tpp-capsule-map.json");
const statePath = resolve(IMPORT_DIR, "state.json");
function loadImportMap(targetUrl: string) {
  if (!existsSync(mapPath) || !existsSync(statePath)) {
    console.error(`no TPP import map under ${IMPORT_DIR}; matching by name`);
    return;
  }
  const map = JSON.parse(readFileSync(mapPath, "utf8")) as ImportMap;
  if (trimUrl(map.url) !== trimUrl(targetUrl)) {
    console.error(
      `TPP import map is for ${map.url}, not ${targetUrl}; its ids do not apply here, matching by name`,
    );
    return;
  }
  importMap = map;
  importState = JSON.parse(readFileSync(statePath, "utf8")) as ImportState;
  console.error(
    `TPP import map: ${Object.keys(map.dishes).length} matched dishes, ${Object.keys(map.components).length} recipes, ${Object.keys(importState.dishTasks).length} dish tasks`,
  );
}
const sakByDishId = () => {
  const out = new Map<string, string>();
  for (const [sak, ids] of Object.entries(importMap?.dishes ?? {}))
    for (const id of ids) out.set(id, sak);
  return out;
};
/** Dish task ids the import wrote for one child item under each parent dish. */
function importTaskIds(childSak: string): string[] {
  if (!importMap || !importState) return [];
  const ids = new Set<string>();
  for (const parentSak of parentsOf.get(childSak) ?? []) {
    const parent = bySak.get(parentSak);
    const parentDishIds = importMap.dishes[parentSak] ?? [];
    for (const row of parent?.item.Recipe ?? []) {
      if (String(row.recp_SubMenuItemSak) !== childSak) continue;
      for (const dishId of parentDishIds) {
        const id = importState.dishTasks[`${row.recp_RecipeSak}:${dishId}`];
        if (id) ids.add(id);
      }
    }
  }
  return [...ids];
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
): Promise<{ kind: JevRowKind; confidence: number } | null> {
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
  if (NO_JEV || !apiKey) return null;
  const body = {
    state: { name },
    model: JEV_MODEL,
    questions: {
      row_kind: {
        type: "choice",
        instructions:
          "This is one row from a catering company's menu-item catalog. What kind of row is it? Judge from the name.",
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

// ------------------------------------------------------------ candidates: backend, or the files (offline)
type Catalog = {
  rows: {
    dishId: string;
    name: string;
    category: string | null;
    externalId: string;
  }[];
  components: { componentId: string; name: string }[];
  dishTasks: { dishTaskId: string; dishId: string; name: string }[];
  dishes: { dishId: string; name: string }[];
};

let client: ConvexHttpClient | null = null;
let catalog: Catalog;
if (OFFLINE) {
  // The rows the menus import loaded, with the production dish id where the
  // TPP import map knows it. Everything else is planned without an id.
  const mapUrl = existsSync(mapPath)
    ? (JSON.parse(readFileSync(mapPath, "utf8")) as ImportMap).url
    : "";
  loadImportMap(mapUrl);
  const dishIdBySak = importMap?.dishes ?? {};
  const rows: Catalog["rows"] = [];
  for (const n of [1, 2, 3]) {
    const file = resolve(process.cwd(), `work/tpp-menus-${n}.json`);
    for (const r of JSON.parse(readFileSync(file, "utf8")) as {
      menu_item_id: string;
      name: string;
      category?: string | null;
    }[]) {
      const entries = byName.get(nameKey(r.name)) ?? [];
      const sak = entries
        .map((e) => String(e.MenuItemSak))
        .find((s) => dishIdBySak[s]?.length);
      rows.push({
        dishId: sak ? dishIdBySak[sak]![0]! : `offline:${r.menu_item_id}`,
        name: r.name,
        category: r.category ?? null,
        externalId: r.menu_item_id,
      });
    }
  }
  catalog = { rows, components: [], dishTasks: [], dishes: [] };
  console.error(`offline: ${rows.length} menu rows from work/tpp-menus-*.json`);
} else {
  const URL = opt("--url", process.env.CONVEX_URL ?? "");
  if (!URL) {
    console.error("CONVEX_URL (or --url) is required");
    process.exit(2);
  }
  client = new ConvexHttpClient(URL);
  // CATALOG_PLAN_JWT lets an operator run as a chosen account (a minted Clerk
  // session token); otherwise the usual agent token is used.
  client.setAuth(
    process.env.CATALOG_PLAN_JWT?.trim() ||
      (await new CapsuleAgentAuthManager().resolveJwt()),
  );
  catalog = (await client.query(
    api.catalogReclassification.candidates,
    {},
  )) as Catalog;
  console.error(
    `${catalog.rows.length} imported dish rows, ${catalog.components.length} recipes, ${catalog.dishTasks.length} dish tasks, ${catalog.dishes.length} live dishes (${URL})`,
  );
  loadImportMap(URL);
}

const dishSak = sakByDishId();
const componentsByName = new Map<string, string>();
for (const c of catalog.components) {
  const key = nameKey(c.name);
  if (!componentsByName.has(key)) componentsByName.set(key, c.componentId);
}
const dishesByName = new Map<string, string[]>();
for (const d of catalog.dishes) {
  const key = nameKey(d.name);
  dishesByName.set(key, [...(dishesByName.get(key) ?? []), d.dishId]);
}

// ------------------------------------------------------------ plan
const suggestions: Record<string, unknown>[] = [];
const tally = new Map<string, number>();
const bump = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
const sourceBucket = (source: string) =>
  source.startsWith("rule:tpp-import")
    ? "tpp-import"
    : source.startsWith("rule")
      ? "rule"
      : "jev";

for (const row of catalog.rows) {
  const key = nameKey(row.name);
  const entries = byName.get(key) ?? [];
  // 1. The TPP import already matched this dish row to a TPP item → exact.
  const importedSak = dishSak.get(row.dishId) ?? null;
  // Otherwise prefer the export entry that is a prep-list item when several share a name.
  const entry =
    (importedSak ? bySak.get(importedSak) : undefined) ??
    entries.find(
      (e) => (e.item.mic_Category ?? "").trim() === TPP_PREP_LIST_CATEGORY,
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
  const tppCategory = item?.mic_Category?.trim() || null;
  const backfill =
    tppCategory && tppCategory !== TPP_PREP_LIST_CATEGORY ? tppCategory : null;

  const importedComponentId =
    sak && importMap ? (importMap.components[sak] ?? null) : null;
  const importedTaskIds = sak ? importTaskIds(sak) : [];

  let decision: ReclassifyDecision;
  let jev: { kind: JevRowKind; confidence: number } | null = null;
  if (importedSak) {
    // TPP filed this item under a menu category and the import matched it to
    // a dish. TPP's own category is the answer (owner, 2026-09-22): the row
    // stays a dish with that exact category. No word rule, no model.
    decision = {
      kind: "food",
      source: "rule:tpp-import-dish",
      confidence: 1,
      ready: true,
      category: backfill,
    };
  } else if (importedComponentId) {
    decision = {
      kind: "kitchen_batch",
      source: "rule:tpp-import-recipe",
      confidence: 1,
      ready: true,
      category: null,
    };
  } else if (importedTaskIds.length) {
    decision = {
      kind: "prep_step",
      source: "rule:tpp-import-task",
      confidence: 1,
      ready: true,
      category: null,
    };
  } else {
    jev = jevCache.get(key) ?? null;
    const rulesDecide =
      TIMING_TAG.test(row.name) ||
      tppCategory === TPP_PREP_LIST_CATEGORY ||
      classification?.role === "supply";
    if (!jev && !rulesDecide) {
      jev = await askJev(row.name);
      if (jev) jevCache.set(key, jev);
    }
    decision = decideReclassification({
      name: row.name,
      tppCategory,
      tppRole: classification?.role ?? null,
      hasParents: parentSaks.length > 0,
      hasOwnRows,
      jev,
    });
  }

  const parents = parentSaks.map((parentSak) => {
    const parent = bySak.get(parentSak)!;
    const parentName = parent.item.mi_ItemName.trim();
    const fromImport = importMap?.dishes[parentSak] ?? [];
    const byNameIds = (dishesByName.get(nameKey(parentName)) ?? []).filter(
      (id) => id !== row.dishId,
    );
    return {
      sak: parentSak,
      name: parentName,
      dishId: fromImport[0] ?? byNameIds[0] ?? null,
    };
  });

  const parentDishIds = new Set(
    parents.map((p) => p.dishId).filter((id): id is string => id != null),
  );
  const parentTaskIds = catalog.dishTasks
    .filter((t) => nameKey(t.name) === key && parentDishIds.has(t.dishId))
    .map((t) => t.dishTaskId);

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
  if (entries.length > 1 && !importedSak)
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
          category: tppCategory,
          role: classification?.role ?? null,
          yieldQuantity: Number(item.mi_YieldAmt) || 0,
          yieldUnit,
          yieldLabel,
        }
      : null,
    parents,
    existing: {
      componentId:
        decision.kind === "kitchen_batch"
          ? (importedComponentId ?? componentsByName.get(key) ?? null)
          : null,
      // A same-name task counts only under one of this row's parent dishes.
      dishTaskIds:
        decision.kind === "prep_step"
          ? importedTaskIds.length
            ? importedTaskIds
            : parentTaskIds
          : [],
    },
    sourceText: entry
      ? [
          `TPP menu item ${sak} (${tppCategory ?? "no category"})`,
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
    `${decision.kind} · ${sourceBucket(decision.source)} · ${decision.ready ? "ready" : "look"}`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/plan.json`, JSON.stringify(suggestions, null, 2));
const summary = Object.fromEntries([...tally.entries()].sort());
const byKind: Record<string, number> = {};
const byBucket: Record<string, number> = {};
for (const [k, n] of tally) {
  const [kind, bucket] = k.split(" · ");
  byKind[kind!] = (byKind[kind!] ?? 0) + n;
  byBucket[bucket!] = (byBucket[bucket!] ?? 0) + n;
}
console.log(
  JSON.stringify(
    {
      rows: suggestions.length,
      jevLiveCalls: jevCalls,
      byKind,
      decidedBy: byBucket,
      summary,
    },
    null,
    2,
  ),
);

if (DRY_RUN || OFFLINE || !client) {
  console.log(
    `${OFFLINE ? "offline" : "dry run"}: plan written to ${OUT_DIR}/plan.json, nothing recorded`,
  );
  process.exit(0);
}
let inserted = 0;
let refreshed = 0;
let kept = 0;
for (let i = 0; i < suggestions.length; i += 100) {
  const res = await client.mutation(
    api.catalogReclassification.recordSuggestions,
    { suggestions: suggestions.slice(i, i + 100) } as never,
  );
  inserted += res.inserted;
  refreshed += res.refreshed;
  kept += res.kept;
}
console.log(
  `recorded: ${inserted} new, ${refreshed} refreshed, ${kept} kept (already decided or applied)`,
);
