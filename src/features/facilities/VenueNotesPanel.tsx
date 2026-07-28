import { useMemo, useState } from "react";
import { type Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateVenueNote,
  useVenueNoteRemove,
  useVenueNoteRevise,
  useVenueNotePin,
  useVenueNoteUnpin,
  useListVenueNote,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";

// Roles carrying adminAccess (base.manifest: admin → owner → system).
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

const CATEGORY_LABELS: Record<string, string> = {
  access: "Access",
  logistics: "Logistics",
  catering: "Catering",
  equipment: "Equipment",
  staffing: "Staffing",
  restrictions: "Restrictions",
  policies: "Policies",
  weather_contingency: "Weather",
  other: "Other",
};

type Props = {
  readonly venueId: Id<"venues">;
};

/** Venue notes panel for structured institutional memory about venues. */
export function VenueNotesPanel({ venueId }: Props) {
  const authStatus = useAuthStatus();
  const notes = useListVenueNote();
  const people = useListPerson();
  const postNote = useCreateVenueNote();
  const removeNote = useVenueNoteRemove();
  const reviseNote = useVenueNoteRevise();
  const pinNote = useVenueNotePin();
  const unpinNote = useVenueNoteUnpin();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState("internal");

  const venueNotes = useMemo(
    () =>
      (notes ?? [])
        .filter((row) => row.deletedAt == null && row.venueId === venueId)
        .sort((a, b) => {
          // Pinned notes first, then by date descending
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return Number(b.postedAt ?? 0) - Number(a.postedAt ?? 0);
        }),
    [notes, venueId],
  );

  const myPersonId = authStatus?.personId ?? null;
  const isAdmin = ADMIN_ROLES.has(authStatus?.role ?? "");
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
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-ink">Venue Notes</h3>
        <p className="text-[13px] text-ink-3">
          Structured notes about this venue for institutional memory.
        </p>
      </div>

      {failure ? <FailureBanner failure={failure} /> : null}

      {me == null ? (
        <p className="text-[13px] text-ink-3">
          {authStatus === undefined
            ? "Loading…"
            : "Your account isn't linked to a staff profile, so you can't post notes."}
        </p>
      ) : (
        <form
          className="space-y-3 rounded-sm border border-line-2 bg-panel p-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!noteContent.trim()) return;
            void run("post", async () => {
              await postNote({
                venueId,
                authorPersonId: me._id,
                authorName: myName,
                category: category as any,
                content: noteContent.trim(),
                visibility: visibility as any,
              });
              setNoteContent("");
              setCategory("other");
              setVisibility("internal");
            });
          }}
        >
          <p className="text-[12px] text-ink-3">Posting as {myName}</p>

          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">
              <span>Category</span>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              <span>Visibility</span>
              <select
                className="input"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="internal">Internal (staff only)</option>
                <option value="public">Public (visible to clients)</option>
                {isAdmin ? (
                  <option value="management_only">Management only</option>
                ) : null}
              </select>
            </label>
          </div>

          <label className="field-label">
            <span>Note</span>
            <textarea
              className="input min-h-[4rem] py-2"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary min-h-10"
            disabled={busy != null || !noteContent.trim()}
          >
            Post note
          </button>
        </form>
      )}

      <ul className="divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
        {venueNotes.map((note) => (
          <li
            key={note._id}
            className={`px-3 py-2.5 ${note.isPinned ? "bg-warn-soft/50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {note.isPinned ? (
                    <span className="text-warn" title="Pinned">
                      📌
                    </span>
                  ) : null}
                  <span className="text-[12px] font-medium text-ink-2 uppercase">
                    {CATEGORY_LABELS[note.category] || note.category}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-inset text-ink-3">
                    {note.visibility === "public"
                      ? "Public"
                      : note.visibility === "management_only"
                        ? "Mgmt"
                        : "Internal"}
                  </span>
                </div>
                <p className="text-[13px] text-ink mt-1">{note.content}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-3">
                  {note.authorName}
                  {note.postedAt
                    ? ` · ${formatDate(note.postedAt)} ${formatTime(note.postedAt)}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {note.authorPersonId === myPersonId || isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-2"
                      disabled={busy != null}
                      onClick={() =>
                        void run(`pin:${note._id}`, () =>
                          note.isPinned
                            ? unpinNote({
                                docId: note._id,
                                version: note.version,
                              })
                            : pinNote({
                                docId: note._id,
                                version: note.version,
                              }),
                        )
                      }
                      title={note.isPinned ? "Unpin note" : "Pin note"}
                    >
                      {note.isPinned ? "📍" : "📌"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-danger"
                      disabled={busy != null}
                      onClick={() =>
                        void run(`rmv:${note._id}`, () =>
                          removeNote({
                            docId: note._id,
                            version: note.version,
                          }),
                        )
                      }
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </li>
        ))}
        {venueNotes.length === 0 ? (
          <li className="px-3 py-3 text-[13px] text-ink-3">
            No notes yet. Add a note to record important information about this
            venue.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
