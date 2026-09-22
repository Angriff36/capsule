import { useState } from "react";
import {
  RECLASSIFY_KIND_LABEL,
  RECLASSIFY_KINDS,
  type ReclassifyKind,
} from "../../../convex/lib/culinaryModel/catalogReclassification";
import type {
  PlanGroup,
  PlanRow,
} from "../../../convex/catalogReclassification";
import {
  useApplyCatalogReclassification,
  useCatalogReclassificationPlan,
  useDecideCatalogReclassification,
} from "../../lib/catalogReclassificationClient";
import { TableSkeleton } from "../../ui/primitives";
import { useSuccessToast } from "../../ui/useSuccessToast";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { KitchenBookNav } from "./KitchenBookNav";

const APPLY_BATCH = 25;
const PREVIEW_ROWS = 40;

const sourceLabel = (row: PlanRow) =>
  row.source.startsWith("rule:")
    ? `Rule · ${row.source.slice(5)}`
    : row.source.startsWith("person:")
      ? "Person"
      : `Jev · ${Math.round(row.confidence * 100)}%`;

const stateLabel = (row: PlanRow) =>
  row.applied
    ? "Applied"
    : row.decision === "approved"
      ? "Approved"
      : row.decision === "rejected"
        ? "Rejected"
        : row.ready
          ? "Ready"
          : "Needs a look";

function GroupSection({
  group,
  busy,
  onDecide,
  onApply,
}: {
  group: PlanGroup;
  busy: boolean;
  onDecide: (
    linkIds: string[],
    decision: "approved" | "rejected",
    kind?: ReclassifyKind,
  ) => Promise<void>;
  onApply: (group: PlanGroup) => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const readyIds = group.rows
    .filter((r) => !r.applied && r.decision === "suggested" && r.ready)
    .map((r) => r.linkId);
  const approvedCount = group.rows.filter(
    (r) => !r.applied && r.decision === "approved",
  ).length;
  const rows = showAll ? group.rows : group.rows.slice(0, PREVIEW_ROWS);

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>{RECLASSIFY_KIND_LABEL[group.kind]}</h2>
        <span>{group.total}</span>
      </div>
      <p className="text-sm text-ink-2">
        {group.ready} ready · {group.needsLook} need a look · {group.approved}{" "}
        approved · {group.rejected} rejected · {group.applied} applied
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || readyIds.length === 0}
          onClick={() => void onDecide(readyIds, "approved")}
        >
          Approve all ready ({readyIds.length})
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || approvedCount === 0}
          onClick={() => void onApply(group)}
        >
          Apply approved ({approvedCount})
        </button>
      </div>
      <table className="data-table mt-3">
        <thead>
          <tr>
            <th>Row</th>
            <th>Decided by</th>
            <th>State</th>
            <th>Parents</th>
            <th>Existing</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.linkId}>
              <td>
                <CulinaryEntityLink kind="dish" id={row.dishId}>
                  {row.name}
                </CulinaryEntityLink>
                {row.category ? (
                  <span className="ml-2 text-xs text-ink-2">
                    → {row.category}
                  </span>
                ) : null}
              </td>
              <td>{sourceLabel(row)}</td>
              <td>
                {stateLabel(row)}
                {row.outcome ? (
                  <span className="ml-2 text-xs text-ink-2">{row.outcome}</span>
                ) : null}
              </td>
              <td>{row.parentCount}</td>
              <td>{row.existingCount}</td>
              <td>
                {row.applied ? null : (
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      className="input"
                      aria-label="Kind"
                      value={row.kind}
                      disabled={busy}
                      onChange={(event) =>
                        void onDecide(
                          [row.linkId],
                          "approved",
                          event.target.value as ReclassifyKind,
                        )
                      }
                    >
                      {RECLASSIFY_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {RECLASSIFY_KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                    {row.decision !== "approved" ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => void onDecide([row.linkId], "approved")}
                      >
                        Approve
                      </button>
                    ) : null}
                    {row.decision !== "rejected" ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => void onDecide([row.linkId], "rejected")}
                      >
                        Keep as is
                      </button>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.rows.length > PREVIEW_ROWS ? (
        <button
          type="button"
          className="btn btn-ghost mt-2"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "Show fewer" : `Show all ${group.rows.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** Review and apply what each imported TPP menu row really is. */
export function KitchenCatalogCleanupPage() {
  const plan = useCatalogReclassificationPlan();
  const decide = useDecideCatalogReclassification();
  const apply = useApplyCatalogReclassification();
  const { notifySuccess, host } = useSuccessToast();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setFailure(null);
    try {
      notifySuccess(await work());
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onDecide = (
    linkIds: string[],
    decision: "approved" | "rejected",
    kind?: ReclassifyKind,
  ) =>
    run(async () => {
      const result = await decide({ linkIds, decision, kind });
      return `${result.changed} row(s) ${decision}`;
    });

  const onApply = (group: PlanGroup) =>
    run(async () => {
      const ids = group.rows
        .filter((r) => !r.applied && r.decision === "approved")
        .map((r) => r.linkId);
      const stamp = Date.now();
      let done = 0;
      let failed = 0;
      for (let i = 0; i < ids.length; i += APPLY_BATCH) {
        setProgress(
          `${RECLASSIFY_KIND_LABEL[group.kind]}: ${done}/${ids.length}`,
        );
        const result = await apply({
          operationKey: `cleanup:${group.kind}:${stamp}:${i}`,
          linkIds: ids.slice(i, i + APPLY_BATCH),
        });
        done += result.outcomes.filter((o) => !o.error).length;
        failed += result.outcomes.filter((o) => o.error).length;
      }
      return failed
        ? `${done} applied, ${failed} failed (see the row's state)`
        : `${done} applied`;
    });

  const groups = plan?.groups ?? [];
  const total = groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <div className="component-book-stage culinary-studio">
      <header className="component-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · Cleanup</p>
          <h1 className="display-title mt-2">Catalog cleanup</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Imported TPP menu rows sorted into what they really are. Rules
            decided most; Jev suggested the rest. Approve a group, then apply. A
            row that stops being a dish is retired, never deleted, and its link
            names the new record.
          </p>
        </div>
      </header>

      <KitchenBookNav />
      {host}

      {failure ? (
        <div className="card mt-4 border-danger text-danger">{failure}</div>
      ) : null}
      {progress ? <p className="mt-2 text-sm text-ink-2">{progress}</p> : null}

      {plan === undefined ? (
        <div className="card mt-4">
          <TableSkeleton rows={6} />
        </div>
      ) : total === 0 ? (
        <div className="document-empty mt-4">
          <p>
            No suggestions recorded yet. Run the planner script
            (scripts/catalog-reclassification-plan.ts) against this backend.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <GroupSection
            key={group.kind}
            group={group}
            busy={busy}
            onDecide={onDecide}
            onApply={onApply}
          />
        ))
      )}
    </div>
  );
}
