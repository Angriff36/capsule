/** Preview/apply reviewed batch recipes without creating finished dishes. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import {
  recipeNameKey,
  type RecipeRepairProjection,
} from "../src/lib/tppRecipeRepair";

const flags = process.argv.slice(2);
const value = (flag: string, fallback = "") => {
  const index = flags.indexOf(flag);
  if (index < 0) return fallback;
  if (!flags[index + 1] || flags[index + 1].startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return flags[index + 1];
};
const sourcePath = value("--source");
const sourceReference = value("--source-reference");
const snapshotPath = value("--snapshot");
const reclassifyDishId = value("--reclassify-dish-id");
if (!sourcePath || !sourceReference || !snapshotPath)
  throw new Error(
    "Provide --source (reviewed batch JSON), --source-reference and --snapshot",
  );
const out = value("--out", ".artifacts/tpp-component-repair");
const sourceText = readFileSync(sourcePath, "utf8");
const snapshotText = readFileSync(snapshotPath, "utf8");
const source = JSON.parse(sourceText);
const snapshot = JSON.parse(snapshotText);
const formulas: RecipeRepairProjection["components"] = Array.isArray(source)
  ? source
  : [source];
const seen = new Set<string>();
let usedSourceDish = false;
const plan = formulas.map((formula) => {
  if (
    !formula.name?.trim() ||
    !formula.key?.trim() ||
    !formula.instructions?.trim() ||
    !Number.isFinite(formula.yieldQuantity) ||
    !(Number(formula.yieldQuantity) > 0) ||
    !formula.yieldUnit?.trim() ||
    !Array.isArray(formula.ingredients) ||
    !formula.ingredients.length
  )
    throw new Error(
      "Every batch needs a source key, name, measured yield, ingredients and method",
    );
  const key = createHash("sha256").update(formula.key).digest("hex");
  if (seen.has(key)) throw new Error(`Duplicate source batch: ${formula.name}`);
  seen.add(key);
  const recipe = {
    name: formula.name,
    key,
    instructions: formula.instructions,
    yieldQuantity: formula.yieldQuantity!,
    yieldUnit: formula.yieldUnit!,
    ingredients: formula.ingredients,
  };
  const sourceDish = reclassifyDishId
    ? (snapshot.Dish ?? []).find(
        (dish: any) =>
          dish._id === reclassifyDishId &&
          recipeNameKey(dish.name) === recipeNameKey(formula.name),
      )
    : undefined;
  if (
    sourceDish &&
    (usedSourceDish ||
      sourceDish.deletedAt != null ||
      sourceDish.status !== "active" ||
      (sourceDish.recipeSourceFingerprint != null &&
        sourceDish.recipeSourceFingerprint !== formula.key))
  )
    throw new Error("Source dish does not match the reviewed batch source");
  if (sourceDish) usedSourceDish = true;
  const payload = {
    source: sourceReference,
    recipe,
    ...(sourceDish
      ? {
          sourceDish: {
            dishId: sourceDish._id,
            expectedVersion: sourceDish.version,
            expectedSourceFingerprint:
              sourceDish.recipeSourceFingerprint ?? null,
          },
        }
      : {}),
  };
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const args = {
    operationKey: `tpp-component-repair:v1:${key}:${payloadHash}`,
    ...payload,
  };
  const matchingDishes = (snapshot.Dish ?? []).filter(
    (dish: any) =>
      dish.deletedAt == null &&
      recipeNameKey(dish.name) === recipeNameKey(formula.name),
  );
  return {
    args,
    existingDishReferences: matchingDishes.map((dish: any) => ({
      id: dish._id,
      name: dish.name,
      version: dish.version,
      eventDishIds: (snapshot.EventDish ?? [])
        .filter((line: any) => line.dishId === dish._id)
        .map((line: any) => line._id),
    })),
  };
});
if (reclassifyDishId && !usedSourceDish)
  throw new Error("No reviewed batch matches the selected source dish");
mkdirSync(out, { recursive: true });
const document = {
  sourcePath,
  sourceReference,
  sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
  snapshotSha256: createHash("sha256").update(snapshotText).digest("hex"),
  referenceCoverage: ["EventDish"],
  referenceNote:
    "Only an explicit sourceDish is retired, in the same transaction as component materialization. Apply checks all domain dish references; referenced records require relationship reconciliation first.",
  plan,
};
const planHash = createHash("sha256")
  .update(JSON.stringify(document))
  .digest("hex");
writeFileSync(`${out}/plan.json`, JSON.stringify(document, null, 2));
writeFileSync(`${out}/plan.sha256`, planHash);
console.log(
  JSON.stringify({
    batches: plan.length,
    reclassifiedDishes: plan.filter((item) => item.args.sourceDish).length,
    existingDishRecords: plan.reduce(
      (sum, item) => sum + item.existingDishReferences.length,
      0,
    ),
    out,
    planHash,
  }),
);
if (!flags.includes("--apply")) process.exit(0);
if (value("--expected-plan-sha256") !== planHash)
  throw new Error("Repair plan differs from the reviewed plan hash");
const url = value("--url");
const tenantId = value("--tenant");
if (!url || !tenantId)
  throw new Error("Apply requires explicit --url and --tenant");
const client = new ConvexHttpClient(url);
const auth = new CapsuleAgentAuthManager();
const receipts: unknown[] = [];
for (const item of plan) {
  const jwt = await auth.resolveJwt();
  const claims = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString(),
  );
  if ((claims.tenantId ?? claims.org_id ?? claims.o?.id) !== tenantId)
    throw new Error("Authenticated tenant differs from repair target");
  client.setAuth(jwt);
  const result = await client.mutation(
    "lib/culinaryOperations:repairImportedComponentRecipe" as any,
    item.args,
  );
  receipts.push({ name: item.args.recipe.name, ...result });
  writeFileSync(`${out}/receipt.json`, JSON.stringify(receipts, null, 2));
}
