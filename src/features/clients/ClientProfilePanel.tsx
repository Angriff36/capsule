import { useState, type FormEvent } from "react";
import {
  useClientAssignOwner,
  useClientChangeBillingProfile,
  useListPerson,
} from "../../lib/manifest-convex-react";

export interface ClientProfileRow {
  _id: string;
  version: number;
  status: string;
  assignedToId?: string | null;
  paymentTermsDays?: number | null;
  taxExempt?: boolean | null;
  taxId?: string | null;
}

interface ClientProfilePanelProps {
  client: ClientProfileRow;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
  onSaved: (message: string) => void;
}

function optional(value: FormDataEntryValue | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

/**
 * Account owner and billing profile for one client account. Both commands
 * guard an active client, so an archived account shows the saved values and
 * a disabled save. Billing is manager work; when the server refuses the page
 * failure banner says so.
 */
export function ClientProfilePanel({
  client,
  busy,
  run,
  onSaved,
}: ClientProfilePanelProps) {
  const people = useListPerson();
  const assignOwner = useClientAssignOwner();
  const changeBillingProfile = useClientChangeBillingProfile();
  const [ownerId, setOwnerId] = useState(client.assignedToId ?? "");

  const isActive = client.status === "active";
  const lockedTitle = isActive
    ? undefined
    : "Reactivate this client to change its profile.";

  const assignable = (people ?? [])
    .filter((person) => person.deletedAt == null && person.status === "active")
    .sort((a, b) =>
      `${a.givenName} ${a.familyName}`.localeCompare(
        `${b.givenName} ${b.familyName}`,
      ),
    );

  const submitOwner = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run("assign-owner", async () => {
      await assignOwner({
        docId: client._id,
        version: client.version,
        assignedToId: ownerId || undefined,
      });
      onSaved(ownerId ? "Account owner saved." : "Account owner cleared.");
    });
  };

  const submitBilling = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run("billing-profile", async () => {
      const paymentTermsDays = Number(
        String(data.get("paymentTermsDays") ?? "").trim(),
      );
      if (!Number.isFinite(paymentTermsDays)) {
        throw new Error("Payment terms must be a number of days.");
      }
      await changeBillingProfile({
        docId: client._id,
        version: client.version,
        paymentTermsDays,
        taxExempt: data.get("taxExempt") === "on",
        taxId: optional(data.get("taxId")),
      });
      onSaved("Billing profile saved.");
    });
  };

  return (
    <>
      <form className="supply-form" onSubmit={submitOwner}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>Account owner</h2>
          </div>
        </div>
        <label>
          Owner
          <select
            name="assignedToId"
            value={ownerId}
            disabled={!isActive}
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {assignable.map((person) => (
              <option key={person._id} value={person._id}>
                {[person.givenName, person.familyName]
                  .filter(Boolean)
                  .join(" ")}
              </option>
            ))}
          </select>
          <span className="field-hint">
            The person who looks after this account. Pick Unassigned to clear
            it.
          </span>
        </label>
        <button
          className="btn btn-ghost"
          type="submit"
          disabled={busy != null || !isActive}
          title={lockedTitle}
        >
          Save owner
        </button>
      </form>

      <form className="supply-form" onSubmit={submitBilling}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h2>Billing profile</h2>
          </div>
        </div>
        <label>
          Payment terms
          <input
            name="paymentTermsDays"
            type="number"
            min="0"
            max="365"
            step="1"
            defaultValue={Number(client.paymentTermsDays ?? 30)}
            required
          />
          <span className="field-hint">Days to pay, 0 to 365.</span>
        </label>
        <label className="supply-check">
          <input
            name="taxExempt"
            type="checkbox"
            defaultChecked={client.taxExempt === true}
          />{" "}
          Tax exempt
        </label>
        <label>
          Tax ID
          <input name="taxId" defaultValue={client.taxId ?? ""} />
          <span className="field-hint">
            The saved tax ID stays hidden for privacy, so this box starts empty.
            What you type here replaces it, and an empty box clears it.
          </span>
        </label>
        <button
          className="btn btn-ghost"
          type="submit"
          disabled={busy != null || !isActive}
          title={lockedTitle}
        >
          Save billing profile
        </button>
      </form>
    </>
  );
}
