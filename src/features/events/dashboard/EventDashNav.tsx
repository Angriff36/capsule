import type { EventDetailTab } from "../eventRoutes";
import { DASH_GROUPS, DASH_TAB_LABEL } from "./eventDashFacts";

/** Group switcher with the group's sections underneath. */
export function EventDashNav({
  active,
  onChange,
}: {
  readonly active: EventDetailTab;
  readonly onChange: (tab: EventDetailTab) => void;
}) {
  const group =
    DASH_GROUPS.find((entry) => entry.tabs.includes(active)) ?? DASH_GROUPS[0]!;
  return (
    <nav className="evd-nav" aria-label="Event sections" id="event-sections">
      <div className="evd-seg" role="tablist" aria-label="Event sections">
        {DASH_GROUPS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry === group}
            className={entry === group ? "on" : ""}
            onClick={() => onChange(entry.tabs[0]!)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="evd-sub">
        {group.tabs.length > 1
          ? group.tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={tab === active ? "on" : ""}
                aria-current={tab === active ? "page" : undefined}
                onClick={() => onChange(tab)}
              >
                {DASH_TAB_LABEL[tab]}
              </button>
            ))
          : null}
      </div>
    </nav>
  );
}
