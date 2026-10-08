import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { api, type Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  useCreateAttachment,
  useCreateVenueNote,
} from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { useAllEventReportRows } from "./useEventsById";
import {
  SITE_VISIT_AREAS,
  SITE_VISIT_SHOTS,
  shotCounts,
  siteVisitDue,
  siteVisitText,
} from "./venueSiteVisit";

const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();

/**
 * Site visits (Venue Partner Playbook section 08): when this venue needs a
 * visit, the last visit's findings, the area-by-area checklist, and the
 * photos every visit needs.
 */
export function VenueSiteVisitPanel({ venue }: { venue: Doc<"venues"> }) {
  const venueId = String(venue._id);
  // This venue's notes only, read by venue.
  const notes = useQuery(api.queries.listVenueNoteByVenueId, {
    venueId: venue._id,
  });
  const events = useAllEventReportRows();
  const files = useQuery(api.fileStorage.listForParent, {
    parentType: "venue",
    parentId: venueId,
  });
  const postNote = useCreateVenueNote();
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shot, setShot] = useState<string | null>(null);

  const due = useMemo(
    () =>
      siteVisitDue({
        venue,
        events: events ?? [],
        notes: notes ?? [],
        now: Date.now(),
      }),
    [venue, events, notes],
  );
  const lastVisit = useMemo(
    () =>
      (notes ?? [])
        .filter(
          (note) =>
            String(note.venueId) === venueId &&
            note.category === "site_visit" &&
            note.deletedAt == null,
        )
        .sort((a, b) => Number(b.postedAt ?? 0) - Number(a.postedAt ?? 0))[0],
    [notes, venueId],
  );
  const counts = shotCounts(files);

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

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const concerns = text(data, "concerns");
    const content = siteVisitText({
      answers: Object.fromEntries(
        SITE_VISIT_AREAS.map((area) => [area.key, text(data, area.key)]),
      ),
      concerns,
      dishIdea: text(data, "dishIdea"),
    });
    if (!content) {
      setFailure(
        classifyCommandFailure(
          new Error("Write what you found in at least one area."),
        ),
      );
      return;
    }
    void run("save", async () => {
      await postNote({
        venueId: venue._id,
        category: "site_visit",
        content,
        visibility: "internal",
        // Concerns stay at the top of the venue notes until someone deals
        // with them (playbook: flag deal-breakers at once).
        isPinned: concerns ? true : undefined,
      });
      setEditing(false);
      setSaved(true);
    });
  };

  const upload = (picked: File[]) => {
    const label = shot;
    if (!label) return;
    void run(`shot:${label}`, async () => {
      try {
        for (const file of picked) {
          const contentType = file.type || "application/octet-stream";
          const response = await fetch(await generateUploadUrl(), {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: file,
          });
          if (!response.ok) {
            throw new Error(
              `${file.name} did not upload (${response.status}).`,
            );
          }
          const { storageId } = (await response.json()) as {
            storageId: string;
          };
          await createAttachment({
            parentType: "venue",
            parentId: venueId,
            fileName: `${label} - ${file.name}`,
            contentType,
            fileSize: file.size,
            storageId,
          });
        }
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  return (
    <Section title="Site visits">
      <div className="space-y-4 p-4" data-testid="venue-site-visit">
        {failure ? <FailureBanner failure={failure} /> : null}

        {due.reasons.length > 0 ? (
          <ul
            className="space-y-1 rounded-sm border border-line-2 bg-warn-soft/50 p-3 text-sm text-ink"
            data-testid="site-visit-due"
          >
            <li className="font-semibold">A site visit is due</li>
            {due.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}

        {lastVisit ? (
          <div className="space-y-1 text-sm">
            <p className="text-ink-3">
              Last site visit
              {lastVisit.postedAt ? ` ${formatDate(lastVisit.postedAt)}` : ""}
              {lastVisit.authorName ? ` by ${lastVisit.authorName}` : ""}
            </p>
            <p className="whitespace-pre-line text-ink">{lastVisit.content}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            No site visit recorded yet. Walk the venue with the checklist and
            write down what you find in each area.
          </p>
        )}
        {saved && !editing ? (
          <p className="text-sm text-ok" role="status">
            Site visit saved.
          </p>
        ) : null}

        {editing ? (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {SITE_VISIT_AREAS.map((area) => (
              <label key={area.key} className="field-label">
                <span>{area.label}</span>
                <textarea
                  className="input min-h-[6rem] py-2"
                  name={area.key}
                  placeholder={area.check}
                />
                <span className="text-xs text-ink-3">{area.tip}</span>
              </label>
            ))}
            <label className="field-label sm:col-span-2">
              <span>Concerns or deal-breakers</span>
              <textarea
                className="input min-h-[4rem] py-2"
                name="concerns"
                placeholder="Anything that could stop us working here"
              />
              <span className="text-xs text-ink-3">
                Written concerns keep this visit pinned at the top of the venue
                notes.
              </span>
            </label>
            <label className="field-label sm:col-span-2">
              <span>Only-here dish idea</span>
              <input
                className="input"
                name="dishIdea"
                placeholder="A dish that would suit only this venue"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy != null}
              >
                {busy === "save" ? "Saving…" : "Save site visit"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy != null}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            Record a site visit
          </button>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Site visit photos</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              if (picked.length > 0) upload(picked);
            }}
          />
          <ul className="grid gap-2 sm:grid-cols-2">
            {SITE_VISIT_SHOTS.map((item) => {
              const count = counts[item.key] ?? 0;
              return (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 rounded-sm border border-line-2 bg-panel px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {count > 0 ? "✓ " : ""}
                      {item.key}
                      <span className="font-normal text-ink-3">
                        {" "}
                        ·{" "}
                        {count > 0
                          ? `${count} photo${count === 1 ? "" : "s"}`
                          : "none yet"}
                      </span>
                    </p>
                    <p className="text-xs text-ink-3">{item.hint}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    disabled={busy != null}
                    aria-label={`Add ${item.key} photos`}
                    onClick={() => {
                      setShot(item.key);
                      fileRef.current?.click();
                    }}
                  >
                    {busy === `shot:${item.key}` ? "Uploading…" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-3">
            Photos are kept with this venue's files below.
          </p>
        </div>
      </div>
    </Section>
  );
}
