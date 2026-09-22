/**
 * Jev accuracy probe: classify each TPP recipe export root with TypeSafe's
 * System One model and compare against the first-pass labels an earlier
 * review session recorded.
 *
 *   bun scripts/jev-recipe-root-probe.ts [--limit N] [--dry-run]
 *   Key: TYPESAFE_API_KEY or JEV_API_KEY, from .env.local (bun loads it) or the shell.
 *
 * Reads:
 *   .artifacts/tpp-migration-20260905/recipes.json            (217 source roots)
 *   codex-plans/source-backed-operations/recipes/root-classification-review.json
 * Writes:
 *   .artifacts/jev-recipe-root-probe/result.json  (per-root answer + label)
 *   .artifacts/jev-recipe-root-probe/summary.json (agreement, coverage, confusion)
 *
 * Never touches Capsule. One HTTP call per root (POST /v1/systemone, one
 * Choice question). Labels are a prior agent's first pass, not ground truth:
 * every disagreement needs a human look before the numbers are trusted.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const CONFIDENCE_BAR = 0.8;
const CONCURRENCY = 6;

const SOURCE = resolve(
  process.cwd(),
  ".artifacts/tpp-migration-20260905/recipes.json",
);
const LABELS = resolve(
  process.cwd(),
  "codex-plans/source-backed-operations/recipes/root-classification-review.json",
);
const OUT_DIR = resolve(process.cwd(), ".artifacts/jev-recipe-root-probe");

/** Review vocabulary; "unresolved_catalog_entry" is offered to Jev as "other". */
const CRITERIA: Record<string, string> = {
  dish: "A single served food item a guest receives (a pizza, a salad, an entree). Has its own yield like '1 Pizza' or '1 Serving' and usually a list of prep or ingredient lines.",
  component:
    "A kitchen sub-recipe or batch made in house that goes into dishes, not served on its own (a dressing, a sauce, a dough). Yield is a batch amount like '2 Gallon' or '5 Pound'.",
  dish_portion:
    "A fixed serving portion of a component or ingredient, e.g. '2 fl oz ranch' or '4 oz chicken'. The name or yield is a portion size and the lines reference one thing to portion.",
  dish_selection:
    "A placeholder for a food item the client still has to pick, e.g. 'Special Item', 'Chef's choice'. Usually zero lines.",
  menu_selection:
    "A placeholder for a whole menu still to be decided, e.g. 'Pizza Menu TBD'. Zero lines, yield '1 Recipe'.",
  meal_bundle:
    "A fully specified individual meal made of several named food items packed together (box lunch with named entree, side, cookie, chips). Many lines.",
  meal_package:
    "A packaged meal described only by category with a choice still open (e.g. 'TBD sandwich, pasta, cookie, chips'). Few or zero lines.",
  packaging:
    "A physical container or wrap for food: box, lid, bag, foil. Not food. No serving description.",
  packaging_service:
    "The act or charge of packaging items individually for drop-off, described as a service rather than a specific box.",
  serviceware:
    "Plates, cutlery, napkins, place settings, chafers that guests or servers use. Not food, not a container.",
  equipment:
    "A single piece of equipment or its part (chafer lid, hotel pan, table). Not consumed, no recipe.",
  service:
    "Labor or a service charge (cake cutting, staffing, delivery) or an obsolete label such as 'DONT USE'. No food formula.",
  service_modifier:
    "A presentation or service option applied to another item ('Make it a Platter', 'Family style'). No food formula or quantity.",
  commercial_modifier:
    "A pricing or contract term (vending minimum, surcharge, deposit). Describes money terms, not food.",
  other:
    "The root has too little description, formula, or context to place it in any option above. Pick this when unsure.",
};

interface SourceRoot {
  name: string;
  yieldText: string;
  lines: { quantity: string; unit: string; name: string }[];
  main: string;
}
interface LabelEntry {
  name: string;
  classification: string;
}
interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
interface JevResponse {
  model: string;
  answers: { root_type: JevChoiceAnswer };
  usage: { input_tokens: number; output_tokens: number };
}

