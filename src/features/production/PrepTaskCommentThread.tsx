import { useUser } from "@clerk/react";
import { useMemo, useState, type FormEvent } from "react";
import {
  useCreatePrepTaskComment,
  useListPrepTaskComment,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";

const CATEGORY_LABEL: Record<string, string> = {
  note: "Note",
  blocker: "Blocker",
  substitution: "Substitution",
  status_update: "Status update",
};

const CATEGORY_TONE: Record<string, string> = {
  note: "border-line-2 bg-inset text-ink-2",
  blocker: "border-danger/40 bg-danger-soft text-danger",
  substitution: "border-warn/30 bg-warn-soft text-warn",
  status_update: "border-info/30 bg-info-soft text-info",
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type PrepTaskLike = {
  _id: string;
  eventId: string;
  eventDishId?: string | null;
  assignedToId?: string | null;
  status?: string | null;
  name?: string | null;
};

type PersonLike = {
  _id: string;
  givenName: string;
  familyName: string;
  authSubjectId?: string | null;
  deletedAt?: number | string | null;
};

function personName(person: PersonLike | undefined) {
  if (!person) return "Unknown";
  return `${person.givenName} ${person.familyName}`.trim();
}

function personForComment(
  comment: {
    authorPersonId?: string | null;
    authorName?: string | null;
    authorAuthSubjectId?: string | null;
  },
  people: PersonLike[] | undefined,
): string {
  const byId = comment.authorPersonId
    ? people?.find((p) => p._id === comment.authorPersonId)
    : undefined;
  if (byId) return personName(byId);
  if (comment.authorName) return comment.authorName;
  const bySubject = comment.authorAuthSubjectId
    ? people?.find((p) => p.authSubjectId === comment.authorAuthSubjectId)
    : undefined;
  if (bySubject) return personName(bySubject);
  return "Unknown";
}

/**
 * Per-prep-task comment thread. Comments are appended in chronological order;
 * kitchen staff can post blockers, substitutions, or general notes without
 * touching the task status.
 */
export function PrepTaskCommentThread({ task }: { task: PrepTaskLike }) {
  const { user } = useUser();
  const authStatus = useAuthStatus();
  const comments = useListPrepTaskComment();
  const people = useListPerson();
  const createComment = useCreatePrepTaskComment();

  const taskComments = useMemo(
    () =>
      (comments ?? [])
        .filter((c) => c.deletedAt == null && c.prepTaskId === task._id)
        .sort((a, b) => (a.postedAt ?? 0) - (b.postedAt ?? 0)),
    [comments, task._id],
  );

  const taskOwner = useMemo(
    () =>
      task.assignedToId
        ? people?.find((p) => p._id === task.assignedToId)
        : undefined,
    [people, task.assignedToId],
  );

  const myPersonId = authStatus?.personId ?? null;
  const me = useMemo(
    () =>
      myPersonId
        ? people?.find((p) => p._id === myPersonId && p.deletedAt == null)
        : undefined,
    [people, myPersonId],
  );
  const myName = me ? personName(me) : (user?.fullName?.trim() ?? "");
  // The post command rejects a notification aimed at the poster themselves, so
  // omit the owner fields when the current user owns the task.
  const ownerIsMe =
    (task.assignedToId != null && task.assignedToId === myPersonId) ||
    (taskOwner?.authSubjectId != null && taskOwner.authSubjectId === user?.id);

  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<
    "note" | "blocker" | "substitution" | "status_update"
  >("note");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || busy) return;
    setFailure(null);
    setBusy(true);
    void createComment({
      prepTaskId: task._id,
      eventId: task.eventId,
      eventDishId: task.eventDishId ?? undefined,
      category,
      body,
      authorPersonId: myPersonId ?? undefined,
      authorName: myName || undefined,
      taskOwnerAssignedToId: ownerIsMe
        ? undefined
        : (task.assignedToId ?? undefined),
      taskOwnerAuthSubjectId: ownerIsMe
        ? undefined
        : (taskOwner?.authSubjectId ?? undefined),
    })
      .then(() => {
        setDraft("");
        setCategory("note");
      })
      .catch(setFailure)
      .finally(() => setBusy(false));
  };

  return (
    <section aria-label={`Comments for ${task.name ?? "prep task"}`}>
      <h3 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">
        Prep thread
        <span className="ml-1.5 font-mono text-ink-3 normal-case">
          {taskComments.length}
        </span>
      </h3>
      <p className="mt-1 text-xs text-ink-3">
        Log blockers, substitutions, or notes without changing the task status.
        {taskOwner
          ? ` Notifies ${personName(taskOwner)}.`
          : " Posts notify whoever owns the task."}
      </p>
      <ul className="mt-2 space-y-2">
        {taskComments.length === 0 ? (
          <li className="rounded-sm border border-dashed border-line-2 px-3 py-2 text-sm text-ink-3">
            No notes yet.
          </li>
        ) : (
          taskComments.map((comment) => {
            const authorLabel = personForComment(comment, people);
            const tone =
              CATEGORY_TONE[comment.category ?? "note"] ?? CATEGORY_TONE.note;
            return (
              <li
                key={comment._id}
                className="rounded-sm border border-line-2 bg-panel px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{authorLabel}</span>
                  <span
                    className={`rounded-xs border px-1.5 py-0.5 text-2xs font-medium tracking-wide uppercase ${tone}`}
                  >
                    {CATEGORY_LABEL[comment.category ?? "note"] ??
                      comment.category}
                  </span>
                  <span className="text-2xs text-ink-3">
                    {timeFormat.format(comment.postedAt ?? 0)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">
                  {comment.body}
                </p>
              </li>
            );
          })
        )}
      </ul>
      <form
        onSubmit={submit}
        className="mt-3 space-y-2"
        aria-label="Post a comment"
      >
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              disabled={busy}
              aria-label="Note category"
            >
              <option value="note">Note</option>
              <option value="blocker">Blocker</option>
              <option value="substitution">Substitution</option>
              <option value="status_update">Status update</option>
            </select>
          </label>
        </div>
        <textarea
          className="input min-h-15"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            taskOwner
              ? `Add a note (notifies ${personName(taskOwner)})…`
              : "Add a note for the team…"
          }
          aria-label="Comment text"
          rows={2}
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-2">
          {failure ? (
            <p className="text-xs text-danger" role="alert">
              Could not post: {String((failure as Error)?.message ?? failure)}
            </p>
          ) : (
            <span className="text-xs text-ink-3">
              {myName ? `Posting as ${myName}` : ""}
            </span>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || draft.trim().length === 0}
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
    </section>
  );
}
