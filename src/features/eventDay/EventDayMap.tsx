import type { EventDaySection, EventDaySectionKey } from "./eventDayModel";
import { EventDayNodeCard } from "./EventDayNodeCard";

/**
 * The garden map. All geometry lives in one 390x620 coordinate space:
 * cards are absolutely placed by percentage and the connector paths use
 * the same numbers inside the SVG viewBox, so they always meet.
 */

type Box = { x: number; y: number; w: number; h: number };

const W = 390;
const H = 620;

const BOXES: Record<EventDaySectionKey, Box> = {
  venue: { x: 120, y: 10, w: 150, h: 120 },
  staffing: { x: 12, y: 155, w: 116, h: 120 },
  timeline: { x: 137, y: 155, w: 116, h: 120 },
  menu: { x: 262, y: 155, w: 116, h: 120 },
  vehicles: { x: 12, y: 300, w: 116, h: 120 },
  layouts: { x: 137, y: 300, w: 116, h: 120 },
  equipment: { x: 262, y: 300, w: 116, h: 120 },
  contacts: { x: 55, y: 455, w: 116, h: 120 },
  packlist: { x: 219, y: 455, w: 116, h: 120 },
};

/** Garden paths: parent bottom-center to child top-center. */
const ROUTES: Array<{ from: EventDaySectionKey; to: EventDaySectionKey }> = [
  { from: "venue", to: "staffing" },
  { from: "venue", to: "timeline" },
  { from: "venue", to: "menu" },
  { from: "staffing", to: "vehicles" },
  { from: "timeline", to: "layouts" },
  { from: "menu", to: "equipment" },
  { from: "vehicles", to: "contacts" },
  { from: "equipment", to: "packlist" },
];

const LOCK_Y = 505;

function routePath(from: Box, to: Box): string {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  if (x1 === x2) return `M${x1},${y1} L${x2},${y2}`;
  const bend = (y2 - y1) * 0.6;
  return `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
}

function pct(box: Box) {
  return {
    left: `${(box.x / W) * 100}%`,
    top: `${(box.y / H) * 100}%`,
    width: `${(box.w / W) * 100}%`,
    height: `${(box.h / H) * 100}%`,
  };
}

type Props = {
  readonly sections: readonly EventDaySection[];
  /** true once the event stage reaches `final` — the plan is sealed. */
  readonly sealed: boolean;
  readonly onOpen: (key: EventDaySectionKey) => void;
};

export function EventDayMap({ sections, sealed, onOpen }: Props) {
  const byKey = new Map(sections.map((row) => [row.key, row]));
  const layouts = BOXES.layouts;
  const lockPath = `M${layouts.x + layouts.w / 2},${layouts.y + layouts.h} L${layouts.x + layouts.w / 2},${LOCK_Y}`;
  return (
    <div className="evd-map">
      <svg
        className="evd-routes"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {ROUTES.map(({ from, to }) => {
          const status = byKey.get(to)?.status ?? "dormant";
          return (
            <path
              key={`${from}-${to}`}
              className={`evd-route evd-route-${status}`}
              d={routePath(BOXES[from], BOXES[to])}
            />
          );
        })}
        <path
          className={`evd-route ${sealed ? "evd-route-ready" : "evd-route-dormant"}`}
          d={lockPath}
        />
      </svg>
      {sections.map((section) => (
        <EventDayNodeCard
          key={section.key}
          section={section}
          style={pct(BOXES[section.key])}
          onOpen={onOpen}
        />
      ))}
      <div
        className={`evd-lock ${sealed ? "evd-lock-open" : ""}`}
        style={{ top: `${(LOCK_Y / H) * 100}%` }}
        title={sealed ? "Plan is final" : "Plan not final yet"}
      >
        <svg viewBox="0 0 16 16" fill="none" width="16" height="16" aria-hidden>
          {sealed ? (
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <rect
                x="3.5"
                y="7"
                width="9"
                height="6"
                rx="1.5"
                fill="currentColor"
              />
              <path
                d="M5.5 7V5.5a2.5 2.5 0 015 0V7"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