function descriptionOf(main: string): string | null {
  const m = /^Description:\s*\|?\s*(.*)$/m.exec(main);
  return m?.[1]?.trim() || null;
}

function methodOf(main: string): boolean {
  const idx = main.indexOf("Method:");
  return idx >= 0 && main.slice(idx + 7).trim().length > 0;
}

function stateFor(root: SourceRoot) {
  return {
    name: root.name,
    yield: root.yieldText || null,
    description: descriptionOf(root.main),
    line_count: root.lines.length,
    lines: root.lines.map((l) => `${l.quantity} ${l.unit} — ${l.name}`),
    has_method: methodOf(root.main),
  };
}

async function askJev(apiKey: string, root: SourceRoot): Promise<JevResponse> {
  const body = {
    state: stateFor(root),
    model: MODEL,
    questions: {
      root_type: {
        type: "choice",
        instructions:
          "What kind of catalog entry is this recipe-export root? Judge from the name, yield, description and lines. Do not assume a full recipe exists.",
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
      `Jev ${res.status} for "${root.name}": ${text.slice(0, 300)}`,
    );
  }
  throw new Error(`Jev rate-limited four times for "${root.name}"`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

  const roots = JSON.parse(readFileSync(SOURCE, "utf8")) as SourceRoot[];
  const review = JSON.parse(readFileSync(LABELS, "utf8")) as {
    entries: LabelEntry[];
  };
  const labelByName = new Map(
    review.entries.map((e) => [
      e.name,
      e.classification === "unresolved_catalog_entry"
        ? "other"
        : e.classification,
    ]),
  );
  const work = roots.filter((r) => labelByName.has(r.name)).slice(0, limit);
  console.log(
    `${work.length} roots with labels (of ${roots.length} source roots)`,
  );

  if (dryRun) {
    console.log(JSON.stringify(stateFor(work[0]!), null, 2));
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
    name: string;
    label: string;
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
    input_tokens: number;
  }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < work.length) {
      const root = work[cursor++]!;
      const res = await askJev(apiKey, root);
      const a = res.answers.root_type;
      results.push({
        name: root.name,
        label: labelByName.get(root.name)!,
        choice: a.choice,
        confidence: a.confidence,
        probabilities: a.probabilities,
        input_tokens: res.usage.input_tokens,
      });
      if (results.length % 25 === 0)
        console.log(`${results.length}/${work.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((x, y) => x.name.localeCompare(y.name));

  const labeled = results.filter((r) => r.label !== "other");
  const unresolved = results.filter((r) => r.label === "other");
  const sure = labeled.filter((r) => r.confidence >= CONFIDENCE_BAR);
  const agree = (rows: typeof results) =>
    rows.filter((r) => r.choice === r.label).length;
  const confusion: Record<string, number> = {};
  for (const r of results) {
    if (r.choice !== r.label) {
      const key = `${r.label} -> ${r.choice}`;
      confusion[key] = (confusion[key] ?? 0) + 1;
    }
  }
  const tokens = results.reduce((s, r) => s + r.input_tokens, 0);
  const summary = {
    model: MODEL,
    confidence_bar: CONFIDENCE_BAR,
    roots: results.length,
    labeled_roots: labeled.length,
    agreement_all_labeled: `${agree(labeled)}/${labeled.length}`,
    labeled_clearing_bar: `${sure.length}/${labeled.length}`,
    agreement_at_bar: `${agree(sure)}/${sure.length}`,
    unresolved_roots: unresolved.length,
    unresolved_answered_other: unresolved.filter((r) => r.choice === "other")
      .length,
    unresolved_below_bar: unresolved.filter(
      (r) => r.confidence < CONFIDENCE_BAR,
    ).length,
    input_tokens: tokens,
    cost_usd: Number(((tokens / 1e6) * 0.042).toFixed(4)),
    confusion: Object.fromEntries(
      Object.entries(confusion).sort((a, b) => b[1] - a[1]),
    ),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/result.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
