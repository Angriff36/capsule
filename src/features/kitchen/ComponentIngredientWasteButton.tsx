import type { ActionPromptSession } from "../../ui/action-prompt";

/**
 * Trim and waste multiplier of one ingredient line. 1 means nothing is lost;
 * 1.2 means the kitchen buys 20% more than the recipe uses.
 */
export function ComponentIngredientWasteButton({
  ingredientName,
  wasteFactor,
  disabled,
  prompt,
  onSave,
}: {
  ingredientName: string;
  wasteFactor?: number | null;
  disabled: boolean;
  prompt: ActionPromptSession;
  onSave: (wasteFactor: number) => Promise<void>;
}) {
  const current = wasteFactor ?? 1;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={disabled}
      title={`Waste factor ${current}`}
      onClick={() => {
        void (async () => {
          const values = await prompt.askFields({
            title: "Set waste factor",
            description: `Trim and waste multiplier for ${ingredientName}. 1 is no waste; 1.2 buys 20% more than the recipe uses.`,
            fields: [
              {
                name: "wasteFactor",
                label: "Waste factor",
                inputType: "number",
                defaultValue: String(current),
                required: true,
              },
            ],
            confirmLabel: "Save waste factor",
          });
          if (!values) return;
          const next = Number(values.wasteFactor);
          if (!Number.isFinite(next) || next <= 0) return;
          await onSave(next);
        })();
      }}
    >
      Waste
    </button>
  );
}
