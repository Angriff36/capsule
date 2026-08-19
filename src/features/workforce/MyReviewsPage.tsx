import { Link } from "react-router-dom";
import { useMyReviews } from "../../lib/staffSelfReviews";
import { TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate } from "../../lib/format";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

// Staff self-service view of their OWN recorded reviews (spec §9.4). Read-only
// projection from the authored `staffSelfReviews.listMyReviews` seam — only the
// ratings/date/reviewer/event the reviewed staff member is meant to see; the
// manager-private `notes` never reach this view.
export function MyReviewsPage() {
  const reviews = useMyReviews();

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · My reviews</p>
          <h1 className="display-title mt-2">Your performance feedback.</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            The recorded reviews of your work — reliability, quality, and
            teamwork — as context for your growth. Your manager may keep written
            notes private to management.
          </p>
        </div>
      </header>

      <WorkforceWorkspaceNav />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Your reviews</p>
            <h2>Recorded feedback</h2>
          </div>
          <span>{formatCountNoun(reviews?.length ?? 0, "record")}</span>
        </div>
        {reviews === undefined ? (
          <TableSkeleton rows={4} />
        ) : reviews.length === 0 ? (
          <div className="document-empty">
            <p>No reviews recorded yet.</p>
            <span>Your manager records feedback after your shifts.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Reviewer</th>
                  <th>Reliability</th>
                  <th>Quality</th>
                  <th>Teamwork</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((row) => (
                  <tr key={row.id}>
                    <td>{row.reviewDate ? formatDate(row.reviewDate) : "—"}</td>
                    <td>
                      {row.eventId && row.eventTitle ? (
                        <Link
                          to={`/events/${row.eventId}`}
                          className="link-color"
                        >
                          {row.eventTitle}
                        </Link>
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>
                    <td>{row.reviewerName}</td>
                    <td>{row.reliabilityRating}</td>
                    <td>{row.qualityRating}</td>
                    <td>{row.teamworkRating}</td>
                    <td>
                      {(
                        (row.reliabilityRating +
                          row.qualityRating +
                          row.teamworkRating) /
                        3
                      ).toFixed(1)}
                    </td>
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
