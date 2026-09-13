import { useState } from "react";
import { useRevokeCandidateHire } from "../../lib/hiringPipeline";

const REOPEN_STAGES = [
  "application",
  "screening",
  "interview",
  "decision",
] as const;
const STAGE_LABEL: Record<(typeof REOPEN_STAGES)[number], string> = {
  application: "Application",
  screening: "Screening",
  interview: "Interview",
  decision: "Decision",
};

/**
 * Undo a hire that has a linked team profile (#269). One press: the profile
 * is deactivated (or terminated, admin-only), then the candidate returns to
 * the chosen stage with the link cleared.
 */
export function CandidateRevokeHireControl({
  candidateId,
  candidateName,
  version,
  canTerminate,
  busy,
  onDone,
  onError,
}: Readonly<{
  candidateId: string;
  candidateName: string;
  version: number | undefined;
  /** Admins may terminate the profile instead of deactivating it. */
  canTerminate: boolean;
  busy: boolean;
  onDone: (message: string) => void;
  onError: (error: unknown) => void;
}>) {
  const revokeHire = useRevokeCandidateHire();
  const [toStage, setToStage] =
    useState<(typeof REOPEN_STAGES)[number]>("decision");
  const [profileAction, setProfileAction] = useState<
    "deactivate" | "terminate"
  >("deactivate");
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setWorking(true);
    try {
      const result = await revokeHire({
        candidateId: candidateId as never,
        toStage,
        profileAction,
        ...(version !== undefined ? { expectedVersion: version } : {}),
      });
      const profileNote =
        result.profile === "terminated"
          ? "Their team profile is terminated and their sign-in no longer works."
          : result.profile === "deactivated"
            ? "Their team profile is inactive; Restore it under Team roles if this was a mistake."
            : result.profile === "already_inactive"
              ? "Their team profile was already inactive."
              : "No team profile was linked.";
      onDone(
        `${candidateName} is back in ${STAGE_LABEL[toStage]}. ${profileNote}`,
      );
    } catch (error) {
      onError(error);
    } finally {
      setWorking(false);
    }
  };

  const disabled = busy || working;
  return (
    <div className="supply-form-grid" data-testid="candidate-revoke-hire">
      <label className="field-label">
        Revoke hire — back to
        <select
          className="input"
          value={toStage}
          disabled={disabled}
          onChange={(event) =>
            setToStage(event.target.value as (typeof REOPEN_STAGES)[number])
          }
        >
          {REOPEN_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Their team profile
        <select
          className="input"
          value={profileAction}
          disabled={disabled}
          onChange={(event) =>
            setProfileAction(event.target.value as "deactivate" | "terminate")
          }
        >
          <option value="deactivate">Deactivate (can be restored)</option>
          {canTerminate ? (
            <option value="terminate">Terminate (permanent)</option>
          ) : null}
        </select>
      </label>
      <label className="field-label">
        <span>&nbsp;</span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => void submit()}
        >
          {working ? "Revoking…" : "Revoke hire"}
        </button>
        <span className="field-hint">
          Undoes the hire and handles their profile in one step, so nobody is
          left with access after being moved back.
        </span>
      </label>
    </div>
  );
}
