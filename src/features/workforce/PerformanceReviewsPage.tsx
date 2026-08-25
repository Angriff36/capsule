import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePerformanceReview,
  useListPerformanceReview,
  useListPerson,
  useListEvent,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const DIMENSIONS = [
  { key: "reliabilityRating", label: "Reliability" },
  { key: "qualityRating", label: "Quality" },
  { key: "teamworkRating", label: "Teamwork" },
] as const;

function localDateEpoch(value: FormDataEntryValue | null) {
  return new Date(`${String(value)}T12:00:00`).getTime();
}

export function PerformanceReviewsPage() {
  const reviews = useListPerformanceReview();
  const people = useListPerson();
  const events = useListEvent();
  const createReview = useCreatePerformanceReview();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const activePeople = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const recordedReviews = (reviews ?? []).filter(
    (row) => row.deletedAt == null && row.recordedAt != null,
  );

  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };

  const eventName = (id: string | null | undefined) => {
    if (!id) return null;
    const event = events?.find((row) => row._id === id);
    return event ? event.title : "Unknown";
  };

  const average = (row: (typeof recordedReviews)[number]) =>
    (row.reliabilityRating + row.qualityRating + row.teamworkRating) / 3;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        await createReview({
          personId: String(data.get("personId")),
          reviewerId: String(data.get("reviewerId")),
          eventId: (data.get("eventId") as string | null) || undefined,
          reviewDate: localDateEpoch(data.get("reviewDate")),
          reliabilityRating: Number(data.get("reliabilityRating")),
          qualityRating: Number(data.get("qualityRating")),
          teamworkRating: Number(data.get("teamworkRating")),
          notes: String(data.get("notes") || "") || undefined,
        });
        form.reset();
        setOpen(false);
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const loading = reviews === undefined || people === undefined;

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · Performance</p>
          <h1 className="display-title mt-2">Reviews that guide the roster.</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Record structured reviews for each person — reliability, quality,
            and teamwork — as context for shift assignment and compensation.
            Visible to managers only.
          </p>
        </div>
        <div aria-label="Performance actions">
          <button className="btn btn-primary" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Record review"}
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {open ? (
        <form className="supply-form" onSubmit={submit}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Performance review</p>
              <h2>Record a review</h2>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Recording…" : "Record review"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Person reviewed
              <select name="personId" className="input" required>
                <option value="">Select person</option>
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Reviewer
              <select name="reviewerId" className="input" required>
                <option value="">Select reviewer</option>
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Event (optional)
              <select name="eventId" className="input">
                <option value="">No specific event</option>
                {events?.map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title} — {formatDate(event.startsAt ?? 0)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Review date
              <BoundedDateInput name="reviewDate" className="input" required />
            </label>
            {DIMENSIONS.map((dimension) => (
              <label key={dimension.key} className="field-label">
                {dimension.label} (1–5)
                <input
                  name={dimension.key}
                  className="input"
                  type="number"
                  min="1"
                  max="5"
                  defaultValue="3"
                  required
                />
              </label>
            ))}
            <label className="field-label">
              Notes
              <input
                name="notes"
                className="input"
                placeholder="Optional review notes"
              />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Review ledger</p>
            <h2>Recorded reviews</h2>
          </div>
          <span>{formatCountNoun(recordedReviews.length, "record")}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : recordedReviews.length === 0 ? (
          <div className="document-empty">
            <p>No performance reviews recorded.</p>
            <span>
              Record a review to build shift and compensation context.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Reviewer</th>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Reliability</th>
                  <th>Quality</th>
                  <th>Teamwork</th>
                  <th>Average</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...recordedReviews]
                  .sort((a, b) => (b.reviewDate ?? 0) - (a.reviewDate ?? 0))
                  .map((row) => (
                    <tr key={row._id}>
                      <td>
                        <strong>{personName(row.personId)}</strong>
                      </td>
                      <td>{personName(row.reviewerId)}</td>
                      <td>
                        {row.eventId ? (
                          <Link
                            to={`/events/${row.eventId}`}
                            className="link-color"
                          >
                            {eventName(row.eventId)}
                          </Link>
                        ) : (
                          <span className="text-ink-2">—</span>
                        )}
                      </td>
                      <td>
                        {row.reviewDate ? formatDate(row.reviewDate) : "—"}
                      </td>
                      <td>{row.reliabilityRating}</td>
                      <td>{row.qualityRating}</td>
                      <td>{row.teamworkRating}</td>
                      <td>{average(row).toFixed(1)}</td>
                      <td>{row.notes || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
