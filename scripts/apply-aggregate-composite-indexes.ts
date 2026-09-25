/**
 * Point generated sum() reads at a composite index the Convex projection
 * cannot pick by itself. The projection reads an aggregate through the first
 * single-field index only. EventIngredientContribution reactions sum one
 * ingredient in one event 13 times per contribution; through by_eventId that
 * read the whole event each time and passed Convex's 16 MB read limit on a
 * 15-dish BEO import (2026-09-24). The index itself is declared in
 * manifest.config.yaml. This runs after Builder regeneration, alongside the
 * other generated runtime patches, and refreshes the ownership digest.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";

// `const __aggN_rows = <by_eventId read>` whose filtered rows start with the
// ingredientId equality. The tenant binding line may sit between the two.
const AGGREGATE =
  /(const (__agg\d+)_rows = await ctx\.db\.query\("eventIngredientContributions"\))\.withIndex\("by_eventId", \(q\) => q\.eq\("eventId", ([^)]+)\)\)(\.collect\(\);\n(?:[^\n]*\n)?\s*const \2_rowsf = \2_rows\.filter\(\(d\) => \(d as any\)\.ingredientId === ([^)]+)\))/g;

export function applyAggregateCompositeIndexes(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(`apply-aggregate-composite-indexes: missing ${TARGET}`);
  }
  const source = readFileSync(abs, "utf8");
  const updated = source.replace(
    AGGREGATE,
    (
      _match,
      head: string,
      _agg: string,
      eventId: string,
      tail: string,
      ingredientId: string,
    ) =>
      `${head}.withIndex("by_eventId_and_ingredientId", (q) => q.eq("eventId", ${eventId}).eq("ingredientId", ${ingredientId}))${tail}`,
  );
  if (
    !updated.includes('withIndex("by_eventId_and_ingredientId"') &&
    source.includes("async function __runEventIngredientContributionRecord")
  ) {
    throw new Error(
      "apply-aggregate-composite-indexes: EventIngredientContribution sums not found",
    );
  }
  if (updated === source) {
    refreshOwnershipDigest(root, abs);
    return [];
  }
  writeFileSync(abs, updated, "utf8");
  refreshOwnershipDigest(root, abs);
  return [TARGET];
}

function refreshOwnershipDigest(root: string, abs: string): void {
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (!existsSync(ownershipPath)) return;
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    files: Record<string, { sha256: string; baselined?: boolean }>;
  };
  const entry = ownership.files[TARGET];
  if (!entry) return;
  ownership.files[TARGET] = {
    sha256: createHash("sha256").update(readFileSync(abs)).digest("hex"),
  };
  writeFileSync(
    ownershipPath,
    `${JSON.stringify(ownership, null, 2)}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  const touched = applyAggregateCompositeIndexes();
  console.log(
    touched.length === 0
      ? "aggregate composite indexes: already applied"
      : `aggregate composite indexes: patched ${touched.join(", ")}`,
  );
}
