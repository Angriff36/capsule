import { useState, type FormEvent } from "react";
import { useLeadReviseDetails } from "../../lib/manifest-convex-react";

export interface LeadDetailsRow {
  _id: string;
  version: number;
  leadType: "company" | "person";
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  referralSourceId?: string | null;
  notes?: string | null;
}

interface LeadDetailsFormProps {
  lead: LeadDetailsRow;
  referralSources: Array<{ _id: string; name: string }>;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
  onSaved: (message: string) => void;
  onClose: () => void;
}

function optional(value: FormDataEntryValue | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

/**
 * Correct the details of a captured lead. Every field of Lead.reviseDetails
 * rides along pre-filled with the saved value, so a save never drops one.
 * Stage, value and probability stay in the card's own pipeline editor.
 */
export function LeadDetailsForm({
  lead,
  referralSources,
  busy,
  run,
  onSaved,
  onClose,
}: LeadDetailsFormProps) {
  const reviseDetails = useLeadReviseDetails();
  const [leadType, setLeadType] = useState<"company" | "person">(lead.leadType);
  const [referralSourceId, setReferralSourceId] = useState(
    lead.referralSourceId ?? "",
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(`${lead._id}:details`, async () => {
      await reviseDetails({
        docId: lead._id,
        version: lead.version,
        leadType,
        source: String(data.get("source") ?? "").trim(),
        referralSourceId: referralSourceId || undefined,
        companyName: optional(data.get("companyName")),
        givenName: optional(data.get("givenName")),
        familyName: optional(data.get("familyName")),
        email: optional(data.get("email")),
        phone: optional(data.get("phone")),
        notes: optional(data.get("notes")),
      });
      onSaved("Lead details saved.");
      onClose();
    });
  };

  return (
    <form className="lead-edit-form" onSubmit={submit}>
      <p>Correct what you know. The stage and the value stay above.</p>
      <div className="lead-edit-form-grid">
        <label>
          Lead type
          <select
            name="leadType"
            value={leadType}
            onChange={(event) =>
              setLeadType(event.target.value as "company" | "person")
            }
          >
            <option value="company">Company</option>
            <option value="person">Person</option>
          </select>
        </label>
        <label>
          Source
          <input name="source" defaultValue={lead.source} required />
        </label>
        {leadType === "company" ? (
          <label className="lead-edit-form-span-2">
            Company name
            <input
              name="companyName"
              defaultValue={lead.companyName ?? ""}
              required
            />
          </label>
        ) : null}
        <label>
          {leadType === "company" ? "Contact given name" : "Given name"}
          <input
            name="givenName"
            defaultValue={lead.givenName ?? ""}
            required={leadType === "person"}
          />
        </label>
        <label>
          {leadType === "company" ? "Contact family name" : "Family name"}
          <input name="familyName" defaultValue={lead.familyName ?? ""} />
        </label>
        <label className="lead-edit-form-span-2">
          Referral source
          <select
            name="referralSourceId"
            value={referralSourceId}
            onChange={(event) => setReferralSourceId(event.target.value)}
          >
            <option value="">None</option>
            {referralSources.map((source) => (
              <option key={source._id} value={source._id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue={lead.email ?? ""} />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" defaultValue={lead.phone ?? ""} />
        </label>
        <label className="lead-edit-form-span-2">
          Inquiry notes
          <textarea name="notes" rows={3} defaultValue={lead.notes ?? ""} />
        </label>
      </div>
      <div className="lead-edit-form-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy != null}
        >
          {busy === `${lead._id}:details` ? "Saving…" : "Save details"}
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
