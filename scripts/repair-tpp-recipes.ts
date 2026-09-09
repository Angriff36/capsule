/** Preview by default. --apply executes the reviewed plan through an authenticated
 * atomic domain seam; never writes raw database rows or deploys code. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import { recipeUnitRatio } from "../src/lib/recipeUnitConversion";
import { componentBatchScale } from "../src/lib/componentBatchScale";
import {
  projectTppRecipe,
  recipeNameKey,
  type TppSourceRecipe,
  type RecipeRepairProjection,
} from "../src/lib/tppRecipeRepair";
const args = process.argv.slice(2);
const prepOnly = args.includes("--prep-only");
const value = (flag: string, fallback: string) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const source = value(
  "--source",
  ".artifacts/tpp-migration-20260905/recipes.json",
);
const snapshot = value(
  "--snapshot",
  ".artifacts/package-import/existing-catalog.json",
);
const out = value("--out", ".artifacts/tpp-recipe-repair-20260908");
const selectedDishIds = new Set(
  value("--dish-ids", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
mkdirSync(out, { recursive: true });
const data = JSON.parse(readFileSync(snapshot, "utf8"));
// Explicit source-reviewed associations, never a name-only automatic merge.
// Include the observed work fields so a concurrent kitchen edit is preserved.
type PrepLink = {
  prepTaskId: string;
  dishId: string;
  taskName: string;
  expectedVersion: number;
  expectedName: string;
  expectedQuantity: number;
  expectedUnit: string;
};
const prepLinksPath = value("--prep-links", "");
const prepLinks: PrepLink[] = prepLinksPath
  ? JSON.parse(readFileSync(prepLinksPath, "utf8"))
  : [];
if (!Array.isArray(prepLinks)) throw new Error("Prep links must be an array");
const usedPrepLinks = new Set<string>();
const projected = args.includes("--projected-recipes");
const sourceRecipes = JSON.parse(readFileSync(source, "utf8"));
const recipes: RecipeRepairProjection[] = projected
  ? sourceRecipes
  : (sourceRecipes as TppSourceRecipe[]).map(projectTppRecipe);
const plan = recipes.map((r) => {
  const recipe = structuredClone(r);
  if (prepOnly) {
    recipe.ingredients = [];
    recipe.components = [];
  }
  for (const component of recipe.components) {
    if (
      component.yieldQuantity != null ||
      component.yieldUnit != null ||
      component.quantityPerServing != null
    ) {
      if (
        component.yieldQuantity == null ||
        !component.yieldUnit ||
        component.quantityPerServing == null
      )
        throw new Error(`Incomplete measured batch: ${component.name}`);
      componentBatchScale(
        component.yieldQuantity,
        component.quantityPerServing,
      );
    }
    component.key = createHash("sha256").update(component.key).digest("hex");
  }
  const dishes = data.Dish.filter(
    (d: any) =>
      d.status === "active" &&
      d.deletedAt == null &&
      !d.mergedIntoDishId &&
      (!selectedDishIds.size || selectedDishIds.has(d._id)) &&
      recipeNameKey(d.name) === recipeNameKey(r.name),
  );
  if (selectedDishIds.size && !dishes.length)
    throw new Error(`No selected dish matches source recipe: ${r.name}`);
  const draft = data.Component.find(
    (c: any) =>
      c.category === "TPP imported recipes" &&
      c.name === `${r.name} — TPP recipe`,
  );
  const links = prepLinks.filter((link) =>
    dishes.some((dish: any) => dish._id === link.dishId),
  );
  for (const link of links) {
    if (usedPrepLinks.has(link.prepTaskId))
      throw new Error(
        `Prep work appears in multiple repairs: ${link.prepTaskId}`,
      );
    usedPrepLinks.add(link.prepTaskId);
    const matchingTasks = recipe.tasks.filter(
      (task) => recipeNameKey(task.name) === recipeNameKey(link.taskName),
    );
    if (matchingTasks.length !== 1)
      throw new Error(`Prep link requires one source step: ${link.taskName}`);
    if (
      recipeUnitRatio(matchingTasks[0].unit ?? "portion", link.expectedUnit) ==
      null
    )
      throw new Error(
        `Reconcile prep units before linking ${link.taskName}: work uses ${link.expectedUnit}, recipe uses ${matchingTasks[0].unit ?? "portion"}`,
      );
  }
  const linkHash = links.length
    ? createHash("sha256").update(JSON.stringify(links)).digest("hex")
    : "";
  const projectionKey = projected
    ? `:projection:${createHash("sha256").update(JSON.stringify(recipe)).digest("hex")}`
    : "";
  return {
    operationKey: `${prepOnly ? "tpp-dish-prep-completion:v1" : "tpp-dish-repair:v2"}:${r.fingerprint}${projectionKey}${linkHash ? `:prep-links:${linkHash}` : ""}`,
    dishIds: dishes.map((d: any) => d._id),
    expectedVersions: Object.fromEntries(
      dishes.map((d: any) => [d._id, d.version]),
    ),
    ...(draft && !prepOnly ? { sourceComponentId: draft._id } : {}),
    ...(links.length ? { prepLinks: links } : {}),
    recipe,
  };
});
if (selectedDishIds.size) {
  const matchedIds = new Set(plan.flatMap((item) => item.dishIds));
  if ([...selectedDishIds].some((id) => !matchedIds.has(id)))
    throw new Error("Some selected dishes have no source recipe in this plan");
}
if (usedPrepLinks.size !== prepLinks.length)
  throw new Error(
    "Some prep links do not belong to a dish in this repair plan",
  );
writeFileSync(`${out}/plan.json`, JSON.stringify(plan, null, 2));
const planHash = createHash("sha256")
  .update(JSON.stringify(plan))
  .digest("hex");
writeFileSync(`${out}/plan.sha256`, planHash);
console.log(
  JSON.stringify(
    {
      recipes: plan.length,
      existingDishes: plan.reduce((n, p) => n + p.dishIds.length, 0),
      newDishes: plan
        .filter((p) => !p.dishIds.length)
        .map((p) => p.recipe.name),
      misplacedDrafts: plan.filter((p) => p.sourceComponentId).length,
      tasks: plan.reduce((n, p) => n + p.recipe.tasks.length, 0),
      linkedPrepTasks: usedPrepLinks.size,
      directIngredientLines: plan.reduce(
        (n, p) => n + p.recipe.ingredients.length,
        0,
      ),
      subrecipes: plan.reduce((n, p) => n + p.recipe.components.length, 0),
      notes: plan.reduce((n, p) => n + p.recipe.notes.length, 0),
    },
    null,
    2,
  ),
);
if (!args.includes("--apply")) process.exit(0);
if (value("--expected-plan-sha256", "") !== planHash)
  throw new Error("Repair plan differs from the reviewed plan hash");
const url = value("--url", "");
if (!url) throw new Error("--url must name the reviewed target deployment");
const tenant = value("--tenant", "");
if (!tenant) throw new Error("--tenant must match the reviewed snapshot");
if (data.Dish.some((d: any) => d.tenantId !== tenant))
  throw new Error("Snapshot contains a different tenant");
const auth = new CapsuleAgentAuthManager();
const client = new ConvexHttpClient(url);
const ingredients = [...data.Ingredient];
const receipts: any[] = [];
for (const item of plan) {
  const jwt = await auth.resolveJwt();
  const claims = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString(),
  );
  if ((claims.tenantId ?? claims.org_id ?? claims.o?.id) !== tenant)
    throw new Error("Authenticated tenant differs from repair target");
  client.setAuth(jwt);
  const resolve = (line: any) => {
    const matches = ingredients.filter(
      (i: any) =>
        i.deletedAt == null &&
        i.status === "active" &&
        recipeNameKey(i.name) === recipeNameKey(line.name) &&
        i.unit === line.unit &&
        !i.mergedIntoIngredientId,
    );
    return matches.length === 1
      ? { ...line, ingredientId: matches[0]._id }
      : line;
  };
  const recipe = {
    ...item.recipe,
    ingredients: item.recipe.ingredients.map(resolve),
    components: item.recipe.components.map((c) => ({
      ...c,
      ingredients: c.ingredients.map(resolve),
    })),
  };
  const result: any = await client.mutation(
    "lib/culinaryOperations:repairImportedDishRecipe" as any,
    { ...item, recipe },
  );
  for (const i of result.createdIngredients)
    if (!ingredients.some((r: any) => r._id === i.id))
      ingredients.push({
        _id: i.id,
        name: i.name,
        unit: i.unit,
        status: "active",
      });
  receipts.push({
    name: recipe.name,
    fingerprint: recipe.fingerprint,
    ...result,
  });
  writeFileSync(`${out}/receipt.json`, JSON.stringify(receipts, null, 2));
  console.log(
    JSON.stringify({
      completed: receipts.length,
      name: recipe.name,
      dishes: result.dishIds.length,
      tasks: result.tasks,
      ingredients: result.ingredients,
    }),
  );
}
writeFileSync(
  `${out}/plan.sha256`,
  createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
);
