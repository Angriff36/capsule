import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { ErrorState, TableSkeleton } from "../../ui/primitives";
import { useLatestDefined, useMinuteClock } from "../../lib/useMinuteClock";

/**
 * PL-DECK-SHARING (spec §4.6): the page a shared deck link opens
 * (`/deck/:token`, no sign-in for "anyone" links). Shows the exact file that
 * was shared and counts the view once per page load.
 */
export function SharedDeckPage({ token }: { token: string }) {
  const clock = useMinuteClock();
  const deck = useLatestDefined(
    useQuery(api.deckShareLinks.getSharedDeck, { token, clock }),
  );
  const recordView = useMutation(api.deckShareLinks.recordDeckView);
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (!deck || recorded.current === token) return;
    recorded.current = token;
    void recordView({
      token,
      viewerIdentity: navigator.userAgent.slice(0, 80),
    }).catch(() => {
      /* counting a view never blocks the page */
    });
  }, [token, deck, recordView]);

  if (deck === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="This link isn't available"
            detail="The link was switched off, has ended, or the file was removed. If it was shared with staff only, sign in to Capsule first. Ask the sender for a new link."
          />
        </div>
      </div>
    );
  }

  const isPdf = deck.contentType === "application/pdf";
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{deck.fileName}</h1>
            <p className="text-sm text-ink-2">
              This link works until {formatDate(deck.linkExpiresAt)}.
            </p>
          </div>
          {deck.url ? (
            <a
              className="btn btn-ghost"
              href={deck.url}
              target="_blank"
              rel="noreferrer"
              download={deck.fileName}
            >
              Download
            </a>
          ) : null}
        </header>
        {deck.url && isPdf ? (
          <iframe
            title={deck.fileName}
            src={deck.url}
            className="h-[80vh] w-full rounded-sm border border-line bg-panel"
          />
        ) : deck.url && deck.contentType.startsWith("image/") ? (
          <img
            src={deck.url}
            alt={deck.fileName}
            className="w-full rounded-sm border border-line"
          />
        ) : (
          <p className="text-base text-ink-2">
            Use Download to open this file.
          </p>
        )}
      </div>
    </div>
  );
}
