import { useMemo, useState } from "react";
import { formatCountNoun, formatMoney } from "../../lib/format";
import {
  useListEvent,
  useListIngredient,
  useListWasteRecord,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { WASTE_REASON_LABELS, WasteRecordForm } from "./WasteRecordForm";
import "./WasteCostReportPage.css";

const PERIODS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

const NO_EVENT_KEY = "__none__";

type Bucket = {
  key: string;
  label: string;
  entries: number;
  cost: number;
  quantities: Map<string, number>;
  reasonCost: Map<string, number>;
};

export function WasteCostReportPage() {
  const wasteRecords = useListWasteRecord();
  const ingredients = useListIngredient();
  const events = useListEvent();
  const [periodKey, setPeriodKey] =
    useState<(typeof PERIODS)[number]["key"]>("30");
  const [recording, setRecording] = useState(false);

  const period = PERIODS.find((option) => option.key === periodKey)!;
  const loading = wasteRecords === undefined || ingredients === undefined;

  const report = useMemo(() => {
    const cutoff =
      period.days == null ? 0 : Date.now() - period.days * 24 * 60 * 60 * 1000;
    const rows = (wasteRecords ?? []).filter((record) => {
      if (record.deletedAt != null || record.status !== "recorded")
        return false;
      const occurredAt =
        record.recordedAt ?? record.createdAt ?? record._creationTime;
      return occurredAt >= cutoff;
    });

    const byIngredient = new Map<string, Bucket>();
    const byEvent = new Map<string, Bucket>();
    const byReason = new Map<string, Bucket>();
    let totalCost = 0;

    for (const record of rows) {
      const cost = record.quantity * record.unitCost;
      totalCost += cost;

      const reasonBucket = upsert(
        byReason,
        record.reason,
        WASTE_REASON_LABELS[record.reason] ?? record.reason,
      );
      addToBucket(reasonBucket, record, cost);

      const ingredientBucket = upsert(
        byIngredient,
        record.ingredientId,
        ingredients?.find((row) => row._id === record.ingredientId)?.name ??
          "Unknown ingredient",
      );
      addToBucket(ingredientBucket, record, cost);

      const eventKey = record.eventId ?? NO_EVENT_KEY;
      const eventBucket = upsert(
        byEvent,
        eventKey,
        record.eventId
          ? (events?.find((row) => row._id === record.eventId)?.title ??
              "Unknown event")
          : "No event · kitchen operations",
      );
      addToBucket(eventBucket, record, cost);
    }

    const rank = (buckets: Map<string, Bucket>) =>
      [...buckets.values()].sort(
        (left, right) =>
          right.cost - left.cost || left.label.localeCompare(right.label),
      );

    return {
      entryCount: rows.length,
      totalCost,
      ingredientRanking: rank(byIngredient),
      eventRanking: rank(byEvent),
      reasonRanking: rank(byReason),
    };
  }, [events, ingredients, period.days, wasteRecords]);

  const worstReason = report.reasonRanking[0];

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Inventory · Cost impact</p>
          <h1 className="display-title mt-2">Waste cost report</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Recorded waste priced at its captured unit cost, ranked so the most
            expensive ingredients and events surface first for purchasing,
            portioning, or storage fixes.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <label className="field-label" htmlFor="waste-report-period">
            Period
            <select
              id="waste-report-period"
              className="input"
              value={periodKey}
              onChange={(event) =>
                setPeriodKey(
                  event.currentTarget.value as (typeof PERIODS)[number]["key"],
                )
              }
            >
              {PERIODS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            onClick={() => setRecording(true)}
          >
            Record waste
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />
      {recording ? (
        <WasteRecordForm onClose={() => setRecording(false)} />
      ) : null}

      <div className="waste-report-stats" aria-live="polite">
        <ReportStat
          label="Total waste value"
          value={formatMoney(report.totalCost)}
        />
        <ReportStat label="Waste entries" value={report.entryCount} />
        <ReportStat
          label="Ingredients affected"
          value={report.ingredientRanking.length}
        />
        <ReportStat
          label="Top reason"
          value={
            worstReason
              ? `${worstReason.label} · ${formatMoney(worstReason.cost)}`
              : "—"
          }
        />
      </div>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">{period.label}</p>
            <h2>Waste by reason</h2>
          </div>
          <span>{formatCountNoun(report.reasonRanking.length, "reason")}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : report.reasonRanking.length === 0 ? (
          <div className="document-empty">
            <p>No recorded waste in this period.</p>
            <span>
              Every waste entry carries a reason code, so unavoidable loss
              (spoilage, date expired) separates from correctable process
              failures (over-prep, dropped, quality reject).
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="waste-by-reason">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Reason</th>
                  <th>Entries</th>
                  <th>Quantity</th>
                  <th>Waste value</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {report.reasonRanking.map((bucket, index) => (
                  <tr key={bucket.key}>
                    <td className="supply-number">{index + 1}</td>
                    <td>
                      <strong>{bucket.label}</strong>
                    </td>
                    <td className="supply-number">{bucket.entries}</td>
                    <td>{formatQuantities(bucket.quantities)}</td>
                    <td className="supply-number">
                      <strong>{formatMoney(bucket.cost)}</strong>
                    </td>
                    <td className="supply-number">
                      {report.totalCost > 0
                        ? `${((bucket.cost / report.totalCost) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">{period.label}</p>
            <h2>Top wasted ingredients by cost</h2>
          </div>
          <span>
            {formatCountNoun(report.ingredientRanking.length, "ingredient")}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={6} />
        ) : report.ingredientRanking.length === 0 ? (
          <div className="document-empty">
            <p>No recorded waste in this period.</p>
            <span>
              Waste recorded against stock will be priced and ranked here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="waste-by-ingredient">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Ingredient</th>
                  <th>Entries</th>
                  <th>Quantity</th>
                  <th>Top reason</th>
                  <th>Waste value</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {report.ingredientRanking.map((bucket, index) => (
                  <BucketRow
                    key={bucket.key}
                    rank={index + 1}
                    bucket={bucket}
                    totalCost={report.totalCost}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">{period.label}</p>
            <h2>Waste by event</h2>
          </div>
          <span>{formatCountNoun(report.eventRanking.length, "source")}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : report.eventRanking.length === 0 ? (
          <div className="document-empty">
            <p>No recorded waste in this period.</p>
            <span>Event-linked waste totals will appear here.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="waste-by-event">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Event</th>
                  <th>Entries</th>
                  <th>Quantity</th>
                  <th>Top reason</th>
                  <th>Waste value</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {report.eventRanking.map((bucket, index) => (
                  <BucketRow
                    key={bucket.key}
                    rank={index + 1}
                    bucket={bucket}
                    totalCost={report.totalCost}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function upsert(buckets: Map<string, Bucket>, key: string, label: string) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      key,
      label,
      entries: 0,
      cost: 0,
      quantities: new Map(),
      reasonCost: new Map(),
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function addToBucket(
  bucket: Bucket,
  record: { quantity: number; unit: string; reason: string },
  cost: number,
) {
  bucket.entries += 1;
  bucket.cost += cost;
  bucket.quantities.set(
    record.unit,
    (bucket.quantities.get(record.unit) ?? 0) + record.quantity,
  );
  bucket.reasonCost.set(
    record.reason,
    (bucket.reasonCost.get(record.reason) ?? 0) + cost,
  );
}

function BucketRow({
  rank,
  bucket,
  totalCost,
}: {
  rank: number;
  bucket: Bucket;
  totalCost: number;
}) {
  const topReason = [...bucket.reasonCost.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  return (
    <tr>
      <td className="supply-number">{rank}</td>
      <td>
        <strong>{bucket.label}</strong>
      </td>
      <td className="supply-number">{bucket.entries}</td>
      <td>{formatQuantities(bucket.quantities)}</td>
      <td>
        {topReason ? (WASTE_REASON_LABELS[topReason[0]] ?? topReason[0]) : "—"}
      </td>
      <td className="supply-number">
        <strong>{formatMoney(bucket.cost)}</strong>
      </td>
      <td className="supply-number">
        {totalCost > 0
          ? `${((bucket.cost / totalCost) * 100).toFixed(1)}%`
          : "—"}
      </td>
    </tr>
  );
}

function formatQuantities(quantities: Map<string, number>): string {
  const quantityFmt = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  });
  return [...quantities.entries()]
    .map(([unit, quantity]) => `${quantityFmt.format(quantity)} ${unit}`)
    .join(" · ");
}

function ReportStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
