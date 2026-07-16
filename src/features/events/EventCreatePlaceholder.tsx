import { Link } from "react-router-dom";
import { PageHeader } from "../../ui/primitives";

/** Create uses Event.planEngagement — full form lands after list/detail prove out. */
export function EventCreatePlaceholder() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="New event"
        lead="Create will call generated Event.planEngagement next."
      />
      <div className="card max-w-130 px-4 py-4">
        <p className="leading-relaxed text-ink-2">
          List and detail are wired to CapsuleX queries and stage mutations.
          The create form will collect planEngagement params without inventing
          schema fields.
        </p>
        <Link to="/events" className="btn btn-ghost btn-sm mt-4">
          Back to events
        </Link>
      </div>
    </div>
  );
}
