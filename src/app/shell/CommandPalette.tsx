import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useListEvent } from "../../lib/manifest-convex-react";
import {
  BoxIcon,
  BuildingIcon,
  CalendarIcon,
  CoinsIcon,
  ContactIcon,
  FlameIcon,
  KeyboardIcon,
  PlusIcon,
  TruckIcon,
  UsersIcon,
} from "../../ui/icons";
import { useNaturalLanguageSearch } from "../../features/search/useNaturalLanguageSearch";
import { StatusChip } from "../../ui/primitives";
import { navigationCatalog } from "../navigation/NavigationCatalog";

interface Command {
  key: string;
  label: string;
  hint?: string;
  status?: string;
  icon?: React.ReactNode;
  run: () => void;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  event: <CalendarIcon />,
  invoice: <CoinsIcon />,
  client: <ContactIcon />,
  vendor: <TruckIcon />,
  dish: <FlameIcon />,
  menu: <FlameIcon />,
  component: <FlameIcon />,
  ingredient: <BoxIcon />,
  proposal: <ContactIcon />,
  contract: <ContactIcon />,
  lead: <ContactIcon />,
  person: <UsersIcon />,
  venue: <BuildingIcon />,
};

export function CommandPalette({
  open,
  onClose,
  onOpenShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts?: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const events = useListEvent();
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const disabledCapabilities = authStatus?.disabledCapabilities;
  const { hits: searchHits, loading: searchLoading } = useNaturalLanguageSearch(
    query,
    open,
  );

  useEffect(() => {
    // Reset on close too: the component stays mounted, so a lingering query
    // would keep the searchAll subscription alive after navigation and let a
    // late server error crash whatever page the user landed on (#133).
    setQuery("");
    setActive(0);
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const eventRows = open ? (events ?? []) : [];
    const navAreas = navigationCatalog.availableAreas(disabledCapabilities);
    const kitchenOn = navAreas.some((area) => area.path === "/kitchen");
    const eventsOn = navAreas.some((area) => area.path === "/events");
    const base: Command[] = [
      ...(eventsOn
        ? [
            {
              key: "new-event",
              label: "New event",
              hint: "Create",
              icon: <PlusIcon />,
              run: go("/events/new"),
            } satisfies Command,
          ]
        : []),
      ...(kitchenOn
        ? [
            {
              key: "import-component",
              label: "Import component",
              hint: "Create",
              icon: <PlusIcon />,
              run: go("/kitchen/components/import"),
            } satisfies Command,
          ]
        : []),
      ...(onOpenShortcuts
        ? [
            {
              key: "keyboard-shortcuts",
              label: "Keyboard shortcuts",
              hint: "?",
              icon: <KeyboardIcon />,
              run: () => {
                onClose();
                onOpenShortcuts();
              },
            } satisfies Command,
          ]
        : []),
      ...navAreas.map((a) => ({
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

    // Ranked natural-language hits live at the top once the server has spoken.
    // While typing, still filter the static commands so the palette feels live.
    const ranked: Command[] = searchHits.map((h) => ({
      key: `hit-${h.kind}-${h.id}`,
      label: h.label,
      hint: h.hint,
      icon: KIND_ICON[h.kind] ?? <CalendarIcon />,
      run: go(h.path),
    }));

    if (q.length === 0) return base;
    const filteredBase = base.filter((c) => c.label.toLowerCase().includes(q));
    return [...ranked, ...filteredBase];
  }, [
    events,
    query,
    navigate,
    onClose,
    open,
    onOpenShortcuts,
    searchHits,
    disabledCapabilities,
  ]);

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
          placeholder="Search events, clients, invoices… (e.g. “unpaid invoices over 30 days”)"
          className="h-11 w-full border-b border-line bg-transparent px-4 text-lg outline-none placeholder:text-ink-3"
        />
        <ul className="max-h-80 overflow-y-auto py-1.5">
          {commands.length === 0 && !searchLoading && (
            <li className="px-4 py-6 text-center text-ink-3">No matches.</li>
          )}
          {commands.length === 0 && searchLoading && (
            <li className="px-4 py-6 text-center text-ink-3">Searching…</li>
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
                <span className="ml-auto text-2xs tracking-wider text-ink-3 uppercase">
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
