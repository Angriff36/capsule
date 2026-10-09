import { useState, type FormEvent } from "react";
import { formatDateTime } from "../../lib/format";
import { useOrganizationConfigureTextNumber } from "../../lib/manifest-convex-react";
import { useTextInboxSetup } from "../../lib/textInboxSetup";
import { ErrorState, Section } from "../../ui/primitives";

interface OrganizationTextRecord {
  _id: string;
  version?: number;
  smsNumber?: string | null;
}

/** The number clients text; their texts land in the inbox. */
export function TextNumberSection({
  record,
  canEdit,
}: {
  record: OrganizationTextRecord | null | undefined;
  canEdit: boolean;
}) {
  const configure = useOrganizationConfigureTextNumber();
  const setup = useTextInboxSetup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy || !record) return;
    const data = new FormData(event.currentTarget);
    const smsNumber = String(data.get("smsNumber") ?? "").trim();
    const digits = smsNumber.replace(/\D/gu, "");
    if (smsNumber && (digits.length < 10 || digits.length > 15)) {
      setError("Enter the full texting number, like (555) 010-2000.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await configure({
        docId: record._id,
        version: record.version,
        smsNumber: smsNumber || undefined,
      });
      setNotice(
        !smsNumber
          ? "Client texts are off."
          : setup?.textsReady
            ? `Texts clients send to ${smsNumber} now come into the inbox.`
            : `Saved ${smsNumber}. Its texts come into the inbox once texts are switched on for Capsule.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the texting number. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Client texts">
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form border-0 shadow-none"
        onSubmit={save}
      >
        <label>
          Number clients text
          <input
            name="smsNumber"
            type="tel"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.smsNumber ?? ""}
            placeholder="(555) 010-2000"
          />
          <span className="mt-1 block text-xs font-normal text-ink-3">
            Texts clients send to this number come into the inbox, one
            conversation per client phone. Left empty, no client texts come in.
          </span>
        </label>
        {setup?.address ? (
          <p className="text-sm text-ink-2">
            In Twilio, under this number's "A message comes in", choose Webhook,
            HTTP POST, and paste{" "}
            <code className="break-all">{setup.address}</code>
          </p>
        ) : null}
        {setup?.textsReady && record?.smsNumber ? (
          <p className="text-sm text-ink-2">
            {setup.lastTextAt
              ? `Last client text came in ${formatDateTime(setup.lastTextAt)}.`
              : "No client text has come in to this number yet."}
          </p>
        ) : null}
        {setup && !setup.textsReady ? (
          <p className="text-sm text-warn">
            Texts are not switched on for Capsule yet, so nothing comes in until
            they are.
          </p>
        ) : null}
        {error ? (
          <ErrorState title="Texting number not saved" detail={error} />
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
            {busy ? "Saving…" : "Save texting number"}
          </button>
        </div>
      </form>
    </Section>
  );
}
