import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Section, Skeleton } from "../../ui/primitives";

const WEEK = 7 * 24 * 60 * 60_000;

/**
 * PL-AUDIT (AC-209/AC-636): did every change of the last week keep its
 * "who did it" note, and is an import still running or stopped part way.
 */
export function StepHistorySection() {
  const [since] = useState(() => Date.now() - WEEK);
  const check = useQuery(api.recordHistory.auditCheck, { since });
  if (check === null) return null;
  return (
    <Section title="Change history">
      <div className="p-4">
        {check === undefined ? (
          <Skeleton className="h-6" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-ink">Who changed what</span>
              <span
                className={check.missing > 0 ? "text-danger" : "text-ink-3"}
              >
                {check.missing > 0
                  ? `${check.missing} of ${check.checked} recent changes have no "who did it" note`
                  : `${check.checked} recent changes, all with a "who did it" note`}
              </span>
            </li>
            {check.imports.map((run) => (
              <li
                key={run.importRunId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="font-medium text-ink">
                  Import of {run.kind.replace(/_/g, " ")}
                </span>
                <span
                  className={
                    run.state === "running" ? "text-ink-3" : "text-danger"
                  }
                >
                  {run.state === "running"
                    ? "Still running"
                    : "Stopped part way"}
                  {" · "}
                  <Link
                    className="underline"
                    to={`/admin/imports/${run.importRunId}`}
                  >
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
