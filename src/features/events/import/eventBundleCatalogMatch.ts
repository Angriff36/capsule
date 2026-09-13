import {
  dishKey,
  isMenuDishLine,
} from "../../../agent/CapsuleEventBundleShared";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";

/**
 * The name matcher lives in the agent layer so the CLI/MCP path reuses the
 * same exact-name rule as this screen (#241); re-exported here for the
 * review UI.
 */
export {
  suggestCatalogMatches,
  type CatalogCandidate,
  type CatalogMatchSuggestion,
} from "../../../agent/CapsuleEventBundleCatalogMatch";

/** Menu lines the plan will turn into dishes, deduplicated by dish key. */
export function bundleDishLines(
  bundle: EventBundle,
): Array<{ key: string; name: string; quantityServings?: number }> {
  const seen = new Set<string>();
  const lines: Array<{ key: string; name: string; quantityServings?: number }> =
    [];
  for (const item of bundle.menu) {
    if (!isMenuDishLine(item)) continue;
    const key = dishKey(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      key,
      name: item.name,
      quantityServings: item.quantityServings,
    });
  }
  return lines;
}
