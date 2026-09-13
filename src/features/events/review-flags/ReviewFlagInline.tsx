import { useState } from "react";
import { useActionPrompt } from "../../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { ReviewFlagButton } from "./ReviewFlagButton";
import {
  useEventReviewFlags,
  type ReviewFlagTargetKind,
} from "./useEventReviewFlags";

/**
 * Drop-in "Flag for review" for a row whose tab has no prompt session of its
 * own (timeline blocks, equipment reservations). Owns its prompt host and the
 * flag subscription; Convex dedupes the shared query across rows.
 */
export function ReviewFlagInline({
  eventId,
  targetKind,
  targetId,
  targetLabel,
  suggestedQuestion,
  disabled,
}: {
  eventId: string;
  targetKind: ReviewFlagTargetKind;
  targetId: string;
  targetLabel: string;
  suggestedQuestion?: string;
  disabled?: boolean;
}) {
  const flags = useEventReviewFlags(eventId);
  const { prompt, host } = useActionPrompt();
  const [error, setError] = useState<CommandFailure | null>(null);
  return (
    <>
      {host}
      <ReviewFlagButton
        flags={flags}
        prompt={prompt}
        targetKind={targetKind}
        targetId={targetId}
        targetLabel={targetLabel}
        suggestedQuestion={suggestedQuestion}
        busy={disabled || flags.loading}
        onError={(cause) => setError(classifyCommandFailure(cause))}
        compact
      />
      {error ? (
        <FailureBanner failure={error} onDismiss={() => setError(null)} />
      ) : null}
    </>
  );
}
