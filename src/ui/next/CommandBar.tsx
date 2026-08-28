import React, { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "./core";
import "./next.css";

/* ============================================================================
   CommandBar — Ctrl-K jump-to and do
   Two things in one surface, which is the point: an operator types "harr" and
   gets the event, types "assign" and gets the action. Verb + noun command
   names, grouped results, arrow keys, Enter, Esc.

   Scoping: typing `>` restricts to commands, `@` to people, `#` to events —
   so the palette never makes you scroll past the wrong kind of result.
   ========================================================================== */

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  glyph?: string;
  /** Right-hand context: a date, a client, a stage. */
  meta?: string;
  shortcut?: string;
  keywords?: string;
  kind?: "command" | "person" | "record";
  run?: () => void;
}

const PREFIX: Record<string, CommandItem["kind"]> = {
  ">": "command",
  "@": "person",
  "#": "record",
};

const SCOPE_LABEL: Record<string, string> = {
  command: "Commands",
  person: "People",
  record: "Events",
};

function score(item: CommandItem, q: string): number {
  if (!q) return 1;
  const hay =
    `${item.label} ${item.keywords ?? ""} ${item.meta ?? ""}`.toLowerCase();
  const needle = q.toLowerCase();
  const at = hay.indexOf(needle);
  if (at === -1) {
    // subsequence match, so "hag" still finds "Harrington Gala"
    let i = 0;
    for (const ch of hay) if (ch === needle[i]) i++;
    return i === needle.length ? 0.3 : 0;
  }
  // earlier hits and label hits rank higher
  const inLabel = item.label.toLowerCase().includes(needle);
  return (inLabel ? 2 : 1) + 1 / (at + 2);
}

export function CommandBar({
  items,
  open,
  onClose,
  placeholder = "Search events, clients, invoices — or type a command",
}: {
  items: CommandItem[];
  open: boolean;
  onClose: () => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scope = PREFIX[raw[0]] ?? undefined;
  const query = scope ? raw.slice(1).trim() : raw.trim();

  const results = useMemo(() => {
    const scored = items
      .filter((i) => (scope ? (i.kind ?? "command") === scope : true))
      .map((i) => ({ i, s: score(i, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.i);
    const groups = new Map<string, CommandItem[]>();
    for (const item of scored) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return { flat: scored, groups: [...groups.entries()] };
  }, [items, query, scope]);

  useEffect(() => setCursor(0), [raw]);

  useEffect(() => {
    if (open) {
      setRaw("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const choose = (item?: CommandItem) => {
    if (!item) return;
    item.run?.();
    onClose();
  };

  return (
    <div className="cx cx-cmd-scrim" onMouseDown={onClose}>
      <div
        className="cx-cmd"
        role="dialog"
        aria-label="Command bar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cx-cmd-input">
          <span aria-hidden style={{ color: "var(--color-ink-3)" }}>
            ⌕
          </span>
          {scope && <span className="cx-cmd-scope">{SCOPE_LABEL[scope]}</span>}
          <input
            ref={inputRef}
            value={raw}
            placeholder={placeholder}
            aria-label="Search or run a command"
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.flat.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results.flat[cursor]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "Backspace" && raw.length === 1 && scope) {
                setRaw("");
              }
            }}
          />
        </div>

        <div className="cx-cmd-list" ref={listRef}>
          {results.flat.length === 0 ? (
            <div className="cx-cmd-empty">
              Nothing matches “{query}”.
              <div style={{ marginTop: 8, fontSize: 13 }}>
                Try <Kbd>&gt;</Kbd> for commands, <Kbd>#</Kbd> for events,{" "}
                <Kbd>@</Kbd> for people.
              </div>
            </div>
          ) : (
            results.groups.map(([group, list]) => (
              <div key={group}>
                <div className="cx-cmd-group">{group}</div>
                {list.map((item) => {
                  const index = results.flat.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      className="cx-cmd-item"
                      aria-selected={index === cursor}
                      onMouseMove={() => setCursor(index)}
                      onClick={() => choose(item)}
                    >
                      <span className="cx-cmd-glyph" aria-hidden>
                        {item.glyph ?? (item.kind === "person" ? "◍" : "▤")}
                      </span>
                      <span>{item.label}</span>
                      {item.meta && (
                        <span className="cx-cmd-meta">{item.meta}</span>
                      )}
                      {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cx-cmd-foot">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>↵</Kbd> run
          </span>
          <span>
            <Kbd>esc</Kbd> close
          </span>
          <span style={{ marginLeft: "auto" }}>
            <Kbd>&gt;</Kbd> commands <Kbd>#</Kbd> events <Kbd>@</Kbd> people
          </span>
        </div>
      </div>
    </div>
  );
}

/** Binds Ctrl/Cmd-K. Returns the open state and a setter. */
export function useCommandBar() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
