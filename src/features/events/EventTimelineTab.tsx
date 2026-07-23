import { useMemo, useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateEventTimelineActivity,
  useCreateEventTimelineComment,
  useEventTimelineActivityAdjust,
  useEventTimelineActivityRemove,
  useEventTimelineCommentRemove,
  useListEventTimelineActivity,
  useListEventTimelineComment,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { EventTimelinePanel } from "./EventTimelinePanel";

const TEMPLATES = [
  { category: "load_in", name: "Load-in" },
  { category: "setup", name: "Setup" },
  { category: "staff_arrival", name: "Staff arrival" },
  { category: "bar_setup", name: "Bar setup" },
  { category: "kitchen_setup", name: "Kitchen setup" },
  { category: "guest_arrival", name: "Guest arrival" },
  { category: "service", name: "Service" },
  { category: "breakdown", name: "Breakdown" },
  { category: "load_out", name: "Load-out" },
] as const;

type Props = {
  eventId: Id<"events">;
  startsAt?: number | null;
};

/** Battle-board style timeline with templates + staff comments. */
export function EventTimelineTab({ eventId, startsAt }: Props) {
  const activities = useListEventTimelineActivity();
  const comments = useListEventTimelineComment();
  const people = useListPerson();
  const schedule = useCreateEventTimelineActivity();
  const adjust = useEventTimelineActivityAdjust();
  const removeActivity = useEventTimelineActivityRemove();
  const postComment = useCreateEventTimelineComment();
  const removeComment = useEventTimelineCommentRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [authorId, setAuthorId] = useState("");

  const eventComments = useMemo(
    () =>
      (comments ?? [])
        .filter((row) => row.deletedAt == null && row.eventId === eventId)
        .sort((a, b) => Number(b.postedAt ?? 0) - Number(a.postedAt ?? 0)),
    [comments, eventId],
  );

  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );

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

  const defaultStart = startsAt ?? Date.now();

  return (
    <section className="space-y-4" data-testid="event-timeline-tab">
      <div>
        <h2 className="font-display text-lg">Timeline / battle board</h2>
        <p className="text-[13px] text-ink-2">
          Plan load-in through load-out. Add site notes (parking, loading,
          entrances) on each block. Staff discuss below.
        </p>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}

      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((template) => (
          <button
            key={template.category}
            type="button"
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={() =>
              void run(`tpl:${template.category}`, () =>
                schedule({
                  eventId,
                  name: template.name,
                  category: template.category,
                  startsAt: defaultStart,
                  siteNotes: "",
                }),
              )
            }
          >
            + {template.name}
          </button>
        ))}
      </div>

      <EventTimelinePanel eventId={eventId} />

      <div className="rounded-xs border border-line p-3">
        <h3 className="text-[14px] font-semibold">Site planning quick edit</h3>
        <p className="mb-2 text-[12px] text-ink-3">
          Pick an activity and store parking / loading / entrance notes in
          siteNotes.
        </p>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
            formEvent.preventDefault();
            const data = new FormData(formEvent.currentTarget);
            const activityId = String(data.get("activityId") ?? "");
            const siteNotes = String(data.get("siteNotes") ?? "").trim();
            const activity = (activities ?? []).find(
              (row) => row._id === activityId,
            );
            if (!activity) return;
            void run(`site:${activityId}`, () =>
              adjust({
                docId: activity._id,
                version: activity.version,
                siteNotes,
              }),
            );
          }}
        >
          <label className="field-label">
            Activity
            <select name="activityId" className="field-input" required>
              <option value="">Select…</option>
              {(activities ?? [])
                .filter(
                  (row) =>
                    row.eventId === eventId &&
                    row.deletedAt == null &&
                    row.scheduledAt != null,
                )
                .map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.name}
                    {row.category ? ` (${row.category})` : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Site notes
            <input
              name="siteNotes"
              className="field-input"
              placeholder="Parking, loading dock, kitchen entrance…"
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={busy != null}
          >
            Save site notes
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={() => {
              const activityId = window.prompt("Activity id to remove")?.trim();
              const activity = (activities ?? []).find(
                (row) => row._id === activityId,
              );
              if (!activity) return;
              void run(`rm:${activity._id}`, () =>
                removeActivity({
                  docId: activity._id,
                  version: activity.version,
                }),
              );
            }}
          >
            Remove by id…
          </button>
        </form>
      </div>

      <div className="space-y-3 border border-line p-3">
        <h3 className="text-[14px] font-semibold">Staff comments</h3>
        {activePeople.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            No active people available to author comments.
          </p>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const author =
                activePeople.find((person) => person._id === authorId) ??
                activePeople[0];
              if (!author || !commentBody.trim()) return;
              void run("comment", async () => {
                await postComment({
                  eventId,
                  authorPersonId: author._id,
                  authorName: [author.givenName, author.familyName]
                    .filter(Boolean)
                    .join(" "),
                  body: commentBody.trim(),
                });
                setCommentBody("");
              });
            }}
          >
            <label className="field-label">
              Author
              <select
                className="field-input"
                value={authorId || activePeople[0]?._id || ""}
                onChange={(e) => setAuthorId(e.target.value)}
              >
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {[person.givenName, person.familyName]
                      .filter(Boolean)
                      .join(" ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Comment
              <textarea
                className="field-input min-h-[4rem]"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null || !commentBody.trim()}
            >
              Post comment
            </button>
          </form>
        )}
        <ul className="divide-y divide-line">
          {eventComments.map((comment) => (
            <li key={comment._id} className="py-2">
              <p className="text-[13px]">{comment.body}</p>
              <p className="font-mono text-[11px] text-ink-3">
                {comment.authorName}
                {comment.postedAt
                  ? ` · ${formatDate(comment.postedAt)} ${formatTime(comment.postedAt)}`
                  : ""}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
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
            </li>
          ))}
          {eventComments.length === 0 ? (
            <li className="py-2 text-[13px] text-ink-3">
              No planning comments yet.
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
