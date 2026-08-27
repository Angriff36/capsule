import type { TeamPerson } from "./TeamPerson";

export function StaffSignInCell({
  person,
  canEdit,
  busy,
  onSendSignIn,
  onUnlink,
}: Readonly<{
  person: TeamPerson;
  canEdit: boolean;
  busy: boolean;
  onSendSignIn: (person: TeamPerson) => Promise<void>;
  onUnlink: (person: TeamPerson) => Promise<void>;
}>) {
  const ready = Boolean(person.authSubjectId);
  return (
    <div className="grid gap-1">
      <span className={ready ? "text-ink-2" : "text-warn"}>
        {ready ? "Can open the app" : "No sign-in yet"}
      </span>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void onSendSignIn(person)}
          >
            {busy
              ? "Sending…"
              : ready
                ? "Email sign-in again"
                : "Email sign-in"}
          </button>
          {ready ? (
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
