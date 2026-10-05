import { StatusChip } from "../../../ui/primitives";
import { TPP_STALL_MS } from "./tppUploadDiagnostics";
import type { ImportTelemetry } from "./useTppUploadTelemetry";
const labels = {
  idle: "Not started",
  indexing: "Checking file",
  ready: "Ready",
  starting: "Starting",
  preparing: "Preparing batch",
  uploading: "Uploading bytes",
  importing: "Importing records",
  finalizing: "Checking completion",
  paused: "Paused — resume needed",
  failed: "Stopped — retry needed",
  complete: "Complete",
  exceptions: "Complete with exceptions",
};
const duration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
const bytes = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`;
export function TppUploadStatus({
  stats,
  now,
  online,
  busy,
  issues,
  preserved,
  onPause,
  onRetry,
  retryAvailable,
}: {
  stats: ImportTelemetry;
  now: number;
  online: boolean;
  busy: boolean;
  issues: number;
  preserved: number;
  onPause: () => void;
  onRetry: () => void;
  retryAvailable: boolean;
}) {
  const stalled = busy && now - stats.lastProgressAt >= TPP_STALL_MS;
  const warning =
    stalled ||
    !online ||
    stats.stage === "paused" ||
    stats.stage === "exceptions";
  const label =
    !online && busy
      ? "Offline — progress interrupted"
      : stalled
        ? "Waiting — no recent progress"
        : labels[stats.stage];
  return (
    <section
      className="space-y-3 border-y border-line py-4"
      aria-label="Live import status"
    >
      <div role="status" aria-live="polite">
        <StatusChip
          status={stats.stage}
          label={label}
          color={
            stats.stage === "failed"
              ? "chip-tone-danger"
              : warning
                ? "chip-tone-warn"
                : stats.stage === "complete"
                  ? "chip-tone-ok"
                  : "chip-tone-info"
          }
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
        <div>
          <dt className="text-ink-3">Elapsed</dt>
          <dd>{duration((busy ? now : stats.updatedAt) - stats.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Last confirmed activity</dt>
          <dd>{duration(now - stats.lastProgressAt)} ago</dd>
        </div>
        <div>
          <dt className="text-ink-3">Connection</dt>
          <dd>{online ? "Browser online" : "Offline"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Saved batches</dt>
          <dd>{stats.savedBatches.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Saved upload data</dt>
          <dd>{bytes(stats.savedBytes)}</dd>
        </div>
        {stats.batch != null && (
          <div>
            <dt className="text-ink-3">Current batch</dt>
            <dd>
              {stats.batch + 1} ·{" "}
              {stats.collection === "__packages_v1"
                ? "Inferred packages"
                : stats.collection === "__provenance"
                  ? "Source history"
                  : stats.collection}
            </dd>
          </div>
        )}
      </dl>
      {stats.stage === "uploading" && (
        <div>
          <p className="text-sm">
            This batch: {bytes(stats.sentBytes)} / {bytes(stats.batchBytes)}
          </p>
          <progress
            className="w-full"
            max={stats.batchBytes || 1}
            value={stats.sentBytes}
            aria-label="Current batch upload bytes"
          />
        </div>
      )}
      {stats.stage === "importing" && (
        <p className="text-sm text-ink-2">
          The batch has uploaded. Waiting for the server to confirm its imported
          records ({duration(now - stats.stageStartedAt)}).
        </p>
      )}
      {stalled && (
        <p role="alert" className="text-warning">
          No confirmed progress for {duration(now - stats.lastProgressAt)}.{" "}
          {stats.workerSeenAt && now - stats.workerSeenAt < 15_000
            ? "The file worker is responding; the server has not confirmed new progress."
            : "The file worker has not reported recent activity."}{" "}
          You can pause and retry safely. A server request may still finish
          after you pause.
        </p>
      )}
      {!online &&
        stats.stage !== "complete" &&
        stats.stage !== "exceptions" && (
          <p role="alert" className="text-warning">
            Your browser reports no connection. Reconnect, then retry from the
            last saved batch.
          </p>
        )}
      {issues > 0 && (
        <p role="alert" className="text-danger">
          {issues.toLocaleString()} records need mapping.{" "}
          {busy
            ? "Other records are still importing."
            : "See the exceptions below."}{" "}
          The report includes their saved error details.
        </p>
      )}
      {preserved > 0 && (
        <p className="text-sm text-warning">
          {preserved.toLocaleString()} records were preserved in the source
          archive rather than converted into native records.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {busy && (
          <button type="button" className="btn-ghost" onClick={onPause}>
            Pause import
          </button>
        )}
        {(stalled ||
          (!busy &&
            (stats.stage === "failed" || stats.stage === "paused"))) && (
          <button
            type="button"
            className="btn-primary"
            disabled={!retryAvailable || !online}
            onClick={onRetry}
          >
            {stats.stage === "paused"
              ? "Resume saved progress"
              : "Retry from saved progress"}
          </button>
        )}
      </div>
    </section>
  );
}
