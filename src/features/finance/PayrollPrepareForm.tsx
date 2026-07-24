import type { FormEvent } from "react";

type PersonOption = {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
  status?: string | null;
  deletedAt?: number | null;
};

type EventOption = {
  _id: string;
  title?: string | null;
  deletedAt?: number | null;
};

const personLabel = (person: PersonOption) =>
  `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || "Person";

const minutes = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? Math.trunc(amount) : Number.NaN;
};

/** Builds a PayrollInput.prepare payload from the prepare form. */
export class PayrollPreparePayloadBuilder {
  fromForm(data: FormData) {
    const personId = String(data.get("personId") || "").trim();
    const periodStartRaw = String(data.get("periodStart") || "").trim();
    const periodEndRaw = String(data.get("periodEnd") || "").trim();
    const regularMinutes = minutes(data.get("regularMinutes"));
    const overtimeMinutes = minutes(data.get("overtimeMinutes"));
    const eventId = String(data.get("eventId") || "").trim();
    if (!personId || !periodStartRaw || !periodEndRaw) {
      throw new Error("Person and payroll period are required.");
    }
    if (
      [regularMinutes, overtimeMinutes].some((n) => Number.isNaN(n) || n < 0)
    ) {
      throw new Error("Regular and overtime minutes must be non-negative.");
    }
    const periodStart = new Date(periodStartRaw).getTime();
    const periodEnd = new Date(periodEndRaw).getTime();
    if (
      !Number.isFinite(periodStart) ||
      !Number.isFinite(periodEnd) ||
      periodEnd < periodStart
    ) {
      throw new Error("Period end must be on or after period start.");
    }
    // Rates/grossAmount are private encrypted money in source; Convex schema
    // still projects them as number while encryption stores ciphertext — omit
    // until Manifest projects encrypted money storage correctly.
    return {
      personId,
      periodStart,
      periodEnd,
      regularMinutes,
      overtimeMinutes,
      totalMinutes: regularMinutes + overtimeMinutes,
      eventId: eventId || undefined,
      notes: String(data.get("notes") || "").trim() || undefined,
    };
  }
}

export function PayrollPrepareForm({
  people,
  events,
  busy,
  onSubmit,
}: {
  people: PersonOption[];
  events: EventOption[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const activePeople = people.filter(
    (person) => person.deletedAt == null && String(person.status) === "active",
  );

  if (activePeople.length === 0) {
    return (
      <form className="supply-form" onSubmit={(e) => e.preventDefault()}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Prepare</p>
            <h2>Payroll input</h2>
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          No active people are available. Hire team members under Admin →
          Permissions first.
        </p>
      </form>
    );
  }

  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Prepare</p>
          <h2>Payroll input</h2>
        </div>
      </div>
      <label>
        Person
        <select name="personId" required defaultValue="">
          <option value="" disabled>
            Select person
          </option>
          {activePeople.map((person) => (
            <option key={person._id} value={person._id}>
              {personLabel(person)}
            </option>
          ))}
        </select>
      </label>
      <div className="supply-form-grid">
        <label>
          Period start
          <input name="periodStart" type="datetime-local" required />
        </label>
        <label>
          Period end
          <input name="periodEnd" type="datetime-local" required />
        </label>
      </div>
      <div className="supply-form-grid">
        <label>
          Regular minutes
          <input
            name="regularMinutes"
            type="number"
            min="0"
            required
            defaultValue="2400"
          />
        </label>
        <label>
          Overtime minutes
          <input
            name="overtimeMinutes"
            type="number"
            min="0"
            required
            defaultValue="0"
          />
        </label>
      </div>
      <label>
        Event (optional)
        <select name="eventId" defaultValue="">
          <option value="">No linked event</option>
          {events
            .filter((event) => event.deletedAt == null)
            .map((event) => (
              <option key={event._id} value={event._id}>
                {event.title || "Untitled event"}
              </option>
            ))}
        </select>
      </label>
      <p className="text-[12px] text-ink-3">
        Hourly/overtime rates and gross amount are deferred until encrypted
        money fields project to Convex storage correctly.
      </p>
      <label>
        Notes
        <textarea name="notes" rows={2} />
      </label>
      <div className="supply-row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Preparing…" : "Prepare payroll input"}
        </button>
      </div>
    </form>
  );
}
