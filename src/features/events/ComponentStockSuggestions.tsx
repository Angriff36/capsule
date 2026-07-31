import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListInventoryItem,
  useListComponent,
  useListComponentIngredient,
} from "../../lib/manifest-convex-react";
import { Skeleton } from "../../ui/primitives";
import { componentPath } from "../kitchen/kitchenRoutes";

const TOP_N = 6;

type Suggestion = {
  componentId: string;
  name: string;
  coverage: number;
  linesInStock: number;
  lineCount: number;
};

// ponytail: coverage is a demand-weighted-by-line average of onHand/demand per
// ingredient. It ignores unit conversion (component line unit vs inventory unit) —
// good enough to rank "what can I mostly make from stock". Add a unit-normalizer
// if components routinely mix units for the same ingredient.
export function computeSuggestions(
  components: ReturnType<typeof useListComponent>,
  lines: ReturnType<typeof useListComponentIngredient>,
  inventory: ReturnType<typeof useListInventoryItem>,
): Suggestion[] {
  if (!components || !lines || !inventory) return [];

  const onHand = new Map<string, number>();
  for (const item of inventory) {
    if (item.deletedAt != null) continue;
    onHand.set(
      item.ingredientId,
      (onHand.get(item.ingredientId) ?? 0) + item.quantityOnHand,
    );
  }

  const byComponent = new Map<string, typeof lines>();
  for (const line of lines) {
    if (line.deletedAt != null) continue;
    const bucket = byComponent.get(line.componentId) ?? [];
    bucket.push(line);
    byComponent.set(line.componentId, bucket);
  }

  const suggestions: Suggestion[] = [];
  for (const component of components) {
    if (component.deletedAt != null) continue;
    if (String(component.status) !== "published") continue;
    const componentLines = byComponent.get(component._id);
    if (!componentLines || componentLines.length === 0) continue;

    let ratioSum = 0;
    let linesInStock = 0;
    let counted = 0;
    for (const line of componentLines) {
      const demand = line.quantity * (line.wasteFactor ?? 1);
      if (demand <= 0) continue;
      counted += 1;
      const available = onHand.get(line.ingredientId) ?? 0;
      const ratio = Math.min(available / demand, 1);
      ratioSum += ratio;
      if (ratio >= 1) linesInStock += 1;
    }
    if (counted === 0) continue;

    suggestions.push({
      componentId: component._id,
      name: component.name,
      coverage: ratioSum / counted,
      linesInStock,
      lineCount: counted,
    });
  }

  return suggestions
    .filter((s) => s.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, TOP_N);
}

export function ComponentStockSuggestions() {
  const components = useListComponent();
  const lines = useListComponentIngredient();
  const inventory = useListInventoryItem();
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () => computeSuggestions(components, lines, inventory),
    [components, lines, inventory],
  );

  const loading = components == null || lines == null || inventory == null;

  return (
    <section
      className="border border-line bg-panel"
      data-testid="component-stock-suggestions"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="text-lg font-semibold">Suggested from stock</span>
          <span className="ml-2 text-base text-ink-2">
            Components you can mostly make with ingredients already on hand
          </span>
        </span>
        <span className="text-base text-ink-3">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="border-t border-line p-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-base text-ink-2">
              No published components have ingredient coverage from current
              stock.
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.componentId}
                  className="flex items-center justify-between gap-3"
                  data-testid="component-stock-suggestion"
                >
                  <Link
                    to={componentPath(suggestion.componentId)}
                    className="text-lg font-medium hover:underline"
                  >
                    {suggestion.name}
                  </Link>
                  <span className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-ink-3">
                    <span
                      className="inline-block h-1.5 w-24 overflow-hidden rounded-xs bg-line"
                      aria-hidden
                    >
                      <span
                        className="block h-full bg-ink-2"
                        style={{
                          width: `${Math.round(suggestion.coverage * 100)}%`,
                        }}
                      />
                    </span>
                    {Math.round(suggestion.coverage * 100)}% ·{" "}
                    {suggestion.linesInStock}/{suggestion.lineCount} in stock
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
