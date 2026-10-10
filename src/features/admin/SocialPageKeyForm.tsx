import { useState, type FormEvent } from "react";
import { convexActionErrorMessage } from "../../lib/convexActionErrorMessage";
import { formatDateTime } from "../../lib/format";
import {
  useSaveSocialPageKey,
  useSocialPageKeyStatus,
} from "../../lib/socialInboxSetup";
import { ErrorState } from "../../ui/primitives";

/** The Facebook Page key that lets staff answer messages from the inbox. */
export function SocialPageKeyForm({
  canEdit,
  hasPage,
}: {
  canEdit: boolean;
  hasPage: boolean;
}) {
  const status = useSocialPageKeyStatus();
  const saveKey = useSaveSocialPageKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(pageKey: string) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveKey({ pageKey });
      setNotice(
        result.saved
          ? "Key saved. Staff can now answer Facebook and Instagram messages from the inbox."
          : "Key removed. Replies are copied into the app again.",
      );
      return true;
    } catch (cause) {
      setError(
        convexActionErrorMessage(cause, "Could not save the key. Try again."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const pageKey = String(new FormData(form).get("pageKey") ?? "").trim();
    if (!pageKey) return;
    if (await submit(pageKey)) form.reset();
  }

  return (
    <form
      className="supply-form border-0 border-t border-line-2 shadow-none"
      onSubmit={save}
    >
      <label>
        Facebook Page key
        <input
          name="pageKey"
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={!canEdit || busy || !hasPage}
          placeholder={
            status?.savedAt
              ? "Saved — paste a new key to replace it"
              : "Page access token"
          }
        />
        <span className="mt-1 block text-xs font-normal text-ink-3">
          Lets staff answer Facebook and Instagram messages from the inbox. In
          the Meta app, copy the Page access token for your Page. Capsule checks
          it opens your Page, keeps it locked, and never shows it again.
        </span>
      </label>
      {status?.savedAt ? (
        <p className="text-sm text-ink-2">
          Key saved {formatDateTime(status.savedAt)}.
        </p>
      ) : hasPage ? (
        <p className="text-sm text-ink-2">
          No key saved, so replies are copied into the app.
        </p>
      ) : (
        <p className="text-sm text-ink-2">Save your Facebook Page ID first.</p>
      )}
      {error ? <ErrorState title="Key not saved" detail={error} /> : null}
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
          disabled={!canEdit || busy || !hasPage}
        >
          {busy ? "Checking…" : "Save key"}
        </button>
        {status?.savedAt ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void submit("")}
          >
            Remove key
          </button>
        ) : null}
      </div>
    </form>
  );
}
