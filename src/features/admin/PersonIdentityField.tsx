import { useState, type FormEvent } from "react";
import { usePersonCorrectIdentity } from "../../lib/manifest-convex-react";

/**
 * A team member's name and phone on the Team roles table: the name reads as
 * plain text, an Edit name action opens a small form. Runs the governed
 * Person.correctIdentity command, which only accepts an active person.
 *
 * The command replaces all three fields at once, so the form always sends the
 * saved phone back — leaving it out would clear the number.
 */
export function PersonIdentityField({
  personId,
  version,
  givenName,
  familyName,
  phone,
  status,
  canEdit,
  busy,
  onBusy,
  onSaved,
  onError,
}: Readonly<{
  personId: string;
  version?: number;
  givenName: string;
  familyName: string;
  phone?: string | null;
  status: string;
  canEdit: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const correctIdentity = usePersonCorrectIdentity();
  const [editing, setEditing] = useState(false);
  const fullName = `${givenName} ${familyName}`.trim();
  const savedPhone = (phone ?? "").trim();

  if (!canEdit) {
    return <strong className="block text-ink">{fullName}</strong>;
  }

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <strong className="text-ink">{fullName}</strong>
        {savedPhone ? (
          <span className="text-xs text-ink-3">· {savedPhone}</span>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || status !== "active"}
          title={
            status === "active"
              ? undefined
              : "Only an active team member's name can be corrected."
          }
          onClick={() => setEditing(true)}
        >
          Edit name
        </button>
      </span>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextGiven = String(data.get("givenName") ?? "").trim();
    const nextFamily = String(data.get("familyName") ?? "").trim();
    const nextPhone = String(data.get("phone") ?? "").trim();
    onBusy(true);
    void correctIdentity({
      docId: personId as never,
      version,
      givenName: nextGiven,
      familyName: nextFamily,
      phone: nextPhone || undefined,
    })
      .then(() => {
        setEditing(false);
        onSaved(`Saved ${nextGiven} ${nextFamily}'s name and phone.`);
      })
      .catch((error: unknown) => {
        onError(
          error instanceof Error ? error.message : "Could not save the name.",
        );
      })
      .finally(() => onBusy(false));
  };

  return (
    <form
      className="grid gap-1"
      onSubmit={submit}
      aria-label={`Name and phone for ${fullName}`}
    >
      <label className="field-label text-xs">
        First name
        <input
          name="givenName"
          className="input"
          defaultValue={givenName}
          disabled={busy}
          autoComplete="off"
          required
        />
      </label>
      <label className="field-label text-xs">
        Last name
        <input
          name="familyName"
          className="input"
          defaultValue={familyName}
          disabled={busy}
          autoComplete="off"
          required
        />
      </label>
      <label className="field-label text-xs">
        Phone
        <input
          name="phone"
          type="tel"
          className="input"
          defaultValue={savedPhone}
          disabled={busy}
          autoComplete="off"
        />
      </label>
      <div className="flex gap-1">
        <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
          {busy ? "…" : "Save name"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
