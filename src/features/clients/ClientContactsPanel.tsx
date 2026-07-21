import type { FormEvent } from "react";
import { ReasonCopy } from "../../ui/action-prompt";

export interface ClientContactRow {
  _id: string;
  version: number;
  givenName?: string | null;
  familyName?: string | null;
  isPrimary?: boolean;
  isBillingContact?: boolean;
}

interface ClientContactsPanelProps {
  showAddForm: boolean;
  busy: string | null;
  contacts: ClientContactRow[];
  onSubmitAdd: (event: FormEvent<HTMLFormElement>) => void;
  onSetPrimary: (row: ClientContactRow) => void;
  onRemove: (row: ClientContactRow) => void;
  askConfirm: (request: {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
}

/** Contact add form + active contacts ledger for a client account. */
export function ClientContactsPanel({
  showAddForm,
  busy,
  contacts,
  onSubmitAdd,
  onSetPrimary,
  onRemove,
  askConfirm,
}: ClientContactsPanelProps) {
  return (
    <>
      {showAddForm ? (
        <form className="supply-form" onSubmit={onSubmitAdd}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Contact</p>
              <h2>Add person</h2>
            </div>
          </div>
          <label>
            Given name
            <input name="givenName" required />
          </label>
          <label>
            Family name
            <input name="familyName" />
          </label>
          <label>
            Title
            <input name="title" />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Phone
            <input name="phone" />
          </label>
          <label className="supply-check">
            <input name="isPrimary" type="checkbox" /> Primary
          </label>
          <label className="supply-check">
            <input name="isBillingContact" type="checkbox" /> Billing contact
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy === "add-contact"}
          >
            Add contact
          </button>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">People</p>
            <h2>Contacts</h2>
          </div>
          <span>{contacts.length}</span>
        </div>
        {contacts.length === 0 ? (
          <div className="document-empty">
            <p>No active contacts.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((row) => (
                <tr key={row._id}>
                  <td>
                    {[row.givenName, row.familyName].filter(Boolean).join(" ")}
                  </td>
                  <td>
                    {row.isPrimary ? "Primary " : ""}
                    {row.isBillingContact ? "Billing" : ""}
                  </td>
                  <td className="supply-row-actions">
                    {!row.isPrimary ? (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy != null}
                        onClick={() => onSetPrimary(row)}
                      >
                        Set primary
                      </button>
                    ) : null}
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={busy != null}
                      onClick={() =>
                        void (async () => {
                          const ok = await askConfirm({
                            title: ReasonCopy.removeContact.title,
                            description: ReasonCopy.removeContact.description,
                            confirmLabel: ReasonCopy.removeContact.confirmLabel,
                            tone: "danger",
                          });
                          if (!ok) return;
                          onRemove(row);
                        })()
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
