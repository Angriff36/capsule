import { formatDate, formatTime } from "../../lib/format";
import { AlertTriangleIcon } from "../../ui/icons";

export type TimelineCategoryCount = {
  readonly label: string;
  readonly count: number;
};

export type TimelineKeyStaff = {
  readonly key: string;
  readonly name: string;
  readonly role: string;
};

export type TimelineSiteNote = {
  readonly key: string;
  readonly activity: string;
  readonly note: string;
};

type Props = {
  readonly windowStart: number | null;
  readonly windowEnd: number | null;
  readonly categories: readonly TimelineCategoryCount[];
  readonly keyStaff: readonly TimelineKeyStaff[];
  readonly siteNotes: readonly TimelineSiteNote[];
  readonly questionCount: number;
};

/** "7 hours", "45 min", "1 hr 30 min" — the run sheet's total span. */
export function formatSpan(from: number, to: number): string {
  const minutes = Math.max(Math.round((to - from) / 60000), 0);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} hr ${rest} min`;
}

/** Right rail of the timeline tab: window, category split, staff, notes. */
export function EventTimelineSidebar({
  windowStart,
  windowEnd,
  categories,
  keyStaff,
  siteNotes,
  questionCount,
}: Props) {
  return (
    <aside className="w-full shrink-0 space-y-5 xl:w-[17rem]">
      <section className="card p-4" aria-label="Run sheet window">
        <h3 className="mb-3 text-base font-semibold text-ink">
          Run sheet window
        </h3>
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-xs text-ink-3">First block</dt>
            <dd className="font-medium text-ink">
              {windowStart == null
                ? "Not scheduled"
                : `${formatDate(windowStart)} · ${formatTime(windowStart)}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Last block ends</dt>
            <dd className="font-medium text-ink">
              {windowEnd == null
                ? "Not scheduled"
                : `${formatDate(windowEnd)} · ${formatTime(windowEnd)}`}
            </dd>
          </div>
          {windowStart != null && windowEnd != null ? (
            <div className="border-t border-line pt-2">
              <dt className="text-xs text-ink-3">Total duration</dt>
              <dd className="text-lg font-semibold text-ink">
                {formatSpan(windowStart, windowEnd)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {categories.length > 0 ? (
        <section className="card p-4" aria-label="Blocks by category">
          <h3 className="mb-3 text-base font-semibold text-ink">By category</h3>
          <ul className="flex flex-col gap-2">
            {categories.map((category) => (
              <li
                key={category.label}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-base text-ink-2">
                  {category.label}
                </span>
                <span className="rounded-sm bg-inset px-2 py-0.5 text-xs font-semibold text-ink-2">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {keyStaff.length > 0 ? (
        <section className="card p-4" aria-label="Staff on this event">
          <h3 className="mb-3 text-base font-semibold text-ink">
            Staff on this event
          </h3>
          <ul className="flex flex-col gap-2">
            {keyStaff.map((person) => (
              <li key={person.key}>
                <p className="text-base font-medium text-ink">{person.name}</p>
                {person.role ? (
                  <p className="text-xs text-ink-3">{person.role}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {siteNotes.length > 0 ? (
        <section
          className="rounded-md border border-warn/40 bg-warn-soft p-4"
          aria-label="Site notes"
        >
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-warn">Site notes</h3>
              <ul className="mt-1 space-y-1 text-xs text-warn">
                {siteNotes.map((note) => (
                  <li key={note.key}>
                    <span className="font-semibold">{note.activity}:</span>{" "}
                    {note.note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card p-4" aria-label="Questions on this run sheet">
        <h3 className="mb-3 text-base font-semibold text-ink">Questions</h3>
        <p className="text-2xl font-semibold text-brand">{questionCount}</p>
        <p className="mt-1 text-xs text-ink-3">
          Posted on the blocks of this run sheet.
        </p>
      </section>
    </aside>
  );
}
