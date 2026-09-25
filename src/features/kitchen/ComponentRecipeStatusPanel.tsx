import {
  recipeContentStatusLabel,
  recipeCostLine,
  useComponentContentReport,
} from "../../lib/culinaryDemandClient";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { StatusChip } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";

/** What the kitchen needs before it can cook or cost this recipe. */
export function ComponentRecipeStatusPanel({
  componentId,
}: {
  componentId: string;
}) {
  const report = useComponentContentReport(componentId);
  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Recipe status</h2>
        {report ? (
          <StatusChip
            status={report.contentStatus}
            label={recipeContentStatusLabel(report.contentStatus)}
            color={
              report.contentStatus === "complete"
                ? CHIP_TONE_CLASS.ok
                : CHIP_TONE_CLASS.warn
            }
          />
        ) : null}
      </div>
      {report === undefined ? (
        <p className="py-4 text-base text-ink-2" role="status">
          Loading recipe status…
        </p>
      ) : report === null ? (
        <p className="py-4 text-base text-ink-2">
          Recipe status isn't available for this item.
        </p>
      ) : (
        <>
          <p className="text-base text-ink-2">{recipeCostLine(report.cost)}</p>
          {report.cost.cycle ? (
            <p className="text-base text-danger">
              This recipe contains itself: {report.cost.cycle.join(" → ")}.
              Remove one sub-recipe line.
            </p>
          ) : null}
          <div className="culinary-work-grid">
            <div>
              <p className="eyebrow">Sub-recipes</p>
              {report.nestedChildren.length ? (
                <ul className="space-y-2">
                  {report.nestedChildren.map((child) => (
                    <li
                      key={child.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <CulinaryEntityLink kind="component" id={child.id}>
                        {child.name}
                      </CulinaryEntityLink>
                      <StatusChip
                        status={child.contentStatus}
                        label={recipeContentStatusLabel(child.contentStatus)}
                        color={
                          child.contentStatus === "complete"
                            ? CHIP_TONE_CLASS.ok
                            : CHIP_TONE_CLASS.warn
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-ink-2">
                  This recipe uses no other recipe.
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow">Used in</p>
              {report.usedBy.length ? (
                <ul className="space-y-2">
                  {report.usedBy.map((parent) => (
                    <li key={parent.componentId}>
                      <CulinaryEntityLink
                        kind="component"
                        id={parent.componentId}
                      >
                        {parent.name}
                      </CulinaryEntityLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-ink-2">
                  No other recipe uses this one.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
