import { Link } from "react-router-dom";
import { eventDetailPath } from "./eventRoutes";

export type MenuDietaryTally = { label: string; count: number };

/** Tags the rail always shows, even at zero, so gaps read as gaps. */
const COMMON_DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "pescatarian",
];

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

function titleCase(key: string): string {
  return key
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Distinct dishes per dietary tag across the event's menu lines. */
export function eventMenuDietaryTallies(
  tagLists: (string[] | null | undefined)[],
): MenuDietaryTally[] {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    const seen = new Set<string>();
    for (const raw of tags ?? []) {
      const key = normalizeTag(String(raw));
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const keys = new Set(counts.keys());
  const seeded = COMMON_DIETARY_TAGS.filter((tag) => !keys.has(tag)).map(
    (tag) => ({ label: titleCase(tag), count: 0 }),
  );
  const present = [...counts.entries()]
    .map(([key, count]) => ({ label: titleCase(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return [...seeded, ...present];
}

/**
 * Dietary coverage across the selected dishes. Tags are free strings on the
 * dish record — this counts what the menu actually declares.
 */
export function EventMenuDietaryCard({
  tallies,
  eventId,
}: {
  tallies: MenuDietaryTally[];
  eventId: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink">Dietary options</p>
      <div className="mt-3 grid gap-2">
        {tallies.map((tally) => (
          <div
            key={tally.label}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="text-sm text-ink-2">{tally.label}</span>
            <span
              className={`rounded-sm px-2 py-0.5 text-sm font-semibold ${
                tally.count > 0 ? "bg-ok-soft text-ok" : "bg-inset text-ink-3"
              }`}
            >
              {tally.count}
            </span>
          </div>
        ))}
      </div>
      <Link
        to={eventDetailPath(eventId, "guests")}
        className="btn-link mt-3 inline-block"
      >
        Manage accommodations
      </Link>
    </div>
  );
}
