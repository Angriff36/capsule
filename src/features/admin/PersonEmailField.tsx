import { useState } from "react";
import { useCorrectStaffEmail } from "../../lib/hiringPipeline";

/**
 * Inline email correction on a Team roles row (#270). Saves through the
 * authored personEmail seam, which runs Person.correctEmail and moves the
 * linked sign-in account to the same address.
 */
export function PersonEmailField({
  personId,
  personName,
  currentEmail,
  canEdit,
  busy,
  onBusy,
  onSaved,
  onError,
}: Readonly<{
  personId: string;
  personName: string;
  currentEmail: string;
  canEdit: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (message: string, tone: "ok" | "warn") => void;
  onError: (message: string) => void;
}>) {
  const correctEmail = useCorrectStaffEmail();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentEmail);

  if (!canEdit || !editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span>{currentEmail}</span>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              setDraft(currentEmail);
              setEditing(true);
            }}
            aria-label={`Change email for ${personName}`}
          >
            Change
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const next = draft.trim().toLowerCase();
        if (!next || next === currentEmail.toLowerCase()) {
          setEditing(false);
          return;
        }
        onBusy(true);
        void correctEmail({ personId: personId as never, email: next })
          .then((result) => {
            setEditing(false);
            onSaved(
              result.warning ??
                (result.signInUpdated
                  ? `${personName} now uses ${result.email} for their profile and their sign-in.`
                  : `${personName} now uses ${result.email}. Email them a sign-in when you want them in.`),
              result.warning ? "warn" : "ok",
            );
          })
          .catch((error: unknown) => {
            onError(
              error instanceof Error
                ? error.message
                : "Could not change the email.",
            );
          })
          .finally(() => onBusy(false));
      }}
    >
      <input
        name="email"
        type="email"
        className="input w-56"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={`New email for ${personName}`}
        disabled={busy}
        autoFocus
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "…" : "Save"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  );
}
