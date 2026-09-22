/**
 * Jev probe over the real TPP menu catalog (the 2,783 rows imported as
 * Dishes): what kind of row is each one? Most "Uncategorized" rows are prep
 * steps ("Portion 2oz salmon filet", "Make orange cream cheese glaze"),
 * supplies, packages, or placeholders, not served dishes.
 *
 *   bun scripts/jev-menu-item-kind-probe.ts [--limit N] [--dry-run]
 *   Key: TYPESAFE_API_KEY or JEV_API_KEY, from .env.local (bun loads it) or the shell.
 *
 * Reads:  work/tpp-menus-1.json, -2.json, -3.json (the converted export)
 * Writes: .artifacts/jev-menu-item-kind-probe/result.json, summary.json,
 *         suggestions.csv
 *
 * Never touches Capsule. One HTTP call per row, one Choice question.
 * Rows that already carry a TPP category act as a rough check: a
 * "Finish at Event" row should come back served_dish.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const CONFIDENCE_BAR = 0.8;
const CONCURRENCY = 6;

const SOURCES = [1, 2, 3].map((n) =>
  resolve(process.cwd(), `work/tpp-menus-${n}.json`),
);
const OUT_DIR = resolve(process.cwd(), ".artifacts/jev-menu-item-kind-probe");

const CRITERIA: Record<string, string> = {
  served_dish:
    "A finished menu item a guest receives and eats: an entree, appetizer, salad, pizza, dessert, side dish, beverage. Named as the thing served, e.g. 'Chicken Marsala', 'Caesar Salad', 'Side Item - Sauteed Mushrooms'.",
  kitchen_batch:
    "A sub-recipe the kitchen makes in bulk to use inside dishes, not served on its own. Usually starts with Make, Cook, Roast, Bake, Brine, Marinate, Smoke, and yields a batch: 'Make orange cream cheese glaze', 'Roast chicken carnitas', 'Make Honey Cinnamon Butter'.",
  prep_step:
    "A single prep or portioning instruction on one ingredient or item, not a recipe: 'Portion 2oz salmon filet', 'Portion spring mix', 'Cut lemons', '(day of) Add water to rice', 'Immersion blend pomodoro to thin', 'Portion salt into shaker'.",
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

interface MenuRow {
  menu_item_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  portion_size_description?: string | null;
  price_per_person?: string | number | null;
}
interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
interface JevResponse {
  answers: { row_kind: JevChoiceAnswer };
  usage: { input_tokens: number; output_tokens: number };
}

/** The export's description column mostly holds a numeric id; keep only prose. */
function proseOrNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || /^\d+$/.test(text)) return null;
  return text;
}

function stateFor(row: MenuRow) {
  return {
    name: row.name,
    description: proseOrNull(row.description),
    portion: proseOrNull(row.portion_size_description),
    price_per_person:
      row.price_per_person == null || row.price_per_person === ""
        ? null
        : String(row.price_per_person),
  };
}

async function askJev(apiKey: string, row: MenuRow): Promise<JevResponse> {
  const body = {
    state: stateFor(row),
    model: MODEL,
    questions: {
      row_kind: {
        type: "choice",
        instructions:
          "This is one row from a catering company's menu-item catalog. What kind of row is it? Judge from the name first; the portion and price help.",
        criteria: CRITERIA,
      },
    },
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as JevResponse;
    const text = await res.text();
    if (res.status === 429 || res.status === 529) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `Jev ${res.status} for "${row.name}": ${text.slice(0, 300)}`,
    );
  }
  throw new Error(`Jev rate-limited four times for "${row.name}"`);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

  const rows = SOURCES.flatMap(
    (file) => JSON.parse(readFileSync(file, "utf8")) as MenuRow[],
  ).slice(0, limit);
  console.log(`${rows.length} menu rows`);
  if (dryRun) {
    console.log(JSON.stringify(stateFor(rows[0]!), null, 2));
    return;
  }
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
  if (!apiKey) {
    console.error(
      "Set TYPESAFE_API_KEY (or JEV_API_KEY) in .env.local or the shell.",
    );
    process.exit(2);
  }

  const results: {
    menu_item_id: string;
    name: string;
    category: string;
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
    input_tokens: number;
  }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]!;
      const res = await askJev(apiKey, row);
      const a = res.answers.row_kind;
      results.push({
        menu_item_id: row.menu_item_id,
        name: row.name,
        category: (row.category ?? "").trim(),
        choice: a.choice,
        confidence: a.confidence,
        probabilities: a.probabilities,
        input_tokens: res.usage.input_tokens,
      });
      if (results.length % 250 === 0)
        console.log(`${results.length}/${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((x, y) => x.name.localeCompare(y.name));

  const count = (rowsIn: typeof results) => {
    const out: Record<string, number> = {};
    for (const r of rowsIn) out[r.choice] = (out[r.choice] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  };
  const uncategorized = results.filter((r) => r.category === "");
  const categorized = results.filter((r) => r.category !== "");
  const sure = (rowsIn: typeof results) =>
    rowsIn.filter((r) => r.confidence >= CONFIDENCE_BAR);
  const tokens = results.reduce((s, r) => s + r.input_tokens, 0);
  const byCategory: Record<string, Record<string, number>> = {};
  for (const r of categorized) {
    byCategory[r.category] ??= {};
    byCategory[r.category]![r.choice] =
      (byCategory[r.category]![r.choice] ?? 0) + 1;
  }
  const summary = {
    model: MODEL,
    confidence_bar: CONFIDENCE_BAR,
    rows: results.length,
    uncategorized_rows: uncategorized.length,
    uncategorized_kinds: count(uncategorized),
    uncategorized_clearing_bar: sure(uncategorized).length,
    uncategorized_kinds_at_bar: count(sure(uncategorized)),
    categorized_rows: categorized.length,
    categorized_kinds: count(categorized),
    categorized_kinds_by_tpp_category: byCategory,
    input_tokens: tokens,
    cost_usd: Number(((tokens / 1e6) * 0.042).toFixed(4)),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/result.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  const header = "menu_item_id,name,tpp_category,jev_kind,confidence";
  const lines = results.map((r) =>
    [r.menu_item_id, r.name, r.category, r.choice, r.confidence.toFixed(3)]
      .map(csvCell)
      .join(","),
  );
  writeFileSync(
    `${OUT_DIR}/suggestions.csv`,
    [header, ...lines].join("\n") + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
