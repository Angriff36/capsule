import { Link } from "react-router-dom";
import { eventDetailPath } from "../events/eventRoutes";

export type EventDayNavKey = "map" | "run" | "board";

type GlyphShape = "map" | "run" | "board" | "shield" | "person" | "grid";

type NavItem = {
  label: string;
  to: string;
  glyph: GlyphShape;
  active: boolean;
};

/** Stroke-only 20x20 glyphs for the bottom nav. */
function NavGlyph({ shape }: { shape: GlyphShape }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden>
      {shape === "map" ? (
        <path
          d="M3 5.5l4.5-2 5 2L17 3.5v11l-4.5 2-5-2-4.5 2v-11zM7.5 3.5v11m5-9v11"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ) : null}
      {shape === "run" ? (
        <path
          d="M7 3.8l8.5 6.2L7 16.2V3.8z"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ) : null}
      {shape === "board" ? (
        <path
          d="M6.5 3h7v3h-7zM5 4.8h-1v12h12v-12h-1M7.5 10h5m-5 3h5"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {shape === "shield" ? (
        <path
          d="M10 2.5l6 2.2v4.6c0 3.8-2.6 6.6-6 8.2-3.4-1.6-6-4.4-6-8.2V4.7l6-2.2zM7.5 10l1.8 1.8 3.4-3.6"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {shape === "person" ? (
        <path
          d="M10 9.5a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5zM3.5 17c.8-3 3.4-4.7 6.5-4.7s5.7 1.7 6.5 4.7"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
      {shape === "grid" ? (
        <path
          d="M3.5 3.5h5v5h-5v-5zm8 0h5v5h-5v-5zm-8 8h5v5h-5v-5zm8 8h5v5h-5v-5z"
          strokeWidth="1.4"
        />
      ) : null}
    </svg>
  );
}

/**
 * Bottom nav shared by the event map, the run-of-show tracker, and the
 * battle board — one crew, one navigation, wherever they enter from.
 */
export function EventDayNav({
  eventId,
  active,
}: {
  eventId: string;
  active: EventDayNavKey;
}) {
  const items: NavItem[] = [
    {
      label: "Map",
      to: `/event-day/${eventId}`,
      glyph: "map",
      active: active === "map",
    },
    {
      label: "Run",
      to: `/event-day/${eventId}/run`,
      glyph: "run",
      active: active === "run",
    },
    {
      label: "Board",
      to: `/event-day/${eventId}/battle-board`,
      glyph: "board",
      active: active === "board",
    },
    {
      label: "Huddle",
      to: `/events/${eventId}/allergen-briefing`,
      glyph: "shield",
      active: false,
    },
    { label: "My day", to: "/my", glyph: "person", active: false },
    {
      label: "Capsule",
      to: eventDetailPath(eventId),
      glyph: "grid",
      active: false,
    },
  ];
  return (
    <nav className="evd-nav">
      {items.map((item) =>
        item.active ? (
          <span key={item.label} className="evd-nav-item evd-nav-on">
            <NavGlyph shape={item.glyph} />
            {item.label}
          </span>
        ) : (
          <Link key={item.label} className="evd-nav-item" to={item.to}>
            <NavGlyph shape={item.glyph} />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
