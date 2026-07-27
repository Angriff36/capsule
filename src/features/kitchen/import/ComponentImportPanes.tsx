import type { ImportSourceMode } from "./ImportSourceReadiness";
import type { ComponentImportReviewState } from "./ComponentImportTypes";

export interface ComponentImportSourcePaneProps {
  mode: ImportSourceMode;
  source: string;
  sheetCsv: string;
  linesCsv: string;
  sheetFilename?: string;
  linesFilename?: string;
  textFilename?: string;
  parsing: boolean;
  fileLoading: boolean;
  canParse: boolean;
  sourceHint?: string | null;
  fileStatus?: string | null;
  onModeChange: (mode: ImportSourceMode) => void;
  onSourceChange: (value: string) => void;
  onSheetChange: (value: string, filename?: string) => void;
  onLinesChange: (value: string, filename?: string) => void;
  onTextFileChange: (value: string, filename: string) => void;
  onLoadFile: (
    file: File,
    apply: (text: string, filename: string) => void,
  ) => void;
  onParse: () => void;
}

export function ComponentImportSourcePane({
  mode,
  source,
  sheetCsv,
  linesCsv,
  sheetFilename,
  linesFilename,
  textFilename,
  parsing,
  fileLoading,
  canParse,
  sourceHint,
  fileStatus,
  onModeChange,
  onSourceChange,
  onSheetChange,
  onLinesChange,
  onTextFileChange,
  onLoadFile,
  onParse,
}: ComponentImportSourcePaneProps) {
  return (
    <section className="component-import-pane" aria-label="Source input">
      <div className="component-import-pane-head">
        <h2>Your inputs</h2>
        <div
          className="component-import-mode-switch"
          role="tablist"
          aria-label="Source mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            className={mode === "paste" ? "is-active" : undefined}
            onClick={() => onModeChange("paste")}
          >
            Paste
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "files"}
            className={mode === "files" ? "is-active" : undefined}
            onClick={() => onModeChange("files")}
          >
            Files
          </button>
        </div>
      </div>

      {mode === "paste" ? (
        <>
          <label className="field-label" htmlFor="component-import-source">
            Component text
          </label>
          <textarea
            id="component-import-source"
            className="component-import-source"
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            spellCheck={false}
            rows={24}
          />
        </>
      ) : (
        <div className="component-import-files">
          <label className="field-label">
            Component sheet CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={fileLoading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onLoadFile(file, (text, filename) =>
                  onSheetChange(text, filename),
                );
              }}
            />
            {sheetFilename ? (
              <span className="font-mono text-[11px] text-ink-3">
                {sheetFilename}
              </span>
            ) : null}
          </label>
          <label className="field-label">
            Component lines CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={fileLoading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onLoadFile(file, (text, filename) =>
                  onLinesChange(text, filename),
                );
              }}
            />
            {linesFilename ? (
              <span className="font-mono text-[11px] text-ink-3">
                {linesFilename}
              </span>
            ) : null}
          </label>
          <label className="field-label">
            Plain text component (.txt)
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={fileLoading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onLoadFile(file, (text, filename) =>
                  onTextFileChange(text, filename),
                );
              }}
            />
            {textFilename ? (
              <span className="font-mono text-[11px] text-ink-3">
                {textFilename}
              </span>
            ) : null}
          </label>
          {fileStatus ? (
            <p className="font-mono text-[11px] text-ink-3">{fileStatus}</p>
          ) : null}
        </div>
      )}

      {sourceHint ? (
        <p className="component-import-source-hint" role="status">
          {sourceHint}
        </p>
      ) : null}

      <div className="component-import-pane-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={parsing || fileLoading || !canParse}
          aria-busy={parsing || fileLoading}
          onClick={onParse}
        >
          {fileLoading ? "Reading file…" : parsing ? "Parsing…" : "Parse"}
        </button>
      </div>
    </section>
  );
}

