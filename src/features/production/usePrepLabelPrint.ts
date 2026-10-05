import {
  useListComponent,
  useListComponentIngredient,
  useListDishComponent,
  useListDishIngredient,
  useListIngredient,
  useListPerson,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";
import { reportActionFail } from "../../ui/action-result";
import type { AllergenSourceRecord } from "../kitchen/dishAllergens";
import {
  PREP_LABEL_STOCKS,
  prepLabelAllergens,
  prepLabelUseBy,
  printPrepLabels,
  toLocalInput,
  type PrepLabelStock,
} from "./prepLabel";

/** What a prep task or production batch knows about the food it made. */
export type PrepLabelSource = {
  product: string;
  detail?: string;
  componentId?: string | null;
  dish?: AllergenSourceRecord | null;
  preparedAt?: number | null;
  preparedById?: string | null;
};

/**
 * One-click dated container labels from a prep task or production batch.
 * Opens the page's action prompt prefilled with the record's data, then
 * prints. `ready` is false until the recipe and staff lists load.
 */
export function usePrepLabelPrint(prompt: ActionPromptSession) {
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const dishComponents = useListDishComponent();
  const dishIngredients = useListDishIngredient();
  const ingredients = useListIngredient();
  const people = useListPerson();
  const ready =
    components !== undefined &&
    componentIngredients !== undefined &&
    dishComponents !== undefined &&
    dishIngredients !== undefined &&
    ingredients !== undefined &&
    people !== undefined;

  const print = async (source: PrepLabelSource) => {
    if (!ready) return;
    const preparedAt = source.preparedAt ?? Date.now();
    const component = source.componentId
      ? components.find((row) => row._id === source.componentId)
      : undefined;
    const useBy = prepLabelUseBy(preparedAt, component?.storageWindowDays);
    const person = source.preparedById
      ? people.find((row) => row._id === source.preparedById)
      : undefined;
    const preparedBy = person
      ? `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim()
      : "";
    const allergens = prepLabelAllergens(
      { componentId: source.componentId, dish: source.dish },
      {
        dishIngredients,
        dishComponents,
        componentIngredients,
        ingredients,
        components,
      },
    );

    const values = await prompt.askFields({
      title: `Print label · ${source.product}`,
      description: `${allergens}. Labels print on the stock you pick below.`,
      fields: [
        {
          name: "preparedAt",
          label: "Prepped",
          inputType: "datetime-local",
          defaultValue: toLocalInput(preparedAt),
          required: true,
        },
        {
          name: "useBy",
          label: "Use by",
          inputType: "datetime-local",
          defaultValue: useBy == null ? "" : toLocalInput(useBy),
          required: true,
          helper:
            useBy == null
              ? "This recipe has no storage time on file. Enter the use-by date."
              : `From the recipe's ${component?.storageWindowDays}-day storage time.`,
        },
        {
          name: "preparedBy",
          label: "Prepped by",
          defaultValue: preparedBy,
          required: true,
        },
        {
          name: "stock",
          label: "Label stock",
          defaultValue: "sheet",
          options: PREP_LABEL_STOCKS,
        },
        {
          name: "copies",
          label: "Labels",
          inputType: "number",
          defaultValue: "1",
          required: true,
        },
      ],
      confirmLabel: "Print labels",
      cancelLabel: "Cancel",
    });
    if (!values) return;
    const printed = printPrepLabels(
      {
        product: source.product,
        detail: source.detail,
        preparedAt: new Date(values.preparedAt).getTime(),
        useBy: new Date(values.useBy).getTime(),
        allergens,
        preparedBy: values.preparedBy.trim(),
      },
      values.stock as PrepLabelStock,
      Number(values.copies),
    );
    if (!printed)
      reportActionFail(
        "The browser blocked the label window. Allow pop-ups for Capsule and print again.",
      );
  };

  return { ready, print };
}
