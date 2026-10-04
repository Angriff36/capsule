/**
 * Joins the dishes that are one food made different ways into one main dish
 * with versions (Ryan 2026-10-04: "Carne Asada" was four dishes — Vending,
 * Finish at Kitchen, Finish at Event, Drop Off).
 *
 * Two dishes are the same food only when their names match after removing a
 * serving tag ("- passed", "(vending)", "(drop off)", "- individual") and
 * they are finished in different places. "Chicken" and "Chicken (BBQ)" stay
 * apart. Nothing is copied or deleted: each version keeps its own recipes and
 * prep steps, and can be made its own dish again on the dish page.
 *
 * Preview (default) writes the plan to --out. Apply needs --apply and the
 * plan hash from the preview. Auth: the Capsule agent session
 * (bun run agent:mint-jwt), the same as the other repair scripts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import { finishVersionLabel } from "../src/lib/dishVersionLabel";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    out: { type: "string", default: ".artifacts/dish-versions" },
    apply: { type: "boolean", default: false },
    "expected-plan-sha256": { type: "string" },
    // Dev only: run each call through `convex run --identity <json>` as a real
    // workspace user, for local backends where the agent session cannot read dishes.
    "cli-identity": { type: "string" },
  },
});
const url = values.url ?? process.env.VITE_CONVEX_URL;
if (!url && !values["cli-identity"])
  throw new Error("Provide --url <Convex URL> or VITE_CONVEX_URL");

type Dish = {
  _id: string;
  name: string;
  category?: string | null;
  status?: string;
  deletedAt?: number | null;
  mergedIntoDishId?: string | null;
  versionOfDishId?: string | null;
  versionLabel?: string | null;
  _creationTime: number;
};

const SERVING_TAG =
  /\s*(?:-\s*(?:passed|drop[ -]?off|individual|vending)|\((?:passed|drop[ -]?off|vending|individual)\))\s*$/i;

export function foodKey(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 3 && SERVING_TAG.test(n); i++)
    n = n.replace(SERVING_TAG, "");
  return n
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, " ")
    .trim();
}

/** The tab name for how a dish is finished, from its catalog category. */
export function versionLabel(dish: Pick<Dish, "name" | "category">): string {
  return finishVersionLabel(dish.category, dish.name) ?? "Main";
}

const MAIN_ORDER = ["Main", "Finish at Kitchen", "Finish at Event"];

export function planVersions(dishes: readonly Dish[]) {
  const live = dishes.filter(
    (d) =>
      d.status === "active" &&
      d.deletedAt == null &&
      d.mergedIntoDishId == null &&
      d.versionOfDishId == null,
  );
  const groups = new Map<string, Dish[]>();
  for (const d of live) {
    const key = foodKey(d.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const plan: {
    food: string;
    main: { id: string; name: string; label: string };
    versions: { id: string; name: string; label: string }[];
  }[] = [];
  for (const [food, members] of groups) {
    if (members.length < 2) continue;
    // One dish per tab; a second dish with the same tab is a duplicate, not a
    // version, and is left alone.
    const byLabel = new Map<string, Dish>();
    for (const d of [...members].sort(
      (a, b) => a._creationTime - b._creationTime,
    )) {
      const label = versionLabel(d);
      if (!byLabel.has(label)) byLabel.set(label, d);
    }
    if (byLabel.size < 2) continue;
    const labels = [...byLabel.keys()];
    const mainLabel =
      MAIN_ORDER.find((l) => byLabel.has(l)) ?? labels.sort()[0]!;
    const main = byLabel.get(mainLabel)!;
    plan.push({
      food,
      main: { id: main._id, name: main.name, label: mainLabel },
      versions: labels
        .filter((l) => l !== mainLabel)
        .map((l) => ({
          id: byLabel.get(l)!._id,
          name: byLabel.get(l)!.name,
          label: l,
        })),
    });
  }
  return plan.sort((a, b) => a.food.localeCompare(b.food));
}

type Caller = {
  query: (fn: string, args: object) => Promise<any>;
  mutation: (fn: string, args: object) => Promise<any>;
};

async function caller(): Promise<Caller> {
  const identity = values["cli-identity"];
  if (identity) {
    const run = async (fn: string, args: object) => {
      const proc = Bun.spawnSync(
        [
          "node",
          "node_modules/convex/bin/main.js",
          "run",
          fn,
          JSON.stringify(args),
          "--identity",
          identity,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      if (proc.exitCode !== 0)
        throw new Error(`${fn}: ${proc.stderr.toString().slice(0, 400)}`);
      const out = proc.stdout.toString().trim();
      return out ? JSON.parse(out) : null;
    };
    return { query: run, mutation: run };
  }
  const jwt = await new CapsuleAgentAuthManager().resolveJwt();
  const client = new ConvexHttpClient(url!);
  client.setAuth(jwt);
  return {
    query: (fn, args) => client.query(fn as any, args as any),
    mutation: (fn, args) => client.mutation(fn as any, args as any),
  };
}

async function main() {
  const client = await caller();
  const dishes: Dish[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { page: Dish[]; isDone: boolean; continueCursor: string } =
      await client.query("dishLookup:page", {
        paginationOpts: { numItems: 500, cursor },
      });
    dishes.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  const plan = planVersions(dishes);
  const text = JSON.stringify(plan, null, 2);
  const planHash = createHash("sha256").update(text).digest("hex");
  mkdirSync(values.out!, { recursive: true });
  writeFileSync(`${values.out}/plan.json`, text);
  console.log(
    `${dishes.length} dishes read; ${plan.length} foods get versions (${plan.reduce((n, g) => n + g.versions.length, 0)} dishes become versions). Plan: ${values.out}/plan.json sha256 ${planHash}`,
  );
  if (!values.apply) return;
  if (values["expected-plan-sha256"] !== planHash)
    throw new Error("The plan changed since the preview; preview again");
  let done = 0;
  for (const group of plan) {
    if (group.main.label !== "Main") {
      await client.mutation("mutations:Dish_labelVersion", {
        docId: group.main.id,
        label: group.main.label,
        idempotencyKey: `dish-version-label:${group.main.id}`,
      });
    }
    for (const v of group.versions) {
      await client.mutation("mutations:Dish_makeVersionOf", {
        docId: v.id,
        mainDishId: group.main.id,
        label: v.label,
        idempotencyKey: `dish-version-link:${v.id}:${group.main.id}`,
      });
      done += 1;
    }
  }
  console.log(`Linked ${done} versions to ${plan.length} main dishes.`);
}

if (import.meta.main) await main();
