import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useListEvent } from "../../lib/manifest-convex-react";
import { CalendarIcon, PlusIcon } from "../../ui/icons";
import { StatusChip } from "../../ui/primitives";
import { NAV_AREAS } from "../nav";

interface Command {
  key: string;
  label: string;
  hint?: string;
  status?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const events = useListEvent();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const eventRows = open ? (events ?? []) : [];
    const base: Command[] = [
      {
        key: "new-event",
        label: "New event",
        hint: "Create",
        icon: <PlusIcon />,
        run: go("/events/new"),
      },
      ...NAV_AREAS.map((a) => ({
        key: a.path,
        label: a.label,
        hint: "Go to",
        icon: <a.icon />,
        run: go(a.path),
      })),
      ...eventRows.map((ev) => ({
        key: ev._id,
        label: String(ev.title ?? "Untitled event"),
        hint: "Event",
        status: typeof ev.status === "string" ? ev.status : undefined,
        icon: <CalendarIcon />,
        run: go(`/events/${ev._id}`),
      })),
    ];
    const q = query.trim().toLowerCase();
    return q ? base.filter((c) => c.label.toLowerCase().includes(q)) : base;
  }, [events, query, navigate, onClose, open]);

  if (!open) return null;

  const clamp = (i: number) => Math.max(0, Math.min(i, commands.length - 1));

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="mx-auto w-full max-w-130 rounded-sm border border-line-2 bg-panel shadow-[0_18px_50px_-12px_rgba(34,30,22,0.4)]">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => clamp(i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => clamp(i - 1));
            }
            if (e.key === "Enter") commands[active]?.run();
          }}
          placeholder="Search events, jump to an area…"
          className="h-11 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-ink-3"
        />
        <ul className="max-h-80 overflow-y-auto py-1.5">
          {commands.length === 0 && (
            <li className="px-4 py-6 text-center text-ink-3">No matches.</li>
          )}
          {commands.slice(0, 40).map((c, i) => (
            <li key={c.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={c.run}
                className={`flex h-9 w-full cursor-pointer items-center gap-2.5 px-4 text-left ${
                  i === active ? "bg-inset" : ""
                }`}
              >
                <span className="text-ink-3">{c.icon}</span>
                <span className="truncate">{c.label}</span>
                {c.status ? <StatusChip status={c.status} /> : null}
                <span className="ml-auto text-[10.5px] tracking-wider text-ink-3 uppercase">
                  {c.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
