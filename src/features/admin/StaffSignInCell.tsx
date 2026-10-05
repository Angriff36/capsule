import type { TeamPerson } from "./TeamPerson";

/** The saved state of the newest sign-in email for this person. */
export type SignInEmailState = {
  state: string;
  problem: string | null;
};

function emailStateNote(email: SignInEmailState | undefined): string | null {
  if (!email) return null;
  if (email.state === "terminal_failed" || email.state === "retryable_failed") {
    return `Sign-in email not sent. ${email.problem ?? ""}`.trim();
  }
  if (email.state === "uncertain") {
    return "Not sure the sign-in email went out. Email it again to be sure.";
  }
  if (email.state === "processing") return "Sending the sign-in email…";
  return null;
}

export function StaffSignInCell({
  person,
  canEdit,
  busy,
  emailState,
  onSendSignIn,
  onUnlink,
  onPause,
  onRestore,
}: Readonly<{
  person: TeamPerson;
  canEdit: boolean;
  busy: boolean;
  emailState?: SignInEmailState;
  onSendSignIn: (person: TeamPerson) => Promise<void>;
  onUnlink: (person: TeamPerson) => Promise<void>;
  /** Absent on your own row. */
  onPause?: (person: TeamPerson) => Promise<void>;
  onRestore: (person: TeamPerson) => Promise<void>;
}>) {
  const linked = Boolean(person.authSubjectId);
  const paused = person.status === "inactive";
  const emailNote = paused ? null : emailStateNote(emailState);
  return (
    <div className="grid gap-1">
      <span className={linked && !paused ? "text-ink-2" : "text-warn"}>
        {paused
          ? "Paused - cannot open the app"
          : linked
            ? "Can open the app"
            : "No sign-in yet"}
      </span>
      {emailNote ? <span className="text-warn">{emailNote}</span> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {paused ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void onRestore(person)}
            >
              {busy ? "Working…" : "Restore access"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void onSendSignIn(person)}
              >
                {busy
                  ? "Sending…"
                  : linked
                    ? "Email sign-in again"
                    : "Email sign-in"}
              </button>
              {onPause ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void onPause(person)}
                >
                  {busy ? "Working…" : "Pause access"}
                </button>
              ) : null}
            </>
          )}
          {linked ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void onUnlink(person)}
            >
              {busy ? "Working…" : "Unlink"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
