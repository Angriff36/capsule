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
}

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
      <p className="component-import-source-note">
        Corrections never change this text.
      </p>
    </section>
  );
}
