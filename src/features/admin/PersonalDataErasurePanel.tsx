import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../lib/api";
import { convexActionErrorMessage } from "../../lib/convexActionErrorMessage";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionFailure, useActionNotice } from "../../ui/action-result";
import { EmptyState, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import type { PersonalDataSubject } from "./personalDataExport";

/**
 * PL-RETENTION (AC-155): erase one person's details on request. Before the
 * button does anything the panel lists what is erased, what is deleted, what
 * is kept and why, and anything that stops the erase. Admins can also keep
 * everything about a person with a hold.
 */
export function PersonalDataErasurePanel({
  subject,
}: {
  subject: PersonalDataSubject;
}) {
  const args = { subjectType: subject.type, subjectId: subject.id };
  const preview = useQuery(api.personalDataErasure.preview, args);
  const erase = useMutation(api.personalDataErasure.erase);
  const placeHold = useMutation(api.personalDataErasure.placeHold);
  const releaseHold = useMutation(api.personalDataErasure.releaseHold);
  const [busy, setBusy] = useState(false);
  const { prompt, host } = useActionPrompt(busy);
  const { notice, setNotice } = useActionNotice();
  const { error, setError } = useActionFailure();

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setNotice(done);
    } catch (cause) {
      setError(convexActionErrorMessage(cause, "Capsule could not do that."));
    } finally {
      setBusy(false);
    }
  }

  async function onErase() {
    if (!preview) return;
    const ok = await prompt.askConfirm({
      title: `Erase ${preview.displayName}'s details?`,
      description:
        "This cannot be undone. Download the export first if they asked for a copy.",
      confirmLabel: "Erase details",
      tone: "danger",
    });
    if (ok) {
      await run(
        () => erase(args),
        `${preview.displayName}'s details are erased. Kept records stay.`,
      );
    }
  }

  async function onPlaceHold() {
    const reason = await prompt.askReason({
      title: "Keep everything about this person",
      description:
        "Nothing about them can be erased until you release the hold.",
      label: "Why",
      placeholder: "For example: wage claim open",
      confirmLabel: "Place hold",
    });
    if (reason !== null) {
      await run(
        () => placeHold({ ...args, reason }),
        "Hold placed. Nothing about this person can be erased.",
      );
    }
  }

  return (
    <Section title="Erase details">
      {host}
      {preview === undefined ? (
        <QueryLoadState
          loadingTooLong={false}
          title="Checking what is on file"
          detail={`Listing what would be erased and kept for ${subject.displayName}.`}
        />
      ) : preview === null ? (
        <EmptyState
          title="This person is no longer available"
          hint="Refresh the page and choose the person again."
        />
      ) : (
        <div className="space-y-4 p-4 text-sm">
          {preview.erasedAt ? (
            <p className="text-ink-2">
              Details erased on {new Date(preview.erasedAt).toLocaleString()}.
            </p>
          ) : (
            <>
              <List title="Erased" items={preview.fieldsErased} />
              {preview.deleted.length ? (
                <List
                  title="Deleted"
                  items={preview.deleted.map(
                    (group) => `${group.label} (${group.count})`,
                  )}
                />
              ) : null}
            </>
          )}
          <div>
            <p className="field-label">Kept</p>
            {preview.kept.length ? (
              <ul className="mt-1 space-y-1">
                {preview.kept.map((group) => (
                  <li key={group.label}>
                    <span className="text-ink">
                      {group.label} ({group.count})
                    </span>{" "}
                    <span className="text-ink-3">- {group.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-3">Nothing needs to be kept.</p>
            )}
            <p className="mt-1 text-xs text-ink-3">
              Kept records are never deleted by time. They stay until the
              company decides how long to keep them.
            </p>
          </div>
          {[...preview.warnings, ...preview.blockers].map((line) => (
            <p key={line} className="text-warn">
              {line}
            </p>
          ))}
          {notice ? (
            <p className="text-ok" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {preview.erasedAt ? null : (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || preview.blockers.length > 0}
                onClick={() => void onErase()}
              >
                Erase details
              </button>
            )}
            {preview.hold ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => releaseHold(args), "Hold released.")
                }
              >
                Release hold
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void onPlaceHold()}
              >
                Place hold
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="field-label">{title}</p>
      <p className="mt-1 text-ink-2">{items.join(", ")}</p>
    </div>
  );
}

/** Who erased or held whom, newest first. */
export function PersonalDataErasureHistory() {
  const rows = useQuery(api.personalDataErasure.history, {});
  if (!rows?.length) return null;
  const words: Record<string, string> = {
    PersonalDataErased: "Erased details",
    PersonalDataHoldPlaced: "Placed a hold",
    PersonalDataHoldReleased: "Released a hold",
  };
  return (
    <Section title="Erase and hold history" count={rows.length}>
      <ul className="divide-y divide-line text-sm">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-2">
            <span className="text-ink">{row.by}</span>{" "}
            <span className="text-ink-2">
              {(words[row.type] ?? row.type).toLowerCase()} for a{" "}
              {row.subjectType === "staff" ? "staff person" : "client contact"}
            </span>{" "}
            <span className="text-ink-3">
              {new Date(row.at).toLocaleString()}
              {row.reason ? ` - ${row.reason}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
