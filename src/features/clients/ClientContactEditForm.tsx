import type { FormEvent } from "react";
import { useClientContactUpdateDetails } from "../../lib/manifest-convex-react";

export interface ClientContactDetailsRow {
  _id: string;
  version: number;
  givenName?: string | null;
  familyName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  isBillingContact?: boolean;
  notes?: string | null;
}

interface ClientContactEditFormProps {
  contact: ClientContactDetailsRow;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
  onSaved: (message: string) => void;
  onClose: () => void;
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/**
 * Edit one client contact. Every field of ClientContact.updateDetails rides
 * along pre-filled, so a save never drops a stored value and an emptied field
 * really clears.
 */
export function ClientContactEditForm({
  contact,
  busy,
  run,
  onSaved,
  onClose,
}: ClientContactEditFormProps) {
  const updateDetails = useClientContactUpdateDetails();
  const name =
    [contact.givenName, contact.familyName].filter(Boolean).join(" ") ||
    "this contact";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(`${contact._id}:details`, async () => {
      const givenName = text(data.get("givenName"));
      if (!givenName) {
        throw new Error("Contact given name is required.");
      }
      await updateDetails({
        docId: contact._id,
        version: contact.version,
        givenName,
        familyName: text(data.get("familyName")),
        title: text(data.get("title")),
        email: text(data.get("email")),
        phone: text(data.get("phone")),
        mobile: text(data.get("mobile")),
        isBillingContact: data.get("isBillingContact") === "on",
        notes: text(data.get("notes")),
      });
      onSaved("Contact details updated.");
      onClose();
    });
  };

  return (
    <form className="supply-form" onSubmit={submit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Contact</p>
          <h2>Edit {name}</h2>
        </div>
      </div>
      <label>
        Given name
        <input
          name="givenName"
          defaultValue={contact.givenName ?? ""}
          required
        />
      </label>
      <label>
        Family name
        <input name="familyName" defaultValue={contact.familyName ?? ""} />
      </label>
      <label>
        Title
        <input name="title" defaultValue={contact.title ?? ""} />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={contact.email ?? ""} />
      </label>
      <label>
        Phone
        <input name="phone" defaultValue={contact.phone ?? ""} />
      </label>
      <label>
        Mobile
        <input name="mobile" defaultValue={contact.mobile ?? ""} />
      </label>
      <label className="supply-check">
        <input
          name="isBillingContact"
          type="checkbox"
          defaultChecked={contact.isBillingContact === true}
        />{" "}
        Billing contact
      </label>
      <label>
        Notes
        <textarea name="notes" rows={3} defaultValue={contact.notes ?? ""} />
      </label>
      <div className="supply-row-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy != null}
        >
          Save contact
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy != null}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
