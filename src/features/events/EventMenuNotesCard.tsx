export type EventMenuNoteRow = {
  lineId: string;
  dishName: string;
  note: string;
};

/**
 * Per-line menu notes, read from each EventDish's instructions packet.
 * Editing reuses the line's own update command, so sell/pans stay intact.
 */
export function EventMenuNotesCard({
  notes,
  busy,
  onEditNote,
}: {
  notes: EventMenuNoteRow[];
  busy: boolean;
  onEditNote: (row: EventMenuNoteRow) => void;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink">Menu notes</p>
      {notes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">
          No menu notes on these dishes yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {notes.map((row) => (
            <div key={row.lineId}>
              <p className="text-sm text-ink-2">
                <span className="font-medium text-ink">{row.dishName} — </span>
                <span className="italic">“{row.note}”</span>
              </p>
              <button
                type="button"
                className="btn-link mt-0.5"
                disabled={busy}
                onClick={() => onEditNote(row)}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
