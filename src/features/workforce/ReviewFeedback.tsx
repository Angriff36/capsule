import { formatDate } from "../../lib/format";

// The parts of a performance review written FOR the person reviewed (spec
// §9.4). Shown on the manager ledger and on My reviews; the manager-private
// `notes` are never passed in here.
export type ReviewFeedbackFields = {
  scorecardTitle?: string | null;
  strengths?: string | null;
  opportunities?: string | null;
  comments?: string | null;
  followUp?: string | null;
  followUpDue?: number | null;
};

export function ReviewFeedback({ review }: { review: ReviewFeedbackFields }) {
  const parts = [
    ["Scorecard", review.scorecardTitle],
    ["Strengths", review.strengths],
    ["To work on", review.opportunities],
    ["Comments", review.comments],
    [
      "Follow-up",
      review.followUp
        ? review.followUpDue
          ? `${review.followUp} (by ${formatDate(review.followUpDue)})`
          : review.followUp
        : null,
    ],
  ].filter((part): part is [string, string] => Boolean(part[1]));
  if (parts.length === 0) return <span className="text-ink-2">—</span>;
  return (
    <dl className="grid gap-1">
      {parts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-ink-2">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
