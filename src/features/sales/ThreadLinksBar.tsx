import { Link } from "react-router-dom";
import type { Doc } from "../../lib/api";
import {
  useMessageThreadLinkEvent,
  useMessageThreadMergeInto,
  useMessageThreadSetStatus,
} from "../../lib/manifest-convex-react";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";

type Thread = Doc<"messageThreads">;
type EventRow = Doc<"events">;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function eventChoiceLabel(
  event: Pick<EventRow, "title" | "eventNumber" | "startsAt">,
): string {
  const title = event.title?.trim() || "Untitled event";
  const number = event.eventNumber ? `#${event.eventNumber} ` : "";
  const when = event.startsAt ? ` · ${dateFormat.format(event.startsAt)}` : "";
  return `${number}${title}${when}`;
}

/**
 * PL-INBOX (AC-106, AC-248, AC-249): what this conversation is about and
 * where it belongs. Staff link it to an event, mark it as not a sales lead,
 * or fold a duplicate into another conversation. Nothing here deletes a
 * message: a merged thread keeps its messages and the target shows them.
 */
export function ThreadLinksBar({
  thread,
  threads,
  threadTitle,
  onFailure,
  onNotice,
}: {
  thread: Thread;
  threads: Thread[];
  threadTitle: (t: Thread) => string;
  onFailure: (error: unknown) => void;
  onNotice: (notice: string) => void;
}) {
  const events = usePickerAndNamedEvents([thread.eventId]);
  const linkEvent = useMessageThreadLinkEvent();
  const mergeInto = useMessageThreadMergeInto();
  const setStatus = useMessageThreadSetStatus();

  const liveEvents = (events ?? []).filter((e) => e.deletedAt == null);
  const linkedEvent = thread.eventId
    ? liveEvents.find((e) => e._id === thread.eventId)
    : undefined;
  const mergeTargets = threads.filter(
    (t) => t._id !== thread._id && t.mergedIntoThreadId == null,
  );
  const mergedInto = thread.mergedIntoThreadId
    ? threads.find((t) => t._id === thread.mergedIntoThreadId)
    : undefined;

  const run = async (step: () => Promise<unknown>, done: string) => {
    try {
      await step();
      onNotice(done);
    } catch (e) {
      onFailure(e);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-line-2 px-4 py-2 text-sm"
      data-testid="thread-links"
    >
      <span className="text-ink-3">Event</span>
      <select
        className="input max-w-64"
        aria-label="Link event"
        value={thread.eventId ?? ""}
        onChange={(e) => {
          const eventId = e.target.value;
          void run(
            () =>
              linkEvent({
                docId: thread._id,
                ...(eventId ? { eventId: eventId as EventRow["_id"] } : {}),
              }),
            eventId
              ? "Linked this conversation to the event."
              : "Removed the event link.",
          );
        }}
      >
        <option value="">No event</option>
        {liveEvents.map((e) => (
          <option key={e._id} value={e._id}>
            {eventChoiceLabel(e)}
          </option>
        ))}
      </select>
      {linkedEvent ? (
        <Link
          className="text-brand underline"
          to={`/events/${linkedEvent._id}`}
        >
          Open event
        </Link>
      ) : null}

      {mergedInto ? (
        <span className="ml-auto text-ink-3">
          Merged into “{threadTitle(mergedInto)}”. Its messages show there.
        </span>
      ) : (
        <>
          {thread.status === "active" && !thread.leadId ? (
            <button
              type="button"
              className="btn btn-ghost ml-auto"
              onClick={() =>
                void run(
                  () =>
                    setStatus({
                      docId: thread._id,
                      status: "non_lead",
                      version: thread.version,
                    }),
                  "Marked as not a sales lead. The messages are kept.",
                )
              }
            >
              Not a lead
            </button>
          ) : null}
          {thread.status === "non_lead" ? (
            <span className="ml-auto text-ink-3">Not a sales lead</span>
          ) : null}
          {mergeTargets.length > 0 ? (
            <select
              className="input max-w-56"
              aria-label="Merge into another conversation"
              value=""
              onChange={(e) => {
                const target = e.target.value;
                if (!target) return;
                void run(
                  () =>
                    mergeInto({
                      docId: thread._id,
                      targetThreadId: target as Thread["_id"],
                      version: thread.version,
                    }),
                  "Merged. The messages now show in the other conversation.",
                );
              }}
            >
              <option value="">Merge into…</option>
              {mergeTargets.map((t) => (
                <option key={t._id} value={t._id}>
                  {threadTitle(t)}
                </option>
              ))}
            </select>
          ) : null}
        </>
      )}
    </div>
  );
}
