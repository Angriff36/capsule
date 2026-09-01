import type { CSSProperties } from "react";
import type { EventDaySection } from "./eventDayModel";

/** Badge glyphs: check / pulse / eye / lock / empty ring per status. */
function BadgeGlyph({ status }: { status: EventDaySection["status"] }) {
  if (status === "ready") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3.5 8.5l3 3 6-6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "blocked") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="3.5" y="7" width="9" height="6" rx="1.5" fill="currentColor" />
        <path
          d="M5.5 7V5.5a2.5 2.5 0 015 0V7"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (status === "review") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 4.5v4l2.5 1.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (status === "active") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8" cy="8" r="2.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

type Props = {
  readonly section: EventDaySection;
  readonly style: CSSProperties;
  readonly onOpen: (key: EventDaySection["key"]) => void;
};

/** One estate on the night map: photo strip, label, live caption, badge. */
export function EventDayNodeCard({ section, style, onOpen }: Props) {
  return (
    <button
      type="button"
      className={`evd-node evd-st-${section.status}`}
      style={style}
      onClick={() => onOpen(section.key)}
      aria-label={`${section.label}: ${section.caption}`}
    >
      <span className="evd-node-badge">
        <BadgeGlyph status={section.status} />
      </span>
      <img
        className="evd-node-img"
        src={`/assets/event-day/nodes/${section.key}.png`}
        alt=""
        draggable={false}
      />
      <span className="evd-node-label">{section.label}</span>
      <span className="evd-node-caption">{section.caption}</span>
    </button>
  );
}
