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
import { FailureBanner } from "./FailureBanner";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

type Props = {
  readonly eventId: Id<"events">;
  readonly activityId: string;
};

/** Collapsible per-block questions thread for one timeline activity. */
export function EventTimelineBlockQuestions({ eventId, activityId }: Props) {
  const authStatus = useAuthStatus();
  const comments = useListEventTimelineComment();
  const people = useListPerson();
  const postComment = useCreateEventTimelineComment();
  const removeComment = useEventTimelineCommentRemove();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [body, setBody] = useState("");

  const blockComments = useMemo(
    () =>
      (comments ?? [])
        .filter(
          (row) =>
            row.deletedAt == null &&
            row.eventId === eventId &&
            row.activityId === activityId,
        )
        .sort((left, right) => bPosted(right) - bPosted(left)),
    [activityId, comments, eventId],
  );

  const myPersonId = authStatus?.personId ?? null;
  const isAdmin = ADMIN_ROLES.has(authStatus?.role ?? "");
  const me = (people ?? []).find(
    (person) => person._id === myPersonId && person.deletedAt == null,
  );
  const myName =
    [me?.givenName, me?.familyName].filter(Boolean).join(" ") || "You";

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-2 border-t border-line pt-2"
      data-testid="timeline-block-questions"
    >
      <button
        type="button"
        className="btn-link"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide questions & details" : "Questions & details"}
        {blockComments.length > 0 ? (
          <span className="rounded-sm bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info">
            {blockComments.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {failure ? <FailureBanner failure={failure} /> : null}
          {me == null ? (
            authStatus === undefined ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <p className="text-sm text-ink-3">
                Your account isn&apos;t linked to a staff profile, so you
                can&apos;t post questions.
              </p>
            )
          ) : (
            <form
              className="space-y-2"
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                if (!body.trim()) return;
                void run(async () => {
                  await postComment({
                    eventId,
                    activityId,
                    authorPersonId: me._id,
                    authorName: myName,
                    body: body.trim(),
                  });
                  setBody("");
                });
              }}
            >
              <label className="field-label">
                <span>Question or note</span>
                <textarea
                  className="input min-h-[3rem] py-2"
                  value={body}
                  onChange={(changeEvent) => setBody(changeEvent.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !body.trim()}
              >
                Post
              </button>
            </form>
          )}
          <ul className="divide-y divide-line-2 rounded-sm border border-line-2 bg-canvas">
            {blockComments.map((comment) => (
              <li key={comment._id} className="px-2.5 py-2">
                <p className="text-sm text-ink">{comment.body}</p>
                <p className="mt-1 font-mono text-2xs text-ink-3">
                  {comment.authorName}
                  {comment.postedAt
                    ? ` · ${formatDate(comment.postedAt)} ${formatTime(comment.postedAt)}`
                    : ""}
                </p>
                {comment.authorPersonId === myPersonId || isAdmin ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mt-1"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
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
            {blockComments.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-ink-3">
                No questions on this block yet.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function bPosted(row: { postedAt?: number | null }): number {
  return Number(row.postedAt ?? 0);
}
