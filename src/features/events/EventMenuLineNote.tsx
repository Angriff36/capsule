import { displayEventMenuNotes } from "./eventMenuLineFields";

/**
 * The per-dish kitchen note for ONE event menu line, shown right under the
 * dish it belongs to. This is the event-only instruction a line cook reads off
 * the printed menu ("sauce on the side", "blue rare for bride & groom") — it
 * never touches the shared catalog dish.
 */
export function EventMenuLineNote({
  specialInstructions,
  busy,
  onEdit,
}: {
  specialInstructions?: string | null;
  busy: boolean;
  onEdit: () => void;
}) {
  const note = displayEventMenuNotes(specialInstructions);
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {note ? (
        <p
          className="text-sm text-ink-2 whitespace-pre-line"
          data-testid="event-menu-line-note"
        >
          <span className="font-semibold text-ink">Kitchen note: </span>
          {note}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        data-testid="event-menu-line-note-edit"
        onClick={onEdit}
      >
        {note ? "Edit note" : "Add kitchen note"}
      </button>
    </div>
  );
}
