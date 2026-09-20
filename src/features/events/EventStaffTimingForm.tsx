import { useState } from "react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { localDateTime } from "./eventDetailFormHelpers";

export type StaffTimingPlan = {
  readonly startsAt?: number;
  readonly endsAt?: number;
  readonly followsEventTiming: boolean;
};

/**
 * In and out times for one assigned person or one open position. Crew that
 * follows the event keeps no personal window, so ticking the box clears the
 * two times; untick it to type a window of their own. Times are local and
 * are sent as epoch milliseconds.
 */
export function EventStaffTimingControl({
  label,
  startsAt,
  endsAt,
  followsEventTiming,
  busy,
  onSave,
}: {
  label: string;
  startsAt?: number | null;
  endsAt?: number | null;
  followsEventTiming?: boolean | null;
  busy: boolean;
  onSave: (plan: StaffTimingPlan) => void;
}) {
  const [open, setOpen] = useState(false);
  const [follows, setFollows] = useState(followsEventTiming === true);
  const [start, setStart] = useState(localDateTime(startsAt));
  const [end, setEnd] = useState(localDateTime(endsAt));

  const reopen = () => {
    setFollows(followsEventTiming === true);
    setStart(localDateTime(startsAt));
    setEnd(localDateTime(endsAt));
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm max-md:min-h-10"
        disabled={busy}
        aria-label={`Edit times for ${label}`}
        onClick={reopen}
      >
        Edit times
      </button>
    );
  }

  return (
    <form
      className="mt-2 grid gap-2 rounded-sm border border-line p-3 text-left"
      data-testid="event-staff-timing-form"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        onSave({
          followsEventTiming: follows,
          startsAt:
            follows || start === "" ? undefined : new Date(start).getTime(),
          endsAt: follows || end === "" ? undefined : new Date(end).getTime(),
        });
        setOpen(false);
      }}
    >
      <p className="text-sm font-semibold text-ink">Times for {label}</p>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={follows}
          disabled={busy}
          onChange={(changeEvent) => setFollows(changeEvent.target.checked)}
        />
        <span>Follows the event timing</span>
      </label>
      <label className="field-label">
        <span>In</span>
        <BoundedDateTimeLocalInput
          className="field-input"
          value={start}
          disabled={busy || follows}
          onChange={(changeEvent) => setStart(changeEvent.target.value)}
        />
      </label>
      <label className="field-label">
        <span>Out</span>
        <BoundedDateTimeLocalInput
          className="field-input"
          value={end}
          disabled={busy || follows}
          onChange={(changeEvent) => setEnd(changeEvent.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn btn-secondary btn-sm"
          disabled={busy}
        >
          Save times
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
