import { useState, type FormEvent } from "react";
import { usePersonChangeAddress } from "../../lib/manifest-convex-react";

/**
 * A team member's postal address on the Team roles table: one line when
 * set, a small form when editing. Feeds the Staff Address & Phone List
 * report (#272). Runs the governed Person.changeAddress command.
 */

export interface PersonPostalAddress {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}

export function postalAddressLine(address: PersonPostalAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, address.region, address.postalCode]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

function optional(value: FormDataEntryValue | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

export function PersonAddressField({
  personId,
  personName,
  address,
  canEdit,
  busy,
  onBusy,
  onSaved,
  onError,
}: Readonly<{
  personId: string;
  personName: string;
  address: PersonPostalAddress;
  canEdit: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const changeAddress = usePersonChangeAddress();
  const [editing, setEditing] = useState(false);
  const line = postalAddressLine(address);

  if (!canEdit) {
    return line ? <span className="text-ink-3">{line}</span> : null;
  }
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {line ? <span className="text-ink-3">{line}</span> : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          {line ? "Edit address" : "Add postal address"}
        </button>
      </span>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onBusy(true);
    void changeAddress({
      docId: personId as never,
      addressLine1: optional(data.get("addressLine1")),
      addressLine2: optional(data.get("addressLine2")),
      city: optional(data.get("city")),
      region: optional(data.get("region")),
      postalCode: optional(data.get("postalCode")),
    })
      .then(() => {
        setEditing(false);
        onSaved(`Saved ${personName}'s postal address.`);
      })
      .catch((error: unknown) => {
        onError(
          error instanceof Error ? error.message : "Could not save address.",
        );
      })
      .finally(() => onBusy(false));
  };

  return (
    <form
      className="mt-1 grid gap-1"
      onSubmit={submit}
      aria-label={`Postal address for ${personName}`}
    >
      <input
        name="addressLine1"
        className="input"
        placeholder="Street"
        defaultValue={address.addressLine1 ?? ""}
        disabled={busy}
        autoComplete="off"
      />
      <input
        name="addressLine2"
        className="input"
        placeholder="Apt, unit (optional)"
        defaultValue={address.addressLine2 ?? ""}
        disabled={busy}
        autoComplete="off"
      />
      <div className="flex gap-1">
        <input
          name="city"
          className="input"
          placeholder="City"
          defaultValue={address.city ?? ""}
          disabled={busy}
          autoComplete="off"
        />
        <input
          name="region"
          className="input w-16"
          placeholder="ST"
          defaultValue={address.region ?? ""}
          disabled={busy}
          autoComplete="off"
        />
        <input
          name="postalCode"
          className="input w-24"
          placeholder="ZIP"
          defaultValue={address.postalCode ?? ""}
          disabled={busy}
          autoComplete="off"
        />
      </div>
      <div className="flex gap-1">
        <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
          {busy ? "…" : "Save address"}
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
