import { useState } from "react";
import { ChevronDownIcon } from "../../ui/icons";
import type { EventDetailTab } from "./eventRoutes";
import {
  EVENT_DETAIL_TABS,
  EVENT_TAB_GROUPS,
  eventTabGroupFor,
} from "./eventRoutes";

type Props = {
  active: EventDetailTab;
  onChange: (tab: EventDetailTab) => void;
  /** Phone: one compact selector + a menu instead of two scrolling rows. */
  compact?: boolean;
};

const labelFor = (key: EventDetailTab) =>
  EVENT_DETAIL_TABS.find((tab) => tab.key === key)?.label ?? key;

/**
 * Desktop: workflow group pills (Plan / Food / Day-of / Records / Money) then
 * that group's sections. Phone (`compact`): a single button naming the current
 * section that opens a menu of every destination, grouped the same way.
 */
export function EventDetailTabs({ active, onChange, compact = false }: Props) {
  const activeGroup = eventTabGroupFor(active);
  if (compact) {
    return (
      <EventSectionPicker
        active={active}
        groupLabel={activeGroup.label}
        onChange={onChange}
      />
    );
  }
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

function EventSectionPicker({
  active,
  groupLabel,
  onChange,
}: {
  active: EventDetailTab;
  groupLabel: string;
  onChange: (tab: EventDetailTab) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="event-section-picker" aria-label="Event sections">
      <button
        type="button"
        className="event-section-picker-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-ink-2">
            {groupLabel}
          </span>
          <span className="block truncate text-base font-semibold text-ink">
            {labelFor(active)}
          </span>
        </span>
        <ChevronDownIcon width={16} height={16} />
      </button>
      {open ? (
        <div className="event-section-picker-menu" role="menu">
          {EVENT_TAB_GROUPS.map((group) => (
            <div key={group.key} className="event-section-picker-group">
              <p>{group.label}</p>
              {group.tabs.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={key === active}
                  onClick={() => {
                    setOpen(false);
                    onChange(key);
                  }}
                >
                  {labelFor(key)}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
