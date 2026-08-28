import type { FormEvent } from "react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

type Props = {
  readonly busy: boolean;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onDismiss: () => void;
};

/** Manual "add a block" form for the run sheet. */
export function EventTimelineAddForm({ busy, onSubmit, onDismiss }: Props) {
  return (
    <form
      onSubmit={onSubmit}
      className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="event-timeline-add-form"
    >
      <label className="field-label">
        <span>Activity</span>
        <input
          name="name"
          className="input"
          placeholder="Vendor arrival, service, breakdown…"
          required
          autoFocus
        />
      </label>
      <label className="field-label">
        <span>Starts</span>
        <BoundedDateTimeLocalInput name="startsAt" className="input" required />
      </label>
      <label className="field-label">
        <span>Ends (optional)</span>
        <BoundedDateTimeLocalInput name="endsAt" className="input" />
      </label>
      <label className="field-label sm:col-span-2 lg:col-span-3">
        <span>Notes</span>
        <input name="notes" className="input" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add activity"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </form>
  );
}
