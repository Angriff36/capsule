/** Preview by default. --apply executes the reviewed plan through an authenticated
 * atomic domain seam; never writes raw database rows or deploys code. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import {
  projectTppRecipe,
  recipeNameKey,
  type TppSourceRecipe,
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
mkdirSync(out, { recursive: true });
const data = JSON.parse(readFileSync(snapshot, "utf8"));
const recipes = JSON.parse(readFileSync(source, "utf8")) as TppSourceRecipe[];
const plan = recipes.map((r) => {
  const recipe = projectTppRecipe(r);
  if (prepOnly) {
    recipe.ingredients = [];
    recipe.components = [];
  }
  for (const component of recipe.components)
    component.key = createHash("sha256").update(component.key).digest("hex");
  const dishes = data.Dish.filter(
    (d: any) =>
      d.status === "active" &&
      d.deletedAt == null &&
      !d.mergedIntoDishId &&
      recipeNameKey(d.name) === recipeNameKey(r.name),
  );
  const draft = data.Component.find(
    (c: any) =>
      c.category === "TPP imported recipes" &&
      c.name === `${r.name} — TPP recipe`,
  );
  return {
    operationKey: `${prepOnly ? "tpp-dish-prep-completion:v1" : "tpp-dish-repair:v2"}:${r.fingerprint}`,
    dishIds: dishes.map((d: any) => d._id),
    expectedVersions: Object.fromEntries(
      dishes.map((d: any) => [d._id, d.version]),
    ),
    ...(draft && !prepOnly ? { sourceComponentId: draft._id } : {}),
    recipe,
  };
});
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
