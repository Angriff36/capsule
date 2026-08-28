import React, { useState } from "react";
import "./next.css";

/* ============================================================================
   ViewBar — saved views and filter chips
   The single highest-value thing missing from Capsule's list pages. An operator
   asks the same three questions every morning ("what's unconfirmed today",
   "whose invoices are late", "which pack lists aren't dispatched"). Today they
   rebuild that query by hand each time.

   The rules that make it work, taken from Polaris IndexFilters:
   - promote 2-3 filters, everything else behind "Add filter"
   - applied filters are individually removable chips, plus Clear all
   - a modified view is dirty until you Save, or Save as a new one
   ========================================================================== */

export interface SavedView {
  id: string;
  label: string;
  count?: number;
}

export interface AppliedFilter {
  id: string;
  /** The dimension: "Stage", "Owner", "Covers". */
  field: string;
  /** The human value: "Approved", "Sara M", "over 100". */
  value: string;
}

export function ViewBar({
  views,
  activeView,
  onSelectView,
  filters,
  onRemoveFilter,
  onClearFilters,
  availableFilters = [],
  onAddFilter,
  dirty = false,
  onSave,
  onSaveAs,
  search,
  onSearch,
  right,
}: {
  views: SavedView[];
  activeView: string;
  onSelectView: (id: string) => void;
  filters: AppliedFilter[];
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
  availableFilters?: { id: string; field: string; value: string }[];
  onAddFilter?: (f: { id: string; field: string; value: string }) => void;
  dirty?: boolean;
  onSave?: () => void;
  onSaveAs?: () => void;
  search?: string;
  onSearch?: (q: string) => void;
  right?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="cx cx-viewbar">
      <div className="cx-viewbar-row">
        {views.map((v) => (
          <button
            key={v.id}
            className="cx-view"
            aria-current={v.id === activeView}
            onClick={() => onSelectView(v.id)}
          >
            {v.label}
            {v.count != null && (
              <span className="cx-view-count">{v.count}</span>
            )}
            {v.id === activeView && dirty && (
              <span
                className="cx-view-dirty"
                title="Unsaved changes to this view"
              >
                •
              </span>
            )}
          </button>
        ))}

        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {onSearch && (
            <input
              className="cx-inline-input"
              style={{ width: 200, height: 28, margin: 0 }}
              placeholder="Search this view…"
              value={search ?? ""}
              aria-label="Search this view"
              onChange={(e) => onSearch(e.target.value)}
            />
          )}
          {right}
        </span>
      </div>

      <div className="cx-viewbar-row">
        {filters.map((f) => (
          <span key={f.id} className="cx-chip">
            <b>{f.field}</b>
            {f.value}
            <button
              className="cx-chip-x"
              aria-label={`Remove ${f.field} filter`}
              onClick={() => onRemoveFilter(f.id)}
            >
              ×
            </button>
          </span>
        ))}

        {availableFilters.length > 0 && (
          <span style={{ position: "relative" }}>
            <button
              className="cx-chip-add"
              onClick={() => setAdding((v) => !v)}
            >
              + Add filter
            </button>
            {adding && (
              <div className="cx-prompt" style={{ width: 230, padding: 6 }}>
                {availableFilters.map((f) => (
                  <button
                    key={f.id}
                    className="cx-cmd-item"
                    onClick={() => {
                      onAddFilter?.(f);
                      setAdding(false);
                    }}
                  >
                    <span style={{ color: "var(--color-ink-3)" }}>
                      {f.field}
                    </span>
                    <span>{f.value}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        )}

        {filters.length > 0 && (
          <button
            className="cx-view"
            style={{ height: 26, fontSize: 14 }}
            onClick={onClearFilters}
          >
            Clear all
          </button>
        )}

        {dirty && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="cx-chip-add" onClick={onSaveAs}>
              Save as new view
            </button>
            <button
              className="cx-view"
              style={{
                height: 26,
                background: "var(--color-brand)",
                color: "var(--color-on-brand)",
              }}
              onClick={onSave}
            >
              Save view
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
