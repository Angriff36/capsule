import { useState } from "react";
import { formatDate } from "../../lib/format";
import {
  useDeckShareLinkCreate,
  useDeckShareLinkRevoke,
  useListDeckShareLink,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";

/**
 * PL-DECK-SHARING (spec §4.6): share a file (a pitch deck, a menu PDF) as a
 * link. The link serves this exact file; a new version is a new upload with
 * its own link. "Anyone with the link" is for clients; "Staff only" needs a
 * Capsule sign-in from this company. Sales staff only.
 */
export function DeckShareActions({ attachmentId }: { attachmentId: string }) {
  const authStatus = useAuthStatus();
  const links = useListDeckShareLink();
  const createLink = useDeckShareLinkCreate();
  const revokeLink = useDeckShareLinkRevoke();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const canShare = new Set(resolveManifestPolicies(authStatus?.role ?? "")).has(
    "salesAccess",
  );
  if (!canShare) return null;

  const active = (links ?? [])
    .filter(
      (link) =>
        link.attachmentId === attachmentId && String(link.status) === "active",
    )
    .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

  async function copy(id: string) {
    const url = `${window.location.origin}/deck/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch {
      setNote(`Link: ${url}`);
    }
  }

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await work();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  function share(audience: "anyone" | "staff") {
    void run(async () => {
      const result = (await createLink({ attachmentId, audience })) as {
        _id?: string;
        docId?: string;
      };
      const id = result._id ?? result.docId;
      if (id) await copy(String(id));
    });
  }

  return (
    <div className="mt-1 space-y-1 text-sm">
      {active.map((link) => (
        <p key={link._id} className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">
            {link.audience === "staff" ? "Staff-only link" : "Shared link"} ·{" "}
            {link.viewCount === 0
              ? "not opened yet"
              : `opened ${link.viewCount} ${link.viewCount === 1 ? "time" : "times"}, last ${formatDate(Number(link.lastViewedAt))}`}
            {link.lastViewerIdentity ? ` by ${link.lastViewerIdentity}` : ""}
          </span>
          <button
            type="button"
            className="text-link"
            onClick={() => void copy(link._id)}
          >
            Copy link
          </button>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await revokeLink({ docId: link._id, version: link.version });
                setNote("Link switched off. It no longer opens.");
              })
            }
          >
            Switch off
          </button>
        </p>
      ))}
      <p className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() => share("anyone")}
        >
          Share as a link
        </button>
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() => share("staff")}
        >
          Share with staff only
        </button>
        {note ? <span className="text-ink-2">{note}</span> : null}
      </p>
    </div>
  );
}
