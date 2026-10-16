/** What the buttons on the matching list do. */
export function ImportMatchHelp() {
  return (
    <div className="card mt-4">
      <div className="border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
          How matching works
        </h2>
      </div>
      <div className="p-4">
        <h3 className="font-medium text-xs mb-2">Actions</h3>
        <ul className="text-xs text-ink-2 space-y-1">
          <li>
            • <strong>Match</strong>: Link an imported payment to an existing
            Capsule payment, then mark it resolved. A payment with the same id
            is safe to match; a payment that only has the same amount is a
            guess, so check it first. One payment is matched only once.
          </li>
          <li>
            • <strong>Verify</strong>: Confirm a match is correct; the item is
            marked done and leaves this list.
          </li>
          <li>
            • <strong>Same name or email</strong>: An imported client or venue
            that looks like one you already have is added on its own and waits
            here. Verify it if it is a different one. If it is the same, merge
            the two on the Clients page; the old names and old-system links stay
            on the client you keep.
          </li>
          <li>
            • <strong>Pick existing</strong>: Point the old row at a record you
            already have. <strong>Add as new</strong> makes a new one of the
            right kind from the old row. Later imports of the same row use your
            choice.
          </li>
          <li>
            • <strong>Skip</strong>: Mark as resolved with a note. Later imports
            leave a skipped row out.
          </li>
        </ul>
        <h3 className="font-medium text-xs mb-2 mt-4">Status Guide</h3>
        <ul className="text-xs text-ink-2 space-y-1">
          <li>
            • Items marked <strong>Conflict</strong> need to be sorted out
            before they leave this list.
          </li>
          <li>
            • Filter by old system to focus on specific imports (TPP,
            QuickBooks, etc.).
          </li>
          <li>
            • Select multiple items to Verify or Skip them together; you see
            every item it changes before it runs.
          </li>
        </ul>
      </div>
    </div>
  );
}
