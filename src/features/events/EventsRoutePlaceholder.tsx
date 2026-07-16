import { Link } from "react-router-dom";
import { PageHeader } from "../../ui/primitives";

/** Events list/detail are the next product flow after shell + auth. */
export function EventsRoutePlaceholder() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        lead="Shell route is live — list and detail screens are the next flow."
      />
      <div className="card max-w-130 px-4 py-4">
        <p className="leading-relaxed text-ink-2">
          CapsuleX generated queries and mutations for Event are already in
          place. The UI list and detail screens connect to those hooks in the
          next product flow.
        </p>
        <Link to="/" className="btn btn-ghost btn-sm mt-4">
          Back to home
        </Link>
      </div>
    </div>
  );
}
