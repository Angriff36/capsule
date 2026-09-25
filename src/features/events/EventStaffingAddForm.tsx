import { type FormEvent } from "react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { StaffRoleSelect, readStaffRole } from "./EventStaffingRoleSelect";
import {
  EventTimelineStaffRoster,
  type PersonRow,
} from "./eventTimelineStaffRoster";

/** The "who" picker's value for a shift that has no name yet. */
export const OPEN_SHIFT_PERSON = "__open__";

export type StaffingAddSubmission =
  | {
      kind: "assign";
      personId: string;
      role: string;
      startsAt?: number;
      endsAt?: number;
      notes?: string;
    }
  | {
      kind: "open";
      role: string;
      startsAt?: number;
      endsAt?: number;
      description?: string;
    };

function readWhen(data: FormData, name: string): number | undefined {
  const raw = String(data.get(name) ?? "").trim();
  if (!raw) return undefined;
  const millis = new Date(raw).getTime();
  return Number.isFinite(millis) ? millis : undefined;
}

/** Turn the submitted form into an assignment or an open shift. */
export function readStaffingAddForm(
  data: FormData,
): StaffingAddSubmission | { error: string } | null {
  const role = readStaffRole(data, "role");
  if (!role) return null;
  const who = String(data.get("personId") ?? "");
  if (!who) return null;
  const startsAt = readWhen(data, "startsAt");
  const endsAt = readWhen(data, "endsAt");
  if (startsAt != null && endsAt != null && endsAt <= startsAt) {
    return { error: "Out time must be after the in time." };
  }
  const note = String(data.get("notes") ?? "").trim() || undefined;
  if (who === OPEN_SHIFT_PERSON) {
    return { kind: "open", role, startsAt, endsAt, description: note };
  }
  return { kind: "assign", personId: who, role, startsAt, endsAt, notes: note };
}

/**
 * One form adds a role to the event either with a named person or as an open
 * shift to fill later (#368 item 17 — TPP tracks "FOH Captain 2:00–10:00,
 * *Unassigned*" during planning; forcing a name meant fabricating one). In/out
 * times are optional: leave them blank and the role follows the crew window
 * from the Timeline.
 */
export function EventStaffingAddForm({
  people,
  roles,
  busy,
  personConflictLabel,
  onSubmit,
}: {
  people: readonly PersonRow[];
  roles: readonly string[];
  busy: boolean;
  personConflictLabel: (personId: string) => string;
  onSubmit: (submission: StaffingAddSubmission, form: HTMLFormElement) => void;
}) {
  return (
    <form
      className="card grid gap-2 px-4 py-3 sm:grid-cols-6"
      data-testid="event-staffing-add-form"
      onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
        formEvent.preventDefault();
        const form = formEvent.currentTarget;
        const submission = readStaffingAddForm(new FormData(form));
        if (!submission) return;
        if ("error" in submission) {
          const out = form.elements.namedItem("endsAt");
          if (out instanceof HTMLInputElement) {
            out.setCustomValidity(submission.error);
            out.reportValidity();
            out.setCustomValidity("");
          }
          return;
        }
        onSubmit(submission, form);
      }}
    >
      <label className="field-label sm:col-span-2">
        Role
        <StaffRoleSelect name="role" roles={roles} />
      </label>
      <label className="field-label sm:col-span-2">
        Who
        <select
          name="personId"
          className="field-input"
          required
          defaultValue=""
          data-testid="event-staffing-who"
        >
          <option value="">Select…</option>
          <option value={OPEN_SHIFT_PERSON}>
            Leave open — assign someone later
          </option>
          {people.map((person) => (
            <option key={person._id} value={person._id}>
              {EventTimelineStaffRoster.labelFor(person)}
              {personConflictLabel(person._id)}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        In
        <BoundedDateTimeLocalInput name="startsAt" className="field-input" />
      </label>
      <label className="field-label">
        Out
        <BoundedDateTimeLocalInput name="endsAt" className="field-input" />
      </label>
      <label className="field-label sm:col-span-5">
        Note
        <input
          name="notes"
          className="field-input"
          placeholder="Optional — e.g. arrives with the grill trailer"
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary self-end whitespace-nowrap"
        disabled={busy}
        data-testid="event-staffing-add"
      >
        Add to staff
      </button>
      <p className="text-xs text-ink-3 sm:col-span-6">
        Leave In/Out blank to follow the crew window from the Timeline. Open
        shifts appear under “Open / claimable shifts” until someone is assigned.
      </p>
    </form>
  );
}
