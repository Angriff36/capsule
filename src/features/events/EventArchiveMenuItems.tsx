import { Fragment } from "react";
import { useEventReactivate } from "../../lib/manifest-convex-react";
import { ActionMenuRule } from "../../ui/primitives";
import { EventArchiveVisibility } from "./eventArchiveVisibility";

/**
 * The More-menu half of archiving: "Archive event" (asks for a reason via the
 * page's existing reason dialog) while the event is live, "Bring back" once it
 * is archived. Archive is not a stage move, so this stays out of
 * EventLifecyclePolicy — it only hides or restores the event.
 */
export function EventArchiveMenuItems({
  event,
  busy,
  version,
  run,
  onArchive,
}: Readonly<{
  event: { readonly _id: string; readonly archivedAt?: number | null };
  busy: boolean;
  version?: number;
  run: (work: () => Promise<unknown>, okMessage?: string) => void;
  onArchive: () => void;
}>) {
  const reactivate = useEventReactivate();
  const archived = EventArchiveVisibility.isArchived(event);
  return (
    <Fragment>
      <ActionMenuRule />
      {archived ? (
        <button
          key="event-reactivate"
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () => reactivate({ docId: event._id, version }),
              "Event brought back",
            )
          }
          className="btn btn-ghost"
        >
          Bring back
        </button>
      ) : (
        <button
          key="event-archive"
          type="button"
          disabled={busy}
          onClick={onArchive}
          className="action-menu-danger"
        >
          Archive event
        </button>
      )}
    </Fragment>
  );
}
