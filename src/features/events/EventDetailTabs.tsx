import type { EventDetailTab } from "./eventRoutes";
import {
  EVENT_DETAIL_TABS,
  EVENT_TAB_GROUPS,
  eventTabGroupFor,
} from "./eventRoutes";

type Props = {
  active: EventDetailTab;
  onChange: (tab: EventDetailTab) => void;
};

const labelFor = (key: EventDetailTab) =>
  EVENT_DETAIL_TABS.find((tab) => tab.key === key)?.label ?? key;

/**
 * Two-row navigation: workflow group (Plan / Food / Day-of / Records / Money)
 * then that group's sections. Picking a group opens its first section.
 */
export function EventDetailTabs({ active, onChange }: Props) {
  const activeGroup = eventTabGroupFor(active);
  return (
    <nav className="event-detail-tabs" aria-label="Event sections">
      <div className="event-tab-groups" role="tablist" aria-label="Workflow">
        {EVENT_TAB_GROUPS.map((group) => {
          const isActive = group.key === activeGroup.key;
          return (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onChange(group.tabs[0] ?? "overview")}
            >
              {group.label}
            </button>
          );
        })}
      </div>
      {activeGroup.tabs.length > 1 ? (
        <div
          className="event-tab-sections"
          role="tablist"
          aria-label={`${activeGroup.label} sections`}
        >
          {activeGroup.tabs.map((key) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onChange(key)}
              >
                {labelFor(key)}
              </button>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
