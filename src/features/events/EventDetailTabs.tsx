import type { EventDetailTab } from "./eventRoutes";
import { EVENT_DETAIL_TABS } from "./eventRoutes";

type Props = {
  active: EventDetailTab;
  onChange: (tab: EventDetailTab) => void;
};

export function EventDetailTabs({ active, onChange }: Props) {
  return (
    <nav
      className="event-detail-tabs flex flex-wrap gap-1 border-b border-line"
      aria-label="Event sections"
    >
      {EVENT_DETAIL_TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            className={
              isActive
                ? "border-b-2 border-ink px-3 py-2 text-[13px] font-semibold text-ink"
                : "border-b-2 border-transparent px-3 py-2 text-[13px] text-ink-2 hover:text-ink"
            }
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
