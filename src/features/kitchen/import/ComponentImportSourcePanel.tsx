import type { ComponentImportSourceKind } from "./ComponentImportTypes";

const SOURCE_KIND_LABELS: Record<ComponentImportSourceKind, string> = {
  pasted_text: "Pasted text",
  text_file: "Text file",
  csv_bundle: "CSV pair",
};

/** Durable ComponentImport statuses as operator-facing labels. */
export const IMPORT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  parsed: "Parsed",
  reviewing: "In review",
  ready: "Ready to finalize",
  finalizing: "Finalizing",
  completed: "Completed",
  failed: "Needs recovery",
  cancelled: "Cancelled",
};

export interface ComponentImportSourcePanelProps {
  kind: ComponentImportSourceKind;
  filename?: string;
  /** Original source text exactly as imported; never rewritten by corrections. */
  rawText: string;
  csvSheetText?: string;
  csvLinesText?: string;
  importId?: string;
  status?: string;
  /** What finalize did when the formula matched a recipe already in the book. */
  duplicateOutcome?: string;
}

/** Plain sentences for a finished duplicate match (AC-067). */
export const DUPLICATE_OUTCOME_NOTES: Record<string, string> = {
  identical_source:
    "This recipe was already in the book — nothing new was made.",
  scaled_copy:
    "This formula was already in the book at another batch size — the recipe already there keeps its own amounts.",
  same_formula_other_name:
    "The same formula was finished under a new name. The book now holds both.",
  same_name_other_formula:
    "A recipe with this name already had a different formula. Both are in the book — compare them and keep the right one.",
};

/**
 * Read-only provenance panel: the original source text beside the corrected
 * review, so "what did the source actually say" never depends on the edit.
 * Source renders as text only — never HTML.
 */
export function ComponentImportSourcePanel({
  kind,
  filename,
  rawText,
  csvSheetText,
  csvLinesText,
  importId,
  status,
  duplicateOutcome,
}: ComponentImportSourcePanelProps) {
  return (
    <section className="component-import-pane" aria-label="Original source">
      <div className="component-import-pane-head">
        <h2>Original source</h2>
        {status ? (
          <span className="component-import-badge">
            {IMPORT_STATUS_LABELS[status] ?? status}
          </span>
        ) : null}
      </div>
      <p className="font-mono text-xs text-ink-3">
        {SOURCE_KIND_LABELS[kind]}
        {filename ? ` · ${filename}` : ""}
        {importId ? ` · import ${importId}` : ""}
      </p>
      <pre className="component-import-source component-import-source-readonly">
        {rawText}
      </pre>
      {csvSheetText ? (
        <div className="component-import-review">
          <p className="field-label">Sheet CSV (stored separately)</p>
          <pre
            className="component-import-source component-import-source-readonly"
            aria-label="Original sheet CSV"
          >
            {csvSheetText}
          </pre>
        </div>
      ) : null}
      {csvLinesText ? (
        <div className="component-import-review">
          <p className="field-label">Lines CSV (stored separately)</p>
          <pre
            className="component-import-source component-import-source-readonly"
            aria-label="Original lines CSV"
          >
            {csvLinesText}
          </pre>
        </div>
      ) : null}
      {duplicateOutcome ? (
        <p className="component-import-source-note" role="note">
          {DUPLICATE_OUTCOME_NOTES[duplicateOutcome] ?? duplicateOutcome}
        </p>
      ) : null}
      <p className="component-import-source-note">
        Corrections never change this text.
      </p>
    </section>
  );
}