export function ComponentImportReviewPane({
  review,
  coordinator,
  catalog,
  busy,
  unresolvedCount,
  onReviewChange,
  onJumpUnresolved,
  onFinalize,
}: {
  review: ComponentImportReviewState | null;
  coordinator: import("./ComponentImportCoordinator").ComponentImportCoordinator;
  catalog: { id: string; name: string }[];
  busy: boolean;
  unresolvedCount: number;
  onReviewChange: (review: ComponentImportReviewState) => void;
  onJumpUnresolved: () => void;
  onFinalize: () => void;
}) {
  if (!review) {
    return (
      <section
        className="component-import-pane component-import-pane-review"
        aria-label="Structured review"
      >
        <div className="component-import-empty">
          <p className="eyebrow">Waiting</p>
          <h3 className="font-display text-3xl">
            Structure the house book entry.
          </h3>
          <p>
            Paste component text or choose `.txt` / CSV files, then parse to
            review ingredient matches before saving.
          </p>
        </div>
      </section>
    );
  }

  const newIngredientCount = review.lines.filter(
    (line) =>
      line.matchStatus === "new" || line.matchStatus === "confirmed_new",
  ).length;

  return (
    <section
      className="component-import-pane component-import-pane-review"
      aria-label="Structured review"
    >
      <div className="component-import-pane-head">
        <h2>Capsule draft</h2>
        <span className="component-import-badge">
          {newIngredientCount} new · {unresolvedCount} unresolved
        </span>
      </div>

      {review.errors.length ? (
        <ul className="component-import-errors">
          {review.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {review.warnings.length ? (
        <ul className="component-import-warnings">
          {review.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {unresolvedCount > 0 ? (
        <div className="component-import-unresolved">
          <p>{unresolvedCount} ingredient lines still need review.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onJumpUnresolved}
          >
            Jump to first unresolved
          </button>
        </div>
      ) : null}

      <label className="field-label">
        Component name
        <input
          value={review.name}
          onChange={(event) =>
            onReviewChange({ ...review, name: event.target.value })
          }
        />
      </label>

      <div className="component-import-yield">
        <label className="field-label">
          Yield
          <input
            type="number"
            min={0.01}
            step="any"
            value={review.yieldQuantity}
            onChange={(event) =>
              onReviewChange({
                ...review,
                yieldQuantity: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field-label">
          Unit
          <select
            value={review.yieldUnit}
            onChange={(event) =>
              onReviewChange(
                coordinator.setYieldUnit(
                  review,
                  event.target.value as ComponentImportReviewState["yieldUnit"],
                ),
              )
            }
          >
            {(
              [
                "each",
                "gram",
                "kilogram",
                "ounce",
                "pound",
                "milliliter",
                "liter",
                "teaspoon",
                "tablespoon",
                "cup",
                "pint",
                "quart",
                "gallon",
                "portion",
              ] as const
            ).map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="component-import-lines-head">
        <h3>Components</h3>
        <span className="font-mono text-[11px] text-ink-3">
          {review.lines.length} lines
        </span>
      </div>

      <ul className="component-import-lines">
        {review.lines.map((line, index) => (
          <li key={`${line.raw}-${index}`} data-unresolved={line.matchStatus}>
            <div className="component-import-line-meta">
              <span
                className={`component-import-status is-${line.matchStatus}`}
                aria-label={coordinator.statusLabel(line.matchStatus)}
              >
                {coordinator.statusLabel(line.matchStatus)}
              </span>
              {line.matchStatus === "exact" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    onReviewChange(coordinator.confirmExactLine(review, index))
                  }
                >
                  Accept exact match
                </button>
              ) : null}
              {line.matchStatus === "possible" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    onReviewChange(coordinator.confirmNewLine(review, index))
                  }
                >
                  Confirm new ingredient
                </button>
              ) : null}
              {line.matchStatus === "new" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    onReviewChange(coordinator.confirmNewLine(review, index))
                  }
                >
                  Confirm create
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  onReviewChange(coordinator.removeLine(review, index))
                }
              >
                Remove
              </button>
            </div>
            <div className="component-import-line-grid">
              <label className="field-label">
                Ingredient
                <input
                  value={line.name}
                  onChange={(event) =>
                    onReviewChange(
                      coordinator.updateLine(review, index, {
                        name: event.target.value,
                        matchStatus: "new",
                        matchedIngredientId: undefined,
                        matchedIngredientName: undefined,
                        possibleMatchIds: [],
                        possibleMatchNames: [],
                        createNew: true,
                      }),
                    )
                  }
                />
              </label>
              <label className="field-label">
                Match catalog
                <input
                  list={`catalog-${index}`}
                  placeholder="Search existing ingredients"
                  defaultValue={line.matchedIngredientName ?? ""}
                  onChange={(event) => {
                    const item =
                      catalog.find(
                        (entry) =>
                          entry.name.toLowerCase() ===
                          event.target.value.trim().toLowerCase(),
                      ) ?? null;
                    onReviewChange(
                      coordinator.bindCatalogIngredient(review, index, item),
                    );
                  }}
                />
                <datalist id={`catalog-${index}`}>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                  {(line.possibleMatchNames ?? []).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label className="field-label">
                Qty
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={line.quantity}
                  onChange={(event) =>
                    onReviewChange(
                      coordinator.updateLine(review, index, {
                        quantity: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>
              <label className="field-label">
                Unit
                <select
                  value={line.unit}
                  onChange={(event) =>
                    onReviewChange(
                      coordinator.updateLine(review, index, {
                        unit: event.target.value as typeof line.unit,
                        unitRaw: event.target.value,
                      }),
                    )
                  }
                >
                  {(
                    [
                      "each",
                      "gram",
                      "kilogram",
                      "ounce",
                      "pound",
                      "milliliter",
                      "liter",
                      "teaspoon",
                      "tablespoon",
                      "cup",
                      "pint",
                      "quart",
                      "gallon",
                      "portion",
                    ] as const
                  ).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
      </ul>

      <label className="field-label">
        Instructions
        <textarea
          rows={8}
          value={review.instructions ?? ""}
          onChange={(event) =>
            onReviewChange({
              ...review,
              instructions: event.target.value || undefined,
            })
          }
        />
      </label>

      <div className="component-import-pane-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || unresolvedCount > 0 || review.lines.length === 0}
          aria-busy={busy}
          onClick={onFinalize}
        >
          {busy ? "Finalizing…" : "Save and edit component"}
        </button>
      </div>
    </section>
  );
}
