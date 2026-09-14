import { Link } from "react-router-dom";
import { formatDate, formatMoney } from "../../lib/format";
import {
  recipeContentStatusLabel,
  unresolvedKindLabel,
  useKitchenUnresolvedReport,
} from "../../lib/culinaryDemandClient";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { KitchenBookNav } from "./KitchenBookNav";

type EventRow = NonNullable<
  ReturnType<typeof useKitchenUnresolvedReport>
>["events"][number];

function EventUnresolvedCard({ row }: { row: EventRow }) {
  const byKind = new Map<string, EventRow["unresolved"]>();
  for (const item of row.unresolved) {
    const group = byKind.get(item.kind) ?? [];
    group.push(item);
    byKind.set(item.kind, group);
  }
  return (
    <article className="card space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link className="text-link" to={`/events/${row.eventId}?tab=prep`}>
            {row.eventName}
          </Link>
          {row.startsAt != null ? (
            <p className="text-sm text-ink-2">{formatDate(row.startsAt)}</p>
          ) : null}
        </div>
        {row.purchasingComplete ? null : (
          <StatusChip
            status="purchasing_incomplete"
            label="Purchasing total incomplete"
            color={CHIP_TONE_CLASS.warn}
          />
        )}
      </div>
      {[...byKind.entries()].map(([kind, group]) => (
        <div key={kind} className="space-y-1">
          <p className="text-sm font-medium text-ink">
            {unresolvedKindLabel(kind)}
          </p>
          <ul className="space-y-1">
            {group.map((item) => (
              <li
                key={`${item.kind}:${item.eventDishId}:${item.refId}`}
                className="text-base text-ink-2"
              >
                {item.label} — {item.detail}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  );
}

/** Everything the kitchen must settle before it can cook or order: events with
 *  unresolved materials, and recipes with missing content or an unknown cost. */
export function KitchenUnresolvedWorkPage() {
  const report = useKitchenUnresolvedReport();

  return (
    <div className="component-book-stage culinary-studio">
      <header className="component-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · Unresolved</p>
          <h1 className="display-title mt-2">Unresolved work</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Materials the plan cannot price or order yet, and recipes with no
            method, no ingredients or no known cost.
          </p>
        </div>
      </header>

      <KitchenBookNav />

      {report === undefined ? (
        <div className="card mt-4">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <>
          <section className="culinary-section">
            <div className="culinary-section-heading">
              <h2>Events</h2>
              <span>{report.events.length}</span>
            </div>
            {report.events.length === 0 ? (
              <div className="document-empty">
                <p>Every live event has a complete plan.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {report.events.map((row) => (
                  <EventUnresolvedCard key={row.eventId} row={row} />
                ))}
              </div>
            )}
          </section>

          <section className="culinary-section">
            <div className="culinary-section-heading">
              <h2>Recipes</h2>
              <span>{report.recipes.length}</span>
            </div>
            {report.recipes.length === 0 ? (
              <div className="document-empty">
                <p>Every recipe has its method, ingredients and cost.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th>Content</th>
                    <th>Cost confidence</th>
                    <th>Known subtotal</th>
                    <th>Unknown lines</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recipes.map((recipe) => (
                    <tr key={recipe.componentId}>
                      <td>
                        <CulinaryEntityLink
                          kind="component"
                          id={recipe.componentId}
                        >
                          {recipe.name}
                        </CulinaryEntityLink>
                      </td>
                      <td>
                        <StatusChip
                          status={recipe.contentStatus}
                          label={recipeContentStatusLabel(recipe.contentStatus)}
                          color={
                            recipe.contentStatus === "complete"
                              ? CHIP_TONE_CLASS.ok
                              : CHIP_TONE_CLASS.warn
                          }
                        />
                      </td>
                      <td>{recipe.costConfidence}</td>
                      <td>
                        {recipe.costConfidence === "none"
                          ? "Cost unknown"
                          : formatMoney(recipe.knownSubtotal)}
                      </td>
                      <td>{recipe.unknownLines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
