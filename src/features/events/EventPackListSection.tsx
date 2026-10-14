import { useState } from "react";
import { useCreatePackList } from "../../lib/manifest-convex-react";
import { useEventPackLists } from "../../lib/useEventRows";
import { PackListDetailPage } from "../logistics/PackListDetailPage";

/**
 * The event's pack list, worked right here on the event: pack, scan, load and
 * send out (owner, 2026-10-14: "if i want to see the pack list for an event
 * ill go to the event and bring up that events pack list").
 */
export function EventPackListSection({ eventId }: { eventId: string }) {
  const lists = useEventPackLists(eventId);
  const createPackList = useCreatePackList();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = (lists ?? []).filter(
    (row) => row.deletedAt == null && row.status !== "cancelled",
  );

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await createPackList({ eventId, name: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="pack-list" className="scroll-mt-20 space-y-6">
      {lists === undefined ? null : live.length === 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Pack list</h2>
            <p className="text-sm text-ink-2">
              No pack list yet. One opens by itself when the event is approved.
            </p>
            {error ? (
              <p className="mt-1 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void open()}
          >
            {busy ? "Opening…" : "Open pack list"}
          </button>
        </div>
      ) : (
        live.map((row) => (
          <PackListDetailPage
            key={String(row._id)}
            listId={String(row._id)}
            inEvent
          />
        ))
      )}
    </section>
  );
}
