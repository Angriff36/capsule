import { useState } from "react";
import type { ActionPromptSession } from "../../../ui/action-prompt";
import { formatDate } from "../../../lib/format";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { ReviewFlagButton } from "./ReviewFlagButton";
import {
  REVIEW_FLAG_TARGET_LABEL,
  type EventReviewFlags,
  type ReviewFlagRow,
} from "./useEventReviewFlags";

/**
 * Every question raised on this event — open first — with Resolve / Dismiss /
 * Reopen. Also the place to raise an event-level flag ("headcount on the BEO
 * disagrees with the contract"). Lives on the Overview tab so the Ops Final
 * Lock walk-through ends with an empty list, not a scroll through Team Chat.
 */
export function EventReviewFlagsPanel({
  flags,
  prompt,
  canSettle,
}: {
  flags: EventReviewFlags;
  prompt: ActionPromptSession;
  canSettle: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CommandFailure | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(classifyCommandFailure(failure));
    } finally {
      setBusy(null);
    }
  };

  const resolve = (flag: ReviewFlagRow) => {
    void (async () => {
      const resolution = await prompt.askReason({
        title: "Settle the flag",
        description: flag.question,
        label: "Decision",
        placeholder: "e.g. Going with the Worksheet's 72; BEO was pre-tasting.",
        confirmLabel: "Mark resolved",
      });
      if (!resolution) return;
      await run(flag._id, () => flags.markResolved(flag, resolution));
    })();
  };

  const dismiss = (flag: ReviewFlagRow) => {
    void (async () => {
      const reason = await prompt.askReason({
        title: "Dismiss the flag",
        description: `${flag.question}\n\nDismiss when it turned out not to be a problem. A reason is optional.`,
        label: "Why (optional)",
        confirmLabel: "Dismiss",
      });
      if (reason === null) return;
      await run(flag._id, () => flags.dismiss(flag, reason || undefined));
    })();
  };

  const settled = flags.flags.filter((flag) => flag.status !== "open");

  return (
    <section className="card p-4" data-testid="event-review-flags">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Review flags</p>
          <p className="mt-1 text-sm text-ink-2">
            {flags.openFlags.length === 0
              ? "No open questions on this event."
              : `${flags.openFlags.length} open question${flags.openFlags.length === 1 ? "" : "s"} waiting on a decision.`}
          </p>
        </div>
        <ReviewFlagButton
          flags={flags}
          prompt={prompt}
          targetKind="whole_event"
          targetLabel="Whole event"
          busy={busy != null}
          onError={(cause) => setError(classifyCommandFailure(cause))}
          compact
        />
      </div>
      {error ? (
        <FailureBanner failure={error} onDismiss={() => setError(null)} />
      ) : null}

      {flags.openFlags.length > 0 ? (
        <ul className="mt-3 space-y-2" data-testid="event-review-flags-open">
          {flags.openFlags.map((flag) => (
            <li
              key={flag._id}
              className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2"
            >
              <FlagHeading flag={flag} />
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                {flag.question}
              </p>
              {canSettle ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy != null}
                    onClick={() => resolve(flag)}
                    data-testid="review-flag-resolve"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => dismiss(flag)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {settled.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className="btn-link text-sm"
            onClick={() => setShowSettled((current) => !current)}
          >
            {showSettled ? "Hide" : "Show"} {settled.length} settled
          </button>
          {showSettled ? (
            <ul className="mt-2 space-y-2">
              {settled.map((flag) => (
                <li
                  key={flag._id}
                  className="rounded-md border border-line px-3 py-2 text-sm"
                >
                  <FlagHeading flag={flag} />
                  <p className="mt-1 text-ink-2 line-through decoration-ink-3/60">
                    {flag.question}
                  </p>
                  {flag.resolution ? (
                    <p className="mt-1 text-ink">
                      <span className="font-medium">
                        {flag.status === "resolved" ? "Decision" : "Dismissed"}:
                      </span>{" "}
                      {flag.resolution}
                    </p>
                  ) : null}
                  {canSettle ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm mt-1"
                      disabled={busy != null}
                      onClick={() =>
                        void run(flag._id, () => flags.reopen(flag))
                      }
                    >
                      Reopen
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FlagHeading({ flag }: { flag: ReviewFlagRow }) {
  return (
    <p className="text-xs text-ink-3">
      <span className="font-semibold text-ink-2">
        {REVIEW_FLAG_TARGET_LABEL[flag.targetKind] ?? flag.targetKind}
      </span>
      {flag.targetLabel && flag.targetKind !== "whole_event"
        ? ` · ${flag.targetLabel}`
        : ""}
      {flag.raisedAt ? ` · raised ${formatDate(flag.raisedAt)}` : ""}
      {flag.settledAt ? ` · settled ${formatDate(flag.settledAt)}` : ""}
    </p>
  );
}
