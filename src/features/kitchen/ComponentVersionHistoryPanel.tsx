import { useMemo, useState } from "react";
import { formatDate, formatTime } from "../../lib/format";
import {
  diffComponentLines,
  diffComponentScalars,
  parseComponentSnapshot,
  type ComponentSnapshotData,
} from "./componentSnapshot";

type SnapshotRow = {
  _id: string;
  componentId: string;
  versionNumber: number;
  capturedByName: string;
  changeSummary: string;
  snapshot: string;
  capturedAt?: number | null;
  deletedAt?: number | null;
};

type Props = {
  readonly componentId: string;
  readonly snapshots: readonly SnapshotRow[] | undefined;
  readonly currentData: ComponentSnapshotData;
  readonly canRestore: boolean;
  readonly busy: boolean;
  readonly onRestore: (
    data: ComponentSnapshotData,
    versionLabel: string,
  ) => void;
};

const CURRENT = "__current__";

export function ComponentVersionHistoryPanel({
  componentId,
  snapshots,
  currentData,
  canRestore,
  busy,
  onRestore,
}: Props) {
  const history = useMemo(
    () =>
      (snapshots ?? [])
        .filter(
          (row) => row.deletedAt == null && row.componentId === componentId,
        )
        .sort((a, b) => Number(b.capturedAt ?? 0) - Number(a.capturedAt ?? 0)),
    [snapshots, componentId],
  );

  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>(CURRENT);

  const dataFor = (id: string): ComponentSnapshotData | null => {
    if (id === CURRENT) return currentData;
    const row = history.find((r) => r._id === id);
    return row ? parseComponentSnapshot(row.snapshot) : null;
  };
  const labelFor = (id: string): string => {
    if (id === CURRENT) return "Current (live)";
    const row = history.find((r) => r._id === id);
    return row ? `Edition ${row.versionNumber} · ${row.changeSummary}` : "—";
  };

  // Default the left side to the most recent snapshot once history loads.
  const effectiveLeft = leftId || (history[0]?._id ?? "");
  const left = dataFor(effectiveLeft);
  const right = dataFor(rightId);

  const scalarDiff = left && right ? diffComponentScalars(left, right) : [];
  const lineDiff = left && right ? diffComponentLines(left, right) : [];

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Version history</h2>
        <span>{history.length} snapshots</span>
      </div>

      {history.length === 0 ? (
        <div className="document-empty">
          <p>No prior versions recorded yet.</p>
          <span>
            Each edit to this component captures a snapshot with author and
            time.
          </span>
        </div>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
            {history.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div>
                  <p className="text-[13px] text-ink">
                    Edition {row.versionNumber} · {row.changeSummary}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                    {row.capturedByName || "Unknown"} ·{" "}
                    {row.capturedAt
                      ? `${formatDate(row.capturedAt)} ${formatTime(row.capturedAt)}`
                      : "—"}
                  </p>
                </div>
                {canRestore ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const data = parseComponentSnapshot(row.snapshot);
                      if (!data) return;
                      if (
                        !window.confirm(
                          `Restore this draft to Edition ${row.versionNumber}? Current values will be captured first.`,
                        )
                      )
                        return;
                      onRestore(data, `Edition ${row.versionNumber}`);
                    }}
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field-label">
              Compare
              <select
                className="input"
                value={effectiveLeft}
                onChange={(e) => setLeftId(e.target.value)}
              >
                {history.map((row) => (
                  <option key={row._id} value={row._id}>
                    Edition {row.versionNumber} · {row.changeSummary}
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-2 text-ink-3">→</span>
            <label className="field-label">
              With
              <select
                className="input"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
              >
                <option value={CURRENT}>Current (live)</option>
                {history.map((row) => (
                  <option key={row._id} value={row._id}>
                    Edition {row.versionNumber} · {row.changeSummary}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {left && right ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-[10rem_1fr_1fr] gap-2 text-[13px]">
                <div className="font-mono text-[11px] text-ink-3">Field</div>
                <div className="font-mono text-[11px] text-ink-3">
                  {labelFor(effectiveLeft)}
                </div>
                <div className="font-mono text-[11px] text-ink-3">
                  {labelFor(rightId)}
                </div>
                {scalarDiff.map((d) => (
                  <FieldRow
                    key={d.label}
                    label={d.label}
                    before={d.before}
                    after={d.after}
                    changed={d.changed}
                  />
                ))}
              </div>

              <div>
                <div className="culinary-section-heading">
                  <h3 className="font-display text-lg">Ingredient lines</h3>
                </div>
                {lineDiff.length === 0 ? (
                  <p className="text-[13px] text-ink-3">No ingredient lines.</p>
                ) : (
                  <ul className="divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
                    {lineDiff.map((d) => (
                      <li
                        key={d.ingredientId}
                        className="grid grid-cols-[10rem_1fr_1fr] gap-2 px-3 py-2 text-[13px]"
                      >
                        <span className="text-ink">
                          {d.ingredientName}
                          {d.status !== "same" ? (
                            <span
                              className={`ml-1 font-mono text-[10px] ${d.status === "removed" ? "text-danger" : d.status === "added" ? "text-success" : "text-warning"}`}
                            >
                              {d.status}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-ink-3">{d.before ?? "—"}</span>
                        <span
                          className={
                            d.status === "same" ? "text-ink-3" : "text-ink"
                          }
                        >
                          {d.after ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function FieldRow({
  label,
  before,
  after,
  changed,
}: {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}) {
  return (
    <>
      <div className="text-ink-3">{label}</div>
      <div className="text-ink-3">{before || "—"}</div>
      <div className={changed ? "font-medium text-ink" : "text-ink-3"}>
        {after || "—"}
      </div>
    </>
  );
}
