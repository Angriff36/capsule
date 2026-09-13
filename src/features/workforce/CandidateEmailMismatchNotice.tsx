import { useState } from "react";
import { Link } from "react-router-dom";
import { useCorrectStaffEmail } from "../../lib/hiringPipeline";

export type CandidateEmailMismatch = {
  candidateName: string;
  personId: string;
  personEmail: string;
  candidateEmail: string;
};

/**
 * A hired candidate's row email no longer matches the linked team profile
 * (KM re-import). Lets the manager move the profile — and its sign-in — to
 * the candidate's address right here, then resend, instead of a dead-end
 * "fix it under Team roles" message (#270).
 */
export function CandidateEmailMismatchNotice({
  mismatch,
  onResolved,
  onError,
}: Readonly<{
  mismatch: CandidateEmailMismatch;
  /** Called after the profile moved; the caller re-runs the resend. */
  onResolved: (warning: string | null) => void;
  onError: (error: unknown) => void;
}>) {
  const correctEmail = useCorrectStaffEmail();
  const [busy, setBusy] = useState(false);

  const useCandidateEmail = async () => {
    setBusy(true);
    try {
      const result = await correctEmail({
        personId: mismatch.personId as never,
        email: mismatch.candidateEmail,
      });
      onResolved(result.warning);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <output
      className="banner banner-warn block mt-4"
      data-testid="candidate-email-mismatch"
    >
      <p>
        {mismatch.candidateName}&apos;s candidate row says{" "}
        <strong>{mismatch.candidateEmail}</strong>, but their team profile and
        sign-in use <strong>{mismatch.personEmail}</strong>. Nothing was sent.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void useCandidateEmail()}
        >
          {busy
            ? "Updating…"
            : `Use ${mismatch.candidateEmail} on their profile and resend`}
        </button>
        <Link to="/admin" className="underline text-sm">
          Or fix the profile email under Team roles
        </Link>
      </div>
    </output>
  );
}
