import { useMemo, useState } from "react";
import { type Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateEventTimelineComment,
  useEventTimelineCommentRemove,
  useListEventTimelineComment,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { Skeleton } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { EventTabPanel } from "./EventTabPanel";
import { FailureBanner } from "./FailureBanner";

// Roles carrying adminAccess (base.manifest: admin → owner → system).
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

type Props = {
  readonly eventId: Id<"events">;
};

/** Event-wide staff discussion (Overview). Block questions live on Timeline. */
export function EventTimelineCommentsPanel({ eventId }: Props) {
  const authStatus = useAuthStatus();
  const comments = useListEventTimelineComment();
  const people = useListPerson();
  const postComment = useCreateEventTimelineComment();
  const removeComment = useEventTimelineCommentRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [commentBody, setCommentBody] = useState("");

  const eventComments = useMemo(
    () =>
      (comments ?? [])
        .filter(
          (row) =>
            row.deletedAt == null &&
            row.eventId === eventId &&
            (row.activityId == null || row.activityId === ""),
        )
        .sort((a, b) => Number(b.postedAt ?? 0) - Number(a.postedAt ?? 0)),
    [comments, eventId],
  );

  const myPersonId = authStatus?.personId ?? null;
  const isAdmin = ADMIN_ROLES.has(authStatus?.role ?? "");
  // Post as the actual logged-in user; the server also stamps the trusted
  // auth subject and enforces author/admin on delete.
  const me = (people ?? []).find(
    (person) => person._id === myPersonId && person.deletedAt == null,
  );
  const myName =
    [me?.givenName, me?.familyName].filter(Boolean).join(" ") || "You";

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <EventTabPanel
      eyebrow="Staff discussion"
      title="Comments"
      description="Day-level notes from the crew. Questions about a specific run-sheet block live on the Timeline tab."
      testId="event-overview-comments"
    >
      {failure ? <FailureBanner failure={failure} /> : null}
      {me == null ? (
        authStatus === undefined ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <p className="text-[13px] text-ink-3">
            Your account isn&apos;t linked to a staff profile, so you can&apos;t
            post comments.
          </p>
        )
      ) : (
        <form
          className="space-y-3 rounded-sm border border-line-2 bg-panel p-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!commentBody.trim()) return;
            void run("comment", async () => {
              await postComment({
                eventId,
                authorPersonId: me._id,
                authorName: myName,
                body: commentBody.trim(),
              });
              setCommentBody("");
            });
          }}
        >
          <p className="text-[12px] text-ink-3">Posting as {myName}</p>
          <label className="field-label">
            <span>Comment</span>
            <textarea
              className="input min-h-[4rem] py-2"
              value={commentBody}
              onChange={(changeEvent) =>
                setCommentBody(changeEvent.target.value)
              }
              required
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary min-h-10"
            disabled={busy != null || !commentBody.trim()}
          >
            Post comment
          </button>
        </form>
      )}
      <ul className="mt-3 divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
        {eventComments.map((comment) => (
          <li key={comment._id} className="px-3 py-2.5">
            <p className="text-[13px] text-ink">{comment.body}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-3">
              {comment.authorName}
              {comment.postedAt
                ? ` · ${formatDate(comment.postedAt)} ${formatTime(comment.postedAt)}`
                : ""}
            </p>
            {comment.authorPersonId === myPersonId || isAdmin ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-2"
                disabled={busy != null}
                onClick={() =>
                  void run(`rmc:${comment._id}`, () =>
                    removeComment({
                      docId: comment._id,
                      version: comment.version,
                    }),
                  )
                }
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {eventComments.length === 0 ? (
          <li className="px-3 py-3 text-[13px] text-ink-3">
            No planning comments yet.
          </li>
        ) : null}
      </ul>
    </EventTabPanel>
  );
}
