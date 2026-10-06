// PL-CUTOVER (AC-293): check one period - the agreed test year, then the
// whole history - against the written tolerances
// (codex-plans/production-readiness-next/migration-reconciliation.md).
// Differences it finds join the list above, to be settled the same way.

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import type { ComparisonSummary } from "@/lib/parallelRunCompare";
import { useActionFailure } from "../../../ui/action-result";
import { classifyCommandFailure } from "../../events/CommandFailure";
import { FailureBanner } from "../../events/FailureBanner";
import { formatDateTime } from "../../../lib/format";

export interface PeriodCheckResult {
  comparedAt: number;
  from: number;
  to: number;
  verdict: { passed: boolean; reasons: string[] };
  summary: ComparisonSummary;
}

const lastYear = new Date().getFullYear() - 1;

function dayStart(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}

function dayEnd(value: string): number {
  return dayStart(value) + 24 * 60 * 60 * 1000 - 1;
}

function money(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ParallelRunPeriodCheck({
  last,
}: {
  last: PeriodCheckResult | null;
}) {
  const reconcile = useMutation(api.parallelRun.reconcilePeriod);
  const [from, setFrom] = useState(`${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31`);
  const [checking, setChecking] = useState(false);
  const { error, setError } = useActionFailure();

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      await reconcile({ from: dayStart(from), to: dayEnd(to) });
    } catch (err) {
      const failure = classifyCommandFailure(err);
      setError(`${failure.title}: ${failure.detail}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="working-ledger mt-6">
      <div className="ledger-heading">
        <div>
          <h2>Check a period</h2>
          <p className="text-xs text-ink-2">
            Check the test year first, then the whole history. A period passes
            when every TPP event has its Capsule event, no extra events, prices
            agree to the cent, and every difference is settled.
          </p>
        </div>
      </div>
      {error && (
        <FailureBanner failure={classifyCommandFailure(new Error(error))} />
      )}
      <div className="flex flex-wrap items-end gap-3 p-2">
        <label className="text-xs text-ink-2">
          <span className="block">First day</span>
          <input
            type="date"
            className="input input-sm"
            max="9999-12-31"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-xs text-ink-2">
          <span className="block">Last day</span>
          <input
            type="date"
            className="input input-sm"
            max="9999-12-31"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={checking || !from || !to}
          onClick={() => void check()}
        >
          {checking ? "Checking…" : "Check this period"}
        </button>
      </div>
      {last && (
        <div className="p-2 text-sm">
          <p className={last.verdict.passed ? "text-ok" : "text-warn"}>
            {new Date(last.from).toLocaleDateString()} –{" "}
            {new Date(last.to).toLocaleDateString()}:{" "}
            {last.verdict.passed
              ? "✓ TPP and Capsule agree within the written tolerances"
              : "Does not agree yet"}
          </p>
          <p className="text-xs text-ink-3">
            TPP {last.summary.tpp.events} events,{" "}
            {money(last.summary.tpp.revenue)} · Capsule{" "}
            {last.summary.capsule.events} events,{" "}
            {money(last.summary.capsule.revenue)} · checked{" "}
            {formatDateTime(last.comparedAt)}
          </p>
          {last.verdict.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {last.verdict.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
