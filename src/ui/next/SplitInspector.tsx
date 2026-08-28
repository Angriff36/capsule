import React, { useEffect, useRef, useState } from "react";
import { Kbd } from "./core";
import "./next.css";

/* ============================================================================
   SplitInspector — triage without losing your place
   Capsule makes you open an event, decide, go back, and rebuild your position
   in the list. This keeps the queue on the left and the decision surface on the
   right, with j/k to move and Enter to act — the pattern that makes a morning
   of approvals take four minutes instead of forty.
   ========================================================================== */

export interface InspectorItem {
  id: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  flag?: React.ReactNode;
}

export function SplitInspector({
  items,
  selectedId,
  onSelect,
  renderDetail,
  hint = true,
}: {
  items: InspectorItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  renderDetail: (id: string) => React.ReactNode;
  hint?: boolean;
}) {
  const current = selectedId ?? items[0]?.id;
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const move = (delta: number) => {
    const i = items.findIndex((it) => it.id === current);
    const next = items[Math.min(items.length - 1, Math.max(0, i + delta))];
    if (next) onSelect(next.id);
  };

  return (
    <div className="cx">
      {hint && (
        <div className="cx-split-hint">
          <span>
            <Kbd>j</Kbd> <Kbd>k</Kbd> move through the queue
          </span>
          <span>
            <Kbd>↵</Kbd> act on the open record
          </span>
          <span style={{ marginLeft: "auto" }}>
            {items.length} in queue{focused ? " · list focused" : ""}
          </span>
        </div>
      )}
      <div className="cx-split">
        <div
          className="cx-split-list"
          ref={listRef}
          tabIndex={0}
          role="listbox"
          aria-label="Queue"
          aria-activedescendant={current ? `cx-si-${current}` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "j" || e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "k" || e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {items.map((it) => (
            <button
              key={it.id}
              id={`cx-si-${it.id}`}
              role="option"
              aria-selected={it.id === current}
              aria-current={it.id === current}
              className="cx-split-item"
              onClick={() => onSelect(it.id)}
            >
              <span className="cx-split-item-top">
                <span className="cx-split-item-title">{it.title}</span>
                {it.flag}
                {it.right && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 13,
                      color: "var(--color-ink-3)",
                    }}
                  >
                    {it.right}
                  </span>
                )}
              </span>
              {it.sub && <span className="cx-split-item-sub">{it.sub}</span>}
            </button>
          ))}
        </div>
        <div className="cx-split-detail">
          {current ? renderDetail(current) : null}
        </div>
      </div>
    </div>
  );
}
