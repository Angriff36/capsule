import { useState, type FormEvent } from "react";
import { useOrganizationConfigureContactDetails } from "../../lib/manifest-convex-react";
import { ErrorState, Section } from "../../ui/primitives";

interface OrganizationContactRecord {
  _id: string;
  version?: number;
  brandPhone?: string | null;
  brandWebsite?: string | null;
}

/** Phone and website clients see at the foot of the public menu. */
export function ContactDetailsSection({
  record,
  canEdit,
}: {
  record: OrganizationContactRecord | null | undefined;
  canEdit: boolean;
}) {
  const configure = useOrganizationConfigureContactDetails();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy || !record) return;
    const data = new FormData(event.currentTarget);
    const phone = String(data.get("phone") ?? "").trim();
    const website = String(data.get("website") ?? "").trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await configure({
        docId: record._id,
        version: record.version,
        phone: phone || undefined,
        website: website || undefined,
      });
      setNotice("Phone and website saved. The public menu shows them now.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the phone and website. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Phone and website">
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form border-0 shadow-none"
        onSubmit={save}
      >
        <label>
          Phone clients call
          <input
            name="phone"
            type="tel"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.brandPhone ?? ""}
            placeholder="509-555-0142"
          />
        </label>
        <label>
          Website
          <input
            name="website"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.brandWebsite ?? ""}
            placeholder="yourcompany.com"
          />
          <span className="mt-1 block text-xs font-normal text-ink-3">
            Both show at the foot of your public menu. Left empty, they are not
            shown.
          </span>
        </label>
        {error ? (
          <ErrorState title="Phone and website not saved" detail={error} />
        ) : null}
        {notice ? (
          <p
            className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        <div className="supply-row-actions">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!canEdit || busy || !record}
          >
            {busy ? "Saving…" : "Save phone and website"}
          </button>
        </div>
      </form>
    </Section>
  );
}
