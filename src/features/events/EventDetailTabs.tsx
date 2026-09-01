import { useState, type ComponentType, type SVGProps } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ContactIcon,
  FlameIcon,
  HomeIcon,
  UsersIcon,
} from "../../ui/icons";
import {
  HardHatIcon,
  ImageIcon,
  MapIcon,
  MessageIcon,
  PackageIcon,
  RepeatIcon,
  TrendingUpIcon,
} from "./eventDetailIcons";
import type { EventDetailTab } from "./eventRoutes";
import {
  EVENT_DETAIL_TABS,
  EVENT_TAB_GROUPS,
  eventTabGroupFor,
} from "./eventRoutes";
import "./EventDetailTabs.css";

type Props = {
  active: EventDetailTab;
  onChange: (tab: EventDetailTab) => void;
  /** Phone: one compact selector + a menu instead of a scrolling row. */
  compact?: boolean;
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** Short bar labels. The picker keeps the descriptive names from eventRoutes. */
const BAR: readonly {
  key: EventDetailTab;
  label: string;
  Icon: IconComponent;
}[] = [
  { key: "overview", label: "Overview", Icon: HomeIcon },
  { key: "chat", label: "Chat", Icon: MessageIcon },
  { key: "menu", label: "Menu", Icon: FlameIcon },
  { key: "prep", label: "Prep", Icon: CheckCircleIcon },
  { key: "equipment", label: "Equipment", Icon: BoxIcon },
  { key: "client", label: "Client Info", Icon: ContactIcon },
  { key: "guests", label: "Guests", Icon: UsersIcon },
  { key: "photos", label: "Photos", Icon: ImageIcon },
  { key: "timeline", label: "Timeline", Icon: ClockIcon },
  { key: "layouts", label: "Layouts", Icon: MapIcon },
  { key: "recurring", label: "Recurring", Icon: RepeatIcon },
  { key: "staffing", label: "Staffing", Icon: HardHatIcon },
  { key: "inventory", label: "Inventory", Icon: PackageIcon },
  { key: "incidents", label: "Incidents", Icon: AlertTriangleIcon },
  { key: "margin", label: "Margin", Icon: TrendingUpIcon },
];

const labelFor = (key: EventDetailTab) =>
  EVENT_DETAIL_TABS.find((tab) => tab.key === key)?.label ?? key;

/**
 * Desktop: one flat row of icon + label sections, the active one underlined.
 * Phone (`compact`): a single button naming the current section that opens a
 * menu of every destination, grouped by workflow.
 */
export function EventDetailTabs({ active, onChange, compact = false }: Props) {
  if (compact) {
    return (
      <EventSectionPicker
        active={active}
        groupLabel={eventTabGroupFor(active).label}
        onChange={onChange}
      />
    );
  }
  return (
    <nav className="event-detail-tabs" aria-label="Event sections">
      <div className="event-tabbar" role="tablist" aria-label="Event sections">
        {BAR.map(({ key, label, Icon }) => {
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
              <Icon width={14} height={14} />
              {label}
            </button>
          );
        })}
      </div>
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
