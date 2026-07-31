import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../../ui/icons";
import {
  SHORTCUT_GROUPS,
  displayKeys,
  type ShortcutGroup,
} from "./keyboardShortcuts";

export function ShortcutReferenceOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const groups = useMemo<ShortcutGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_GROUPS;
    return SHORTCUT_GROUPS.map((g) => ({
      group: g.group,
      shortcuts: g.shortcuts.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.keys.some((k) => k !== "Mod" && k.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.shortcuts.length > 0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="mx-auto w-full max-w-110 rounded-sm border border-line-2 bg-panel shadow-[0_18px_50px_-12px_rgba(34,30,22,0.4)]">
        <div className="flex h-11 items-center gap-2 border-b border-line px-4">
          <SearchIcon className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search keyboard shortcuts…"
            className="h-full w-full bg-transparent text-lg outline-none placeholder:text-ink-3"
          />
          <span className="kbd shrink-0">Esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-base text-ink-3">
              No shortcuts match “{query}”.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.group} className="mb-1.5 last:mb-0">
              <h3 className="meta-term px-3 py-1.5">{g.group}</h3>
              <ul>
                {g.shortcuts.map((s) => {
                  const keys = displayKeys(s.keys);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-xs px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium">
                          {s.label}
                        </p>
                        {s.description ? (
                          <p className="truncate text-xs text-ink-3">
                            {s.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {keys.length === 0 ? (
                          <span className="text-xs text-ink-3">—</span>
                        ) : (
                          keys.map((k, i) => (
                            <span key={i} className="kbd">
                              {k}
                            </span>
                          ))
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
