import {
  DishReinstateLifecycle,
  DishRetireLifecycle,
  IngredientDiscontinueLifecycle,
  IngredientReinstateLifecycle,
  MenuArchiveLifecycle,
  MenuMarkPublishedLifecycle,
  MenuRestoreLifecycle,
  MenuUnpublishLifecycle,
  RecipePublishVersionLifecycle,
  RecipeReinstateLifecycle,
  RecipeRetractLifecycle,
  RecipeRetireLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface CulinaryAction<Key extends string = string> {
  key: Key;
  label: string;
}

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function available<Key extends string>(
  status: string,
  actions: readonly (CulinaryAction<Key> & { lifecycle: Lifecycle })[],
): CulinaryAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const RECIPE_ACTIONS = [
  {
    key: "publishVersion",
    label: "Publish",
    lifecycle: RecipePublishVersionLifecycle,
  },
  {
    key: "retract",
    label: "Return to draft",
    lifecycle: RecipeRetractLifecycle,
  },
  { key: "retire", label: "Retire", lifecycle: RecipeRetireLifecycle },
  {
    key: "reinstate",
    label: "Reinstate",
    lifecycle: RecipeReinstateLifecycle,
  },
] as const;

const INGREDIENT_ACTIONS = [
  {
    key: "discontinue",
    label: "Discontinue",
    lifecycle: IngredientDiscontinueLifecycle,
  },
  {
    key: "reinstate",
    label: "Reinstate",
    lifecycle: IngredientReinstateLifecycle,
  },
] as const;

const DISH_ACTIONS = [
  { key: "retire", label: "Retire", lifecycle: DishRetireLifecycle },
  { key: "reinstate", label: "Reinstate", lifecycle: DishReinstateLifecycle },
] as const;

const MENU_ACTIONS = [
  {
    key: "markPublished",
    label: "Publish",
    lifecycle: MenuMarkPublishedLifecycle,
  },
  {
    key: "unpublish",
    label: "Return to draft",
    lifecycle: MenuUnpublishLifecycle,
  },
  { key: "archive", label: "Archive", lifecycle: MenuArchiveLifecycle },
  { key: "restore", label: "Restore draft", lifecycle: MenuRestoreLifecycle },
] as const;

export class CulinaryLifecyclePolicy {
  recipeActions(status: string) {
    // Wiring lifecycle proofs attribute every status→draft edge to both
    // retract and reinstate. Narrow to the command guards: retract only from
    // published, reinstate only from retired.
    return available(status, RECIPE_ACTIONS).filter((action) => {
      if (action.key === "retract") return status === "published";
      if (action.key === "reinstate") return status === "retired";
      return true;
    });
  }

  ingredientActions(status: string) {
    return available(status, INGREDIENT_ACTIONS);
  }

  dishActions(status: string) {
    return available(status, DISH_ACTIONS);
  }

  menuActions(status: string) {
    return available(status, MENU_ACTIONS);
  }
}
