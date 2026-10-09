import { useState, type FormEvent } from "react";
import { useOrganizationConfigureEmailSender } from "../../lib/manifest-convex-react";
import { ErrorState, Section } from "../../ui/primitives";

interface OrganizationSenderRecord {
  _id: string;
  version?: number;
  emailSenderName?: string | null;
  emailReplyTo?: string | null;
}

/** Who client emails (invoices, proposals, reminders, inbox replies) come from. */
export function EmailSenderSection({
  record,
  displayName,
  canEdit,
}: {
  record: OrganizationSenderRecord | null | undefined;
  displayName: string;
  canEdit: boolean;
}) {
  const configure = useOrganizationConfigureEmailSender();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy || !record) return;
    const data = new FormData(event.currentTarget);
    const senderName = String(data.get("senderName") ?? "").trim();
    const replyTo = String(data.get("replyTo") ?? "").trim();
    if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(replyTo)) {
      setError(
        "Enter a full email address for replies, like events@yourcompany.com.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await configure({
        docId: record._id,
        version: record.version,
        senderName: senderName || undefined,
        replyTo: replyTo || undefined,
      });
      setNotice(
        replyTo
          ? `Client emails now come from "${senderName || displayName}" and replies go to ${replyTo}.`
          : `Client emails now come from "${senderName || displayName}".`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the sender. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Client emails">
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form border-0 shadow-none"
        onSubmit={save}
      >
        <label>
          Name clients see
          <input
            name="senderName"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.emailSenderName ?? ""}
            placeholder={displayName}
          />
          <span className="mt-1 block text-xs font-normal text-ink-3">
            Left empty, emails use the display name.
          </span>
        </label>
        <label>
          Replies go to
          <input
            name="replyTo"
            type="email"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.emailReplyTo ?? ""}
            placeholder="events@yourcompany.com"
          />
          <span className="mt-1 block text-xs font-normal text-ink-3">
            When a client answers an invoice, proposal or reminder email, the
            answer goes to this address. Left empty, it comes into the Capsule
            inbox (see Client emails below).
          </span>
        </label>
        {error ? <ErrorState title="Sender not saved" detail={error} /> : null}
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
            {busy ? "Saving…" : "Save email sender"}
          </button>
        </div>
      </form>
    </Section>
  );
}
