import { useState, type FormEvent } from "react";
import { formatDateTime } from "../../lib/format";
import { useOrganizationConfigureSocialAccounts } from "../../lib/manifest-convex-react";
import { useSocialInboxSetup } from "../../lib/socialInboxSetup";
import { ErrorState, Section } from "../../ui/primitives";

interface OrganizationSocialRecord {
  _id: string;
  version?: number;
  facebookPageId?: string | null;
  instagramAccountId?: string | null;
}

const ACCOUNT_ID = /^\d{5,25}$/u;

/** The Facebook Page and Instagram account clients message; messages land in the inbox. */
export function SocialAccountsSection({
  record,
  canEdit,
}: {
  record: OrganizationSocialRecord | null | undefined;
  canEdit: boolean;
}) {
  const configure = useOrganizationConfigureSocialAccounts();
  const setup = useSocialInboxSetup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy || !record) return;
    const data = new FormData(event.currentTarget);
    const facebookPageId = String(data.get("facebookPageId") ?? "").trim();
    const instagramAccountId = String(
      data.get("instagramAccountId") ?? "",
    ).trim();
    if (
      (facebookPageId && !ACCOUNT_ID.test(facebookPageId)) ||
      (instagramAccountId && !ACCOUNT_ID.test(instagramAccountId))
    ) {
      setError(
        "Enter the account number only (digits), as shown in Meta's settings.",
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
        facebookPageId: facebookPageId || undefined,
        instagramAccountId: instagramAccountId || undefined,
      });
      setNotice(
        !facebookPageId && !instagramAccountId
          ? "Facebook and Instagram messages are off."
          : setup?.socialReady
            ? "Messages clients send to these accounts now come into the inbox."
            : "Saved. Messages come into the inbox once Facebook and Instagram are switched on for Capsule.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the accounts. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Facebook and Instagram messages">
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form border-0 shadow-none"
        onSubmit={save}
      >
        <label>
          Facebook Page ID
          <input
            name="facebookPageId"
            inputMode="numeric"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.facebookPageId ?? ""}
            placeholder="104729383920123"
          />
        </label>
        <label>
          Instagram account ID
          <input
            name="instagramAccountId"
            inputMode="numeric"
            disabled={!canEdit || busy || !record}
            defaultValue={record?.instagramAccountId ?? ""}
            placeholder="17841400000000000"
          />
          <span className="mt-1 block text-xs font-normal text-ink-3">
            Messages clients send to these accounts come into the inbox, one
            conversation per client. Left empty, no messages come in from that
            account.
          </span>
        </label>
        {setup?.address ? (
          <p className="text-sm text-ink-2">
            In the Meta app's Webhooks settings, subscribe to "messages" and
            paste <code className="break-all">{setup.address}</code> as the
            callback address.
          </p>
        ) : null}
        {setup?.socialReady && record?.facebookPageId ? (
          <p className="text-sm text-ink-2">
            {setup.lastFacebookAt
              ? `Last Facebook message came in ${formatDateTime(setup.lastFacebookAt)}.`
              : "No Facebook message has come in yet."}
          </p>
        ) : null}
        {setup?.socialReady && record?.instagramAccountId ? (
          <p className="text-sm text-ink-2">
            {setup.lastInstagramAt
              ? `Last Instagram message came in ${formatDateTime(setup.lastInstagramAt)}.`
              : "No Instagram message has come in yet."}
          </p>
        ) : null}
        {setup && !setup.socialReady ? (
          <p className="text-sm text-warn">
            Facebook and Instagram are not switched on for Capsule yet, so
            nothing comes in until they are.
          </p>
        ) : null}
        {error ? (
          <ErrorState title="Accounts not saved" detail={error} />
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
            {busy ? "Saving…" : "Save accounts"}
          </button>
        </div>
      </form>
    </Section>
  );
}
