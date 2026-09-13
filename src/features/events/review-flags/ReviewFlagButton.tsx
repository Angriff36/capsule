import type { ActionPromptSession } from "../../../ui/action-prompt";
import {
  type EventReviewFlags,
  type ReviewFlagTargetKind,
} from "./useEventReviewFlags";

/**
 * "Flag for review" on one row — a menu line, a timeline block, a reservation.
 * Shows the count of open questions on that row; clicking raises a new one
 * (#368 items 13/15 — the Ops Final Lock step "walk quantities, raise the flag"
 * finally has a place to put the flag).
 */
export function ReviewFlagButton({
  flags,
  prompt,
  targetKind,
  targetId,
  targetLabel,
  suggestedQuestion,
  busy,
  onError,
  compact,
}: {
  flags: EventReviewFlags;
  prompt: ActionPromptSession;
  targetKind: ReviewFlagTargetKind;
  targetId?: string;
  targetLabel: string;
  /** Pre-fills the question (e.g. a detected quantity anomaly). */
  suggestedQuestion?: string;
  busy?: boolean;
  onError?: (error: unknown) => void;
  compact?: boolean;
}) {
  const open = flags
    .flagsFor(targetKind, targetId)
    .filter((flag) => flag.status === "open");

  const raise = () => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Flag for review — ${targetLabel}`,
        description:
          "Raise a question about this row for someone to decide. It shows on the row and in the event's Review flags list until it is settled — nothing else changes.",
        fields: [
          {
            name: "question",
            label: "What needs a decision?",
            multiline: true,
            required: true,
            defaultValue: suggestedQuestion ?? "",
            placeholder:
              "e.g. BEO says 30, Worksheet says 72, Pack List says 144 — which quantity is right?",
          },
        ],
        confirmLabel: "Raise flag",
      });
      const question = values?.question?.trim();
      if (!question) return;
      try {
        await flags.raise({ targetKind, targetId, targetLabel, question });
      } catch (error) {
        onError?.(error);
      }
    })();
  };

  const label =
    open.length > 0
      ? `${open.length} open flag${open.length === 1 ? "" : "s"}`
      : "Flag for review";
  return (
    <button
      type="button"
      className={`${compact ? "btn btn-ghost btn-sm" : "btn btn-ghost"} ${
        open.length > 0 ? "text-warn" : "text-ink-3"
      }`}
      disabled={busy}
      onClick={raise}
      title={
        open.length > 0
          ? open.map((flag) => `• ${flag.question}`).join("\n")
          : "Raise a question about this row for review"
      }
      data-testid="review-flag-button"
      data-open-flags={open.length}
    >
      <span aria-hidden="true">⚑</span> {label}
    </button>
  );
}
