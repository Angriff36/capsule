import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import {
  useListSyncError,
  useSyncErrorMarkResolved,
} from "../../lib/manifest-convex-react";
import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { formatTime } from "../../lib/format";
import type { Doc } from "../../lib/api";

type SyncError = Doc<"syncErrors">;
type Failure = ReturnType<typeof classifyCommandFailure>;

const KIND_LABEL: Record<string, string> = {
  parse_failed: "Parse failed",
  missing_field: "Missing field",
  unknown: "Unknown",
};

// Retry replays the verbatim stored payload, so it can only help when the
// failure was transient (parse_failed/unknown). A missing_field failure replays
// the same bad input and deterministically fails again — hide Retry for those
// rather than offer a button that can never succeed (anti-tedium).
const RETRYABLE_KINDS = new Set(["parse_failed", "unknown"]);

/**
 * Retryable sync-error queue (spec §4.4 "Failed parsing appears in a retryable
 * sync-error queue" + the integrations "error visibility" done-when). Surfaces
 * pending ingest/sync failures recorded by `ingestInboundMessage`. Staff retry
 * (re-runs the ingest from the stored payload; marks resolved on success) or
 * dismiss. Rendered inside the message inbox — hidden when there are no pending
 * errors so it adds no noise to the normal inbox view.
 *
 * Retry is client-side on purpose: the stored `rawPayload` is the verbatim
 * ingest input, so re-running `ingestInboundMessage` with it is the retry. If
 * that action's arg shape changes, the retry parse must change with it.
 */
export function SyncErrorsPanel() {
  const errors = useListSyncError();
  const markResolved = useSyncErrorMarkResolved();
  const ingest = useAction(api.messageInbox.ingestInboundMessage);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = (errors ?? []).filter(
    (e) => e.status === "pending" && e.deletedAt == null,
  );

  if (pending.length === 0) return null;

  const dismiss = async (e: SyncError) => {
    setFailure(null);
    setBusyId(e._id);
    try {
      await markResolved({ docId: e._id, version: e.version });
    } catch (err) {
      setFailure(classifyCommandFailure(err));
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (e: SyncError) => {
    setFailure(null);
    setBusyId(e._id);
    try {
      if (!e.rawPayload) {
        throw new Error("No stored payload to retry");
      }
      // rawPayload is JSON.stringify of the original ingestInboundMessage args.
      const payload = JSON.parse(e.rawPayload);
      await ingest(payload);
      // Re-ran successfully — clear the error from the queue.
      await markResolved({ docId: e._id, version: e.version });
    } catch (err) {
      // ingest re-records the failure (idempotently) before throwing, so the
      // error stays pending; surface the reason to the operator.
      setFailure(classifyCommandFailure(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="mt-4 rounded-sm border border-amber-300 bg-amber-50 p-4"
      data-testid="sync-errors-panel"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold text-amber-900">
          Sync errors{" "}
          <span className="font-normal text-amber-700">({pending.length})</span>
        </h2>
        <p className="text-[11px] text-amber-700">
          Inbound deliveries that failed to parse — retry or dismiss.
        </p>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}
      <ul className="mt-3 space-y-2">
        {pending.map((e) => {
          const isBusy = busyId === e._id;
          return (
            <li
              key={e._id}
              className="rounded-sm border border-amber-200 bg-panel px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  {e.sourceSystem}
                </span>
                <span className="text-[10px] text-ink-3">{e.recordType}</span>
                <span className="text-[10px] text-ink-3">
                  · {KIND_LABEL[e.kind] ?? e.kind}
                </span>
                {e.externalId ? (
                  <span className="text-[10px] text-ink-3">
                    · {e.externalId}
                  </span>
                ) : null}
                {e.recordedAt ? (
                  <span className="ml-auto text-[10px] text-ink-3">
                    {formatTime(e.recordedAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12px] text-ink">{e.errorMessage}</p>
              {e.rawPayload ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10.5px] text-ink-3">
                    Raw payload
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-sm bg-inset p-2 text-[10.5px] text-ink-2">
                    {e.rawPayload}
                  </pre>
                </details>
              ) : null}
              <div className="mt-2 flex gap-2">
                {RETRYABLE_KINDS.has(e.kind) && e.rawPayload ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void retry(e)}
                    disabled={isBusy}
                  >
                    {isBusy ? "Working…" : "Retry"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  onClick={() => void dismiss(e)}
                  disabled={isBusy}
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
