import { useState, type FormEvent } from "react";

export const VENUE_TYPES = [
  ["client_site", "Client site"],
  ["banquet_hall", "Banquet hall"],
  ["outdoor", "Outdoor"],
  ["office", "Office"],
  ["private_home", "Private home"],
  ["other", "Other"],
] as const;

export type VenueTypeCode = (typeof VENUE_TYPES)[number][0];

export type InlineDuplicateMatch = {
  id: string;
  label: string;
  hint?: string | null;
};

export type PendingInlineDuplicate = {
  kind: "client" | "venue";
  typedName: string;
  matches: InlineDuplicateMatch[];
};

/**
 * Shown when the inline form is about to create a record that already looks
 * present. One tap picks the existing row; "Create anyway" keeps going. It
 * never blocks — it just makes the duplicate visible before it exists.
 */
export function InlineDuplicateNotice({
  pending,
  busy,
  onUseExisting,
  onCreateAnyway,
  onDismiss,
}: {
  pending: PendingInlineDuplicate;
  busy: boolean;
  onUseExisting: (id: string) => void;
  onCreateAnyway: () => void;
  onDismiss: () => void;
}) {
  const noun = pending.kind === "client" ? "client" : "venue";
  return (
    <div
      className="attention-band mx-3 mb-3 px-3 py-2"
      role="status"
      data-testid={`inline-${noun}-duplicate`}
    >
      <p className="text-sm font-semibold text-ink">
        A {noun} like “{pending.typedName}” already exists.
      </p>
      <ul className="mt-1.5 space-y-1">
        {pending.matches.slice(0, 5).map((match) => (
          <li
            key={match.id}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span className="min-w-0 text-sm text-ink-2">
              <span className="font-medium text-ink">{match.label}</span>
              {match.hint ? (
                <span className="text-ink-3"> · {match.hint}</span>
              ) : null}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => onUseExisting(match.id)}
            >
              Use this {noun}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onCreateAnyway}
        >
          Create anyway
        </button>
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={onDismiss}
        >
          Keep editing
        </button>
      </div>
    </div>
  );
}

export function InlineClientForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [type, setType] = useState<"company" | "person">("company");
  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-3">
      <label className="field-label">
        Type
        <select
          name="clientType"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "company" | "person")
          }
          className="input"
        >
          <option value="company">Company</option>
          <option value="person">Person</option>
        </select>
      </label>
      {type === "company" ? (
        <label className="field-label">
          Company name
          <input name="companyName" className="input" required />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">
            Given name
            <input name="givenName" className="input" required />
          </label>
          <label className="field-label">
            Family name
            <input name="familyName" className="input" />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="field-label">
          Email
          <input name="email" type="email" className="input" />
        </label>
        <label className="field-label">
          Phone
          <input name="phone" type="tel" className="input" />
        </label>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "Creating…" : "Create and select client"}
      </button>
    </form>
  );
}

export function InlineVenueForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-3">
      <label className="field-label">
        Venue name
        <input name="name" className="input" required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="field-label">
          Type
          <select name="venueType" className="input">
            {VENUE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Capacity
          <input
            name="capacity"
            type="number"
            min={0}
            defaultValue={0}
            className="input"
            required
          />
        </label>
      </div>
      <label className="field-label">
        Address
        <input
          name="addressLine1"
          className="input"
          placeholder="Street address, or GPS coordinates for a site with none"
        />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="field-label">
          City
          <input name="city" className="input" />
        </label>
        <label className="field-label">
          Region
          <input name="region" className="input" />
        </label>
        <label className="field-label">
          Postal
          <input name="postalCode" className="input" />
        </label>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "Creating…" : "Create and select venue"}
      </button>
    </form>
  );
}
