import type { TemplatePreviewRow } from "../../lib/packTemplateLines";

const STATE_WORDS: Record<TemplatePreviewRow["state"], string> = {
  add: "New line",
  update: "Amount changes",
  keptEdit: "Your change stays",
  same: "Already on the list",
};

/** What applying a template will do, shown before anything is written
 * (AC-132). */
export function PackTemplatePreview({
  templateName,
  rows,
  busy,
  onApply,
  onCancel,
}: {
  templateName: string;
  rows: TemplatePreviewRow[];
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const changes = rows.filter(
    (row) => row.state === "add" || row.state === "update",
  ).length;
  return (
    <div className="mt-2 rounded-sm border border-line-2 p-2">
      <p className="font-medium text-ink">Before you apply "{templateName}"</p>
      <ul className="mt-1 grid gap-1 text-base text-ink-2">
        {rows.map((row) => (
          <li key={row.key}>
            <strong>{row.description}</strong> · {STATE_WORDS[row.state]}
            {row.state === "add"
              ? `: ${row.templateQuantity} ${row.unit}`
              : null}
            {row.state === "update"
              ? `: ${row.listQuantity} to ${row.templateQuantity} ${row.unit}`
              : null}
            {row.state === "keptEdit"
              ? `: list has ${row.listQuantity}, template says ${row.templateQuantity} ${row.unit}`
              : null}
            {row.templateChanged
              ? " · The template changed since it was applied"
              : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || changes === 0}
          onClick={onApply}
        >
          {busy
            ? "Applying…"
            : changes === 0
              ? "Nothing to change"
              : `Apply ${changes} ${changes === 1 ? "change" : "changes"}`}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
