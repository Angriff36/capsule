import { useNavigate } from "react-router-dom";
import { type Id } from "../../lib/api";
import { useEventDuplicate } from "../../lib/useEventDuplicate";
import { eventDetailPath } from "./eventRoutes";

/**
 * The More-menu "Duplicate event" action: books a fresh planning copy of this
 * event (planning facts + menu) and opens it. The source event is untouched.
 */
export function EventDuplicateMenuItem({
  event,
  busy,
  run,
}: Readonly<{
  event: { readonly _id: string; readonly title?: string | null };
  busy: boolean;
  run: (work: () => Promise<unknown>, okMessage?: string) => void;
}>) {
  const duplicate = useEventDuplicate();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="event-duplicate"
      className="btn btn-ghost"
      onClick={() =>
        run(async () => {
          const result = await duplicate({
            sourceEventId: event._id as Id<"events">,
          });
          navigate(eventDetailPath(String(result.docId)));
        }, "Event duplicated")
      }
    >
      Duplicate event
    </button>
  );
}
