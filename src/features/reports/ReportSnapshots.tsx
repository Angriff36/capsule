import { useMemo, useState } from "react";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateSavedReportSnapshot,
  useListSavedReportSnapshot,
  useSavedReportSnapshotRemove,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import type { ReportChartType, ReportSubjectArea } from "./ReportCreateForm";
import type { ReportLeftOut } from "./LiveReportData";
import { ReportResult } from "./LiveReportWorkspace";
import type {
  LiveReportModel,
  ReportDateWindow,
  SavedReportRow,
} from "./liveReportModel";
import type { ReportFilters } from "./reportFilters";
import {
  readReportSnapshotFigures,
  reportSnapshotFigures,
} from "./reportSnapshot";
import { ReportsFailureBanner } from "./ReportsFailureBanner";

interface SnapshotRow {
  _id: string;
  version: number;
  savedReportDefinitionId?: string | null;
  title: string;
  figures: unknown;
  sourceAsOf?: number | null;
  capturedAt?: number | null;
  capturedByPersonId?: string | null;
  deletedAt?: number | null;
}

function dateTime(value: number | null | undefined): string {
  return value == null ? "" : `${formatDate(value)} ${formatTime(value)}`;
}

/**
 * Dated copies of this report's figures. Taking one keeps the numbers exactly
 * as shown; opening one shows them again, marked with the day they were taken,
 * however the records have changed since.
 */
export function ReportSnapshots({
  report,
  subject,
  model,
  chartType,
  dateWindow,
  filters,
  leftOut,
  sourceAsOf,
  canTake,
}: {
  report: SavedReportRow;
  subject: ReportSubjectArea;
  model: LiveReportModel | null;
  chartType: ReportChartType;
  dateWindow: ReportDateWindow;
  filters: ReportFilters;
  leftOut: ReportLeftOut;
  sourceAsOf: number | null;
  /** False while the live figures are loading, hidden or out of date. */
  canTake: boolean;
}) {
  const list = useListSavedReportSnapshot() as SnapshotRow[] | undefined;
  const capture = useCreateSavedReportSnapshot();
  const remove = useSavedReportSnapshotRemove();
  const auth = useAuthStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const snapshots = useMemo(
    () =>
      (list ?? [])
        .filter(
          (row) =>
            row.savedReportDefinitionId === String(report._id) &&
            row.deletedAt == null &&
            row.capturedAt != null,
        )
        .sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0)),
    [list, report._id],
  );
  const open = snapshots.find((row) => row._id === openId) ?? null;
  const openFigures = open ? readReportSnapshotFigures(open.figures) : null;

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };
  const take = () =>
    act(async () => {
      if (!model) return;
      const created = (await capture({
        savedReportDefinitionId: String(report._id),
        title: String(report.name || "Untitled"),
        subjectArea: subject,
        sharingScope: String(report.sharingScope ?? "owner_only"),
        figures: reportSnapshotFigures({
          chartType,
          dateWindow,
          filters,
          leftOut,
          model,
        }),
        ...(sourceAsOf != null ? { sourceAsOf } : {}),
      })) as { docId?: string };
      if (created.docId) setOpenId(String(created.docId));
    });

  return (
    <div className="live-report-snapshots" data-testid="report-snapshots">
      <div className="live-report-detail-heading">
        <div>
          <span>Snapshots</span>
          <h3>Dated copies of these figures</h3>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={!canTake || !model || busy}
          onClick={() => void take()}
        >
          {busy ? "Saving…" : "Take a snapshot"}
        </button>
      </div>
      {failure ? <ReportsFailureBanner error={failure} /> : null}
      {snapshots.length === 0 ? (
        <p className="live-report-notice">
          No snapshots yet. A snapshot keeps today's figures exactly as shown,
          so you can open them again after the records change.
        </p>
      ) : (
        <ul className="live-report-snapshot-list">
          {snapshots.map((row) => (
            <li key={row._id}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-pressed={row._id === openId}
                onClick={() => setOpenId(row._id === openId ? null : row._id)}
              >
                Taken {dateTime(row.capturedAt)}
                {row.capturedByPersonId &&
                row.capturedByPersonId === auth?.personId
                  ? " by you"
                  : ""}
              </button>
              {row.capturedByPersonId === auth?.personId ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await remove({ docId: row._id, version: row.version });
                      if (openId === row._id) setOpenId(null);
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <SnapshotView
          title={open.title}
          capturedAt={open.capturedAt ?? null}
          sourceAsOf={open.sourceAsOf ?? null}
          figures={openFigures}
        />
      ) : null}
    </div>
  );
}

function SnapshotView({
  title,
  capturedAt,
  sourceAsOf,
  figures,
}: {
  title: string;
  capturedAt: number | null;
  sourceAsOf: number | null;
  figures: ReturnType<typeof readReportSnapshotFigures>;
}) {
  return (
    <section
      className="live-report-snapshot"
      aria-label={`Snapshot taken ${dateTime(capturedAt)}`}
      data-testid="report-snapshot-view"
    >
      <p className="live-report-notice" role="status">
        Snapshot taken {dateTime(capturedAt)}
        {sourceAsOf != null
          ? `, with records as of ${dateTime(sourceAsOf)}`
          : ""}
        . These figures do not change; the live report above shows today's.
        {figures?.rowsNotKept
          ? ` The ${figures.rowsNotKept} rows behind them were too many to keep; the figures are kept.`
          : ""}
      </p>
      {figures ? (
        <ReportResult
          reportName={`${title} snapshot ${formatDate(capturedAt)}`}
          chartType={figures.chartType}
          model={figures.model}
          leftOut={figures.leftOut}
        />
      ) : (
        <p className="live-report-notice">
          This snapshot can't be shown: its saved figures are not in a form this
          screen reads.
        </p>
      )}
    </section>
  );
}
