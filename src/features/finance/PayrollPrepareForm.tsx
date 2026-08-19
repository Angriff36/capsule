import { useState, type FormEvent } from "react";
import { usePersonPeriodLaborSummary } from "../facilities/useLaborSummary";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

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
    // until Manifest projects encrypted money storage correctly (issue #76).
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
  const [personId, setPersonId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [overtime, setOvertime] = useState(0);
  // Manual edit wins over the clocked prefill until person/period changes.
  const [regularOverride, setRegularOverride] = useState<string | null>(null);

  const startAt = periodStart ? new Date(periodStart).getTime() : Number.NaN;
  const endAt = periodEnd ? new Date(periodEnd).getTime() : Number.NaN;
  const windowReady =
    personId !== "" &&
    Number.isFinite(startAt) &&
    Number.isFinite(endAt) &&
    endAt >= startAt;
  const clocked = usePersonPeriodLaborSummary(
    windowReady ? { personId, periodStart: startAt, periodEnd: endAt } : null,
  );

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
        <p className="text-base text-ink-2">
          No active people are available. Hire team members under Admin →
          Permissions first.
        </p>
      </form>
    );
  }

  // Clocked minutes are the TOTAL; overtime is carved out of them, never
  // added on top (a 45h week is 45h split regular/OT, not 45h + OT).
  const clockedTotal = clocked?.totalMinutes ?? 0;
  const regularDefault = Math.max(0, clockedTotal - overtime);
  const rate = clocked?.hourlyRate ?? null;

  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Prepare</p>
          <h2>Payroll input</h2>
        </div>
      </div>
      <label className="field-label">
        Person
        <select
          className="input"
          name="personId"
          required
          value={personId}
          onChange={(event) => {
            setPersonId(event.target.value);
            setRegularOverride(null);
          }}
        >
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
        <label className="field-label">
          Period start
          <BoundedDateTimeLocalInput
            className="input"
            name="periodStart"
            required
            value={periodStart}
            onChange={(event) => {
              setPeriodStart(event.target.value);
              setRegularOverride(null);
            }}
          />
        </label>
        <label className="field-label">
          Period end
          <BoundedDateTimeLocalInput
            className="input"
            name="periodEnd"
            required
            value={periodEnd}
            onChange={(event) => {
              setPeriodEnd(event.target.value);
              setRegularOverride(null);
            }}
          />
        </label>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Regular minutes
          <input
            className="input"
            name="regularMinutes"
            type="number"
            min="0"
            required
            value={regularOverride ?? String(regularDefault)}
            onChange={(event) => setRegularOverride(event.target.value)}
          />
          {clocked ? (
            <span className="text-xs text-ink-3">
              {clocked.recordCount === 0
                ? "No closed time records in this period — enter minutes manually."
                : `${clocked.recordCount} closed time record${clocked.recordCount === 1 ? "" : "s"} · ${(clockedTotal / 60).toFixed(1)} h clocked total`}
            </span>
          ) : (
            <span className="text-xs text-ink-3">
              Pick a person and period to pull clocked minutes automatically.
            </span>
          )}
        </label>
        <label className="field-label">
          Overtime minutes
          <input
            className="input"
            name="overtimeMinutes"
            type="number"
            min="0"
            required
            value={String(overtime)}
            onChange={(event) =>
              setOvertime(
                Math.max(0, Math.trunc(Number(event.target.value) || 0)),
              )
            }
          />
          <span className="text-xs text-ink-3">
            Overtime moves minutes out of regular — the clocked total stays the
            same.
          </span>
        </label>
      </div>
      {clocked && clocked.overlappingInputCount > 0 ? (
        <p className="text-sm text-warn" role="status">
          {clocked.overlappingInputCount} existing payroll input
          {clocked.overlappingInputCount === 1 ? "" : "s"} already overlap
          {clocked.overlappingInputCount === 1 ? "s" : ""} this person and
          period — finalizing both would double-count hours in the export.
        </p>
      ) : null}
      <label className="field-label">
        Event (optional)
        <select className="input" name="eventId" defaultValue="">
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
      {personId && clocked !== undefined ? (
        rate != null ? (
          clockedTotal > 0 ? (
            <p className="text-sm text-ink-3">
              Estimated base pay at ${rate.toFixed(2)}/h: $
              {((clockedTotal / 60) * rate).toFixed(2)} (overtime premium not
              included). The export CSV carries hours; your processor applies
              final rates.
            </p>
          ) : (
            <p className="text-sm text-ink-3">
              Rate on file: ${rate.toFixed(2)}/h. The export CSV carries hours;
              your processor applies final rates.
            </p>
          )
        ) : clocked === null ? null : (
          <p className="text-sm text-warn">
            No hourly rate set for this person — set one under Admin →
            Permissions so labor costs and estimates use real numbers.
          </p>
        )
      ) : null}
      <label className="field-label">
        Notes
        <textarea className="input" name="notes" rows={2} />
      </label>
      <div className="supply-row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Preparing…" : "Prepare payroll input"}
        </button>
      </div>
    </form>
  );
}
