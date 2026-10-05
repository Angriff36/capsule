/**
 * PL-SOURCE-RESOLUTION (AC-059): before a group Verify or Skip runs, show
 * every item it will change and what happens to each.
 */
export type BulkAction = "verify" | "skip";

export type BulkPreviewItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  recordLabel: string | null;
};

const EFFECT: Record<BulkAction, (item: BulkPreviewItem) => string> = {
  verify: (item) =>
    item.recordLabel
      ? `Checked; stays matched to ${item.recordLabel}`
      : "Checked; nothing in Capsule is matched",
  skip: () => "Skipped; later imports leave this row out",
};

export function BulkActionPreview({
  action,
  items,
  busy,
  onApply,
  onCancel,
}: Readonly<{
  action: BulkAction;
  items: BulkPreviewItem[];
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}>) {
  const verb = action === "verify" ? "Verify" : "Skip";
  return (
    <section
      className="border-b border-line bg-inset p-4"
      aria-label={`${verb} preview`}
    >
      <h2 className="text-xs font-semibold">
        {verb} {items.length} item{items.length === 1 ? "" : "s"}?
      </h2>
      <ul className="mt-2 max-h-64 overflow-y-auto text-xs">
        {items.map((item) => (
          <li key={item.id} className="border-b border-line py-1">
            <span className="font-medium">
              {item.sourceName || item.sourceId}
            </span>{" "}
            <span className="text-ink-2">— {EFFECT[action](item)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onApply}
        >
          {verb} {items.length}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    </section>
  );
}
