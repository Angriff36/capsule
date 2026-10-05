import type { FormEvent } from "react";
import type { CloseoutSources } from "../facilities/useCloseoutSources";
import { CloseoutSourcesPanel } from "./CloseoutSourcesPanel";
import { FieldHelp } from "../../ui/FieldHelp";

type EventOption = {
  _id: string;
  title?: string | null;
};

/** Existing draft closeout being re-captured (reconciled) instead of created. */
export type CloseoutDraft = {
  _id: string;
  eventId: string;
};

/**
 * PL-CLOSEOUT (AC-625): the numbers come from the event's records
 * (convex/closeoutSources.ts). A person only fills the lines the records
 * cannot answer, plus the notes.
 */
export function CloseoutCaptureForm({
  events,
  selectedEventId,
  onSelectEvent,
  sources,
  draft,
  busy,
  onSubmit,
}: {
  events: EventOption[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  sources: CloseoutSources | null | undefined;
  /** When set, the form reconciles this existing draft closeout. */
  draft: CloseoutDraft | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (events.length === 0) {
    return (
      <form className="supply-form" onSubmit={(e) => e.preventDefault()}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Capture</p>
            <h2 className="field-label-row">
              Event closeout
              <FieldHelp term="closeout" />
            </h2>
          </div>
        </div>
        <p className="text-base text-ink-2">
          No closed-out events are waiting for capture. Complete and close out
          an event from Events first.
        </p>
      </form>
    );
  }

  const defaults = events[0]!;
  const eventId = selectedEventId ?? String(draft?.eventId ?? defaults._id);

  return (
    <form
      className="supply-form"
      onSubmit={onSubmit}
      key={`${draft?._id ?? "new"}:${eventId}`}
    >
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">{draft ? "Reconcile" : "Capture"}</p>
          <h2 className="field-label-row">
            Event closeout
            <FieldHelp term="closeout" />
          </h2>
        </div>
      </div>
      <label className="field-label">
        Closed-out event
        <select
          className="input"
          name="eventId"
          required
          value={eventId}
          disabled={draft != null}
          onChange={(event) => onSelectEvent(event.target.value)}
        >
          {events.map((event) => (
            <option key={event._id} value={event._id}>
              {event.title || "Untitled event"}
            </option>
          ))}
        </select>
        {draft ? <input type="hidden" name="eventId" value={eventId} /> : null}
      </label>
      <CloseoutSourcesPanel sources={sources} />
      <label className="field-label">
        Unresolved issues
        <textarea className="input" name="unresolvedIssues" rows={2} />
      </label>
      <label className="field-label">
        Performance notes
        <textarea className="input" name="performanceNotes" rows={2} />
      </label>
      <label className="field-label">
        Notes
        <textarea className="input" name="notes" rows={2} />
      </label>
      <div className="supply-row-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || sources == null}
        >
          {busy
            ? "Saving…"
            : draft
              ? "Save reconciled closeout"
              : "Capture closeout"}
        </button>
      </div>
    </form>
  );
}
