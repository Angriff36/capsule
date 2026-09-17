import { Link } from "react-router-dom";
import { useEventPrepWorkReview } from "../../lib/safeCulinaryOperations";

/** Reactive review from the same planner that reconciles remaining prep work. */
export function EventPrepWorkNotice({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle?: string;
}) {
  const review = useEventPrepWorkReview(eventId);
  if (!review?.length) return null;
  return (
    <section className="space-y-2 border-y border-line py-3" role="status">
      <h2 className="text-base font-semibold text-warning">
        {eventTitle
          ? `${eventTitle}: prep needs attention`
          : "Prep needs attention"}
      </h2>
      <p className="text-sm text-ink-2">
        These steps were left unchanged. Other prep steps can still be used.
      </p>
      <ul className="space-y-2">
        {review.flatMap((line) =>
          line.steps.map((step) => (
            <li
              key={`${line.eventDishId}:${step.dishTaskId}`}
              className="text-base text-ink-2"
            >
              <Link className="text-link" to={`/kitchen/dishes/${line.dishId}`}>
                {line.dishName}
              </Link>
              {` — ${step.name}: ${step.reason}`}
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
