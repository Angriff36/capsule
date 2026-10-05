import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreateDishComponent,
  useCreateDishIngredient,
  useCreateDishTask,
  useDishUseMainRecipe,
  useListDishComponent,
  useListDishIngredient,
  useListDishTask,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { dishPath } from "./kitchenRoutes";

type Props = {
  dishId: string;
  dishVersion: number;
  mainDishId: string;
  mainName: string;
  /** On when this version cooks from the main dish's recipe. */
  sharing: boolean;
  onFailure: (error: unknown) => void;
};

const orUndefined = <T,>(value: T | null | undefined) => value ?? undefined;

/**
 * On a version: "Use the main dish's recipe". On, the version cooks from the
 * main dish's ingredients, recipes and prep steps. Off, it keeps its own,
 * and can start from a copy of the main recipe.
 */
export function DishVersionRecipeSwitch({
  dishId,
  dishVersion,
  mainDishId,
  mainName,
  sharing,
  onFailure,
}: Props) {
  const setRecipeSource = useDishUseMainRecipe();
  const ingredientLines = useListDishIngredient();
  const componentLines = useListDishComponent();
  const prepSteps = useListDishTask();
  const addIngredient = useCreateDishIngredient();
  const addComponent = useCreateDishComponent();
  const addPrepStep = useCreateDishTask();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);

  const liveFor = <T extends { dishId: string; deletedAt?: number | null }>(
    rows: readonly T[] | undefined,
    id: string,
  ) => (rows ?? []).filter((row) => row.deletedAt == null && row.dishId === id);
  const mainIngredients = liveFor(ingredientLines, mainDishId);
  const mainComponents = liveFor(componentLines, mainDishId);
  const mainSteps = liveFor(prepSteps, mainDishId).filter(
    (step) => step.status === "active",
  );
  const loaded =
    ingredientLines !== undefined &&
    componentLines !== undefined &&
    prepSteps !== undefined;
  const ownLineCount =
    liveFor(ingredientLines, dishId).length +
    liveFor(componentLines, dishId).length +
    liveFor(prepSteps, dishId).filter((step) => step.status === "active")
      .length;
  const mainLineCount =
    mainIngredients.length + mainComponents.length + mainSteps.length;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (shared: boolean) => {
    if (
      !shared &&
      !(await prompt.askConfirm({
        title: "Give this version its own recipe?",
        description: `This version will stop following ${mainName}'s recipe. Changes to ${mainName} will no longer show here.`,
        confirmLabel: "Use its own recipe",
      }))
    ) {
      return;
    }
    await run("toggle", async () => {
      await setRecipeSource({ docId: dishId, version: dishVersion, shared });
    });
  };

  // One key per line and per dish revision, so a retry never adds a line twice.
  const keyFor = (line: { _id: string }) =>
    `copy-main-recipe:${dishId}:${dishVersion}:${line._id}`;
  const copyMainRecipe = () =>
    run("copy", async () => {
      for (const line of mainIngredients) {
        await addIngredient({
          idempotencyKey: keyFor(line),
          dishId,
          ingredientId: line.ingredientId,
          quantity: Number(line.quantity),
          unit: line.unit,
          sortOrder: orUndefined(line.sortOrder),
          wasteFactor: orUndefined(line.wasteFactor),
          prepNotes: orUndefined(line.prepNotes),
        });
      }
      for (const line of mainComponents) {
        await addComponent({
          idempotencyKey: keyFor(line),
          dishId,
          componentId: line.componentId,
          yieldQuantity: Number(line.yieldQuantity),
          batchMultiplier: orUndefined(line.batchMultiplier),
          sortOrder: orUndefined(line.sortOrder),
          role: orUndefined(line.role),
        });
      }
      for (const step of mainSteps) {
        await addPrepStep({
          idempotencyKey: keyFor(step),
          dishId,
          name: step.name,
          category: orUndefined(step.category),
          taskType: orUndefined(step.taskType),
          defaultQuantity: orUndefined(step.defaultQuantity),
          defaultUnit: orUndefined(step.defaultUnit),
          station: orUndefined(step.station),
          sortOrder: orUndefined(step.sortOrder),
          componentId: orUndefined(step.componentId),
          ingredientId: orUndefined(step.ingredientId),
          instructions: orUndefined(step.instructions),
        });
      }
    });

  return (
    <section className="culinary-section" aria-label="Recipe for this version">
      {host}
      <label className="flex items-center gap-2 text-base font-medium text-ink">
        <input
          type="checkbox"
          role="switch"
          checked={sharing}
          disabled={busy != null}
          onChange={(event) => void toggle(event.target.checked)}
        />
        Use the main dish&apos;s recipe
      </label>
      {sharing ? (
        <p className="recipe-note">
          This version uses the main dish&apos;s recipe — changes there apply
          here too.{" "}
          <Link to={dishPath(mainDishId)} className="underline">
            Edit on the main dish
          </Link>
        </p>
      ) : loaded && ownLineCount === 0 && mainLineCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-2">
            This version has no recipe of its own yet.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={() => void copyMainRecipe()}
          >
            {busy === "copy"
              ? "Copying…"
              : "Start from a copy of the main recipe"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
