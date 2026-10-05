import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  useCreateVenueNote,
  useVenueSetPartnership,
} from "../../lib/manifest-convex-react";
import type { EventLookupRow } from "./useEventsById";
import {
  BRIEF_PARTS,
  CONFIRMED_PREFIX,
  HANDOFF_REASONS,
  JOINT_VISIT_PREFIX,
  handoffDraft,
  handoffStatus,
  handoffText,
  type BriefAnswers,
  type BriefPartKey,
} from "./venueHandoff";
import type { PartnerTier } from "./venuePartnership";

const fullName = (person: Doc<"people"> | undefined) =>
  person ? [person.givenName, person.familyName].filter(Boolean).join(" ") : "";

/**
 * Hand a partner venue to a new owner (playbook section 02): the brief, the
 * joint visit, 30 days where the venue can still call the old owner, and
 * the venue's confirmation. Changing the owner happens only here, so the
 * brief is always offered; every part of it may stay blank.
 */
export function VenueHandoffPanel({
  venue,
  staff,
  notes,
  events,
  run,
  busy,
}: {
  venue: Doc<"venues">;
  staff: Doc<"people">[];
  notes: Doc<"venueNotes">[];
  events: EventLookupRow[];
  run: (key: string, work: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const setPartnership = useVenueSetPartnership();
  const postNote = useCreateVenueNote();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<BriefAnswers>({});
  const [stepText, setStepText] = useState("");

  const venueId = String(venue._id);
  const now = Date.now();
  const status = handoffStatus({ venueId, notes, now });
  const owner = staff.find(
    (person) => String(person._id) === String(venue.partnerOwnerPersonId),
  );

  const start = () => {
    setAnswers(handoffDraft({ venueId, events, notes, now, formatDate }));
    setOpen(true);
  };

  const handOver = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const toId = String(data.get("toPersonId") ?? "");
    const to = staff.find((person) => String(person._id) === toId);
    if (!to) return;
    void run("handoff", async () => {
      await postNote({
        venueId: venue._id,
        category: "handoff",
        content: handoffText({
          from: fullName(owner),
          to: fullName(to),
          reason: String(data.get("reason") ?? ""),
          answers,
        }),
        visibility: "internal",
      });
      // Every partner detail is restated: a left-out one would be cleared.
      await setPartnership({
        docId: venue._id,
        version: venue.version,
        partnerTier: (venue.partnerTier ?? undefined) as
          PartnerTier | undefined,
        partnerOwnerPersonId: toId,
        opsEaseScore: venue.opsEaseScore ?? undefined,
        relationshipScore: venue.relationshipScore ?? undefined,
      });
      setOpen(false);
    });
  };

  const logStep = (prefix: string, fallback: string) =>
    void run(prefix, async () => {
      await postNote({
        venueId: venue._id,
        category: "check_in",
        content: `${prefix}${stepText.trim() || fallback}`,
        visibility: "internal",
      });
      setStepText("");
    });

  const step = (label: string, doneAt: number | null, detail: string) => (
    <li className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="font-semibold text-ink">{label}</span>
      <span className={doneAt == null ? "text-ink-3" : "text-ink-2"}>
        {doneAt == null ? detail : `Done ${formatDate(doneAt)}`}
      </span>
    </li>
  );

  return (
    <div className="space-y-3" data-testid="venue-handoff">
      <h3 className="text-sm font-semibold text-ink">Hand over this venue</h3>

      {status && !status.done ? (
        <div className="space-y-3 rounded-sm border border-line p-3 text-sm">
          <p className="text-ink-2">
            Handed over from {status.from || "no owner"} to {status.to} on{" "}
            {formatDate(status.at)}.{" "}
            {status.shadowDaysLeft > 0
              ? `The venue can still call ${status.from || "the old owner"} until ${formatDate(status.shadowUntil)} (${status.shadowDaysLeft} day${status.shadowDaysLeft === 1 ? "" : "s"} left).`
              : `${status.to} is now on their own.`}
          </p>
          <ol className="space-y-1">
            {step("1. Brief written", status.at, "")}
            {step(
              "2. Joint visit",
              status.jointVisitAt,
              "Both owners visit the venue",
            )}
            {step(
              "3. 30 days of back-up",
              status.shadowDaysLeft === 0 ? status.shadowUntil : null,
              `Until ${formatDate(status.shadowUntil)}`,
            )}
            {step(
              "4. Venue confirmed",
              status.confirmedAt,
              "Ask the venue after 30 days",
            )}
          </ol>
          {status.reminders.length > 0 ? (
            <ul className="space-y-1 rounded-sm border border-warn/40 bg-warn-soft p-2 text-ink">
              {status.reminders.map((reminder) => (
                <li key={reminder}>{reminder}</li>
              ))}
            </ul>
          ) : null}
          <label className="field-label">
            <span>What happened (optional)</span>
            <input
              className="input"
              value={stepText}
              onChange={(event) => setStepText(event.target.value)}
              placeholder="Met Sarah with Josh; she has Kayden's number."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {status.jointVisitAt == null ? (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy != null}
                onClick={() =>
                  logStep(
                    JOINT_VISIT_PREFIX,
                    `${status.from || "Old owner"} introduced ${status.to}`,
                  )
                }
              >
                {busy === JOINT_VISIT_PREFIX ? "Saving…" : "Joint visit done"}
              </button>
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy != null}
              onClick={() =>
                logStep(
                  CONFIRMED_PREFIX,
                  `The venue is comfortable with ${status.to}`,
                )
              }
            >
              {busy === CONFIRMED_PREFIX ? "Saving…" : "Venue is comfortable"}
            </button>
          </div>
        </div>
      ) : status?.done && status.confirmedAt != null ? (
        <p className="text-sm text-ink-3">
          Last hand-over: {status.from || "no owner"} to {status.to},{" "}
          {formatDate(status.at)}; the venue confirmed on{" "}
          {formatDate(status.confirmedAt)}.
        </p>
      ) : null}

      {open ? (
        <form
          className="space-y-3 rounded-sm border border-line p-3"
          onSubmit={handOver}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field-label">
              <span>New owner</span>
              <select className="input" name="toPersonId" required>
                <option value="">Pick a person</option>
                {staff
                  .filter(
                    (person) =>
                      String(person._id) !== String(venue.partnerOwnerPersonId),
                  )
                  .map((person) => (
                    <option key={person._id} value={person._id}>
                      {fullName(person)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              <span>Why</span>
              <select className="input" name="reason" defaultValue="">
                <option value="">No reason given</option>
                {HANDOFF_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm text-ink-3">
            The brief for the new owner. Booked events and recent problems are
            filled in; change anything, or leave a part blank.
          </p>
          {BRIEF_PARTS.map((part) => (
            <label key={part.key} className="field-label">
              <span>{part.label}</span>
              <textarea
                className="input min-h-[3rem] py-2"
                value={answers[part.key] ?? ""}
                placeholder={part.hint}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [part.key as BriefPartKey]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy != null}
            >
              {busy === "handoff" ? "Saving…" : "Save brief and hand over"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy != null}
          onClick={start}
        >
          {owner ? `Hand over from ${fullName(owner)}` : "Pick a new owner"}
        </button>
      )}
    </div>
  );
}
