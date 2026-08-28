import { Link } from "react-router-dom";
import { AlertTriangleIcon, UsersIcon } from "../../ui/icons";

export type LayoutCategoryCount = {
  readonly label: string;
  readonly count: number;
};

export type VenueNote = {
  readonly key: string;
  readonly label: string;
  readonly text: string;
};

type Props = {
  readonly totalSections: number;
  readonly describedSections: number;
  readonly categories: readonly LayoutCategoryCount[];
  readonly venueCapacity: number | null;
  readonly expectedHeadcount: number | null;
  readonly venueNotes: readonly VenueNote[];
  readonly accessibilityNeeds: string | null;
  readonly templatesPath: string;
};

/** Right rail of the layouts tab: section split, venue capacity, venue notes. */
export function EventLayoutsSidebar({
  totalSections,
  describedSections,
  categories,
  venueCapacity,
  expectedHeadcount,
  venueNotes,
  accessibilityNeeds,
  templatesPath,
}: Props) {
  const remaining =
    venueCapacity != null && expectedHeadcount != null
      ? venueCapacity - expectedHeadcount
      : null;

  return (
    <aside className="w-full shrink-0 space-y-5 xl:w-[17rem]">
      <section className="card p-4" aria-label="Layout summary">
        <h3 className="mb-3 text-base font-semibold text-ink">
          Layout summary
        </h3>
        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-base text-ink-2">Total sections</dt>
            <dd className="rounded-sm bg-inset px-2 py-0.5 text-xs font-semibold text-ink-2">
              {totalSections}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-base text-ink-2">With instructions</dt>
            <dd className="text-base font-semibold text-ink">
              {describedSections}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-base text-ink-2">Still blank</dt>
            <dd className="text-base font-semibold text-ink">
              {Math.max(totalSections - describedSections, 0)}
            </dd>
          </div>
        </dl>
      </section>

      {categories.length > 0 ? (
        <section className="card p-4" aria-label="Sections by area">
          <h3 className="mb-3 text-base font-semibold text-ink">By area</h3>
          <ul className="flex flex-col gap-2">
            {categories.map((category) => (
              <li
                key={category.label}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-base text-ink">
                  {category.label}
                </span>
                <span className="rounded-sm bg-inset px-1.5 py-0.5 text-xs font-semibold text-ink-2">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {venueCapacity != null || expectedHeadcount != null ? (
        <section className="card p-4" aria-label="Venue capacity">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <UsersIcon className="text-ink-3" />
            Venue capacity
          </h3>
          <dl className="flex flex-col gap-2">
            {venueCapacity != null ? (
              <div>
                <dt className="text-xs text-ink-3">Guest capacity</dt>
                <dd className="font-medium text-ink">{venueCapacity} max</dd>
              </div>
            ) : null}
            {expectedHeadcount != null ? (
              <div>
                <dt className="text-xs text-ink-3">This event</dt>
                <dd className="font-medium text-ok">
                  {expectedHeadcount} guests
                </dd>
              </div>
            ) : null}
            {remaining != null ? (
              <div className="border-t border-line pt-2">
                <dt className="text-xs text-ink-3">Remaining capacity</dt>
                <dd className="text-lg font-semibold text-ink">
                  {remaining} seats
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {venueNotes.length > 0 ? (
        <section
          className="rounded-md border border-warn/40 bg-warn-soft p-4"
          aria-label="Venue notes"
        >
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-warn">Venue notes</h3>
              <ul className="mt-1 space-y-1 text-xs text-warn">
                {venueNotes.map((note) => (
                  <li key={note.key}>
                    <span className="font-semibold">{note.label}:</span>{" "}
                    {note.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {accessibilityNeeds ? (
        <section
          className="rounded-md border border-info/40 bg-info-soft p-4"
          aria-label="Accessibility"
        >
          <h3 className="text-base font-semibold text-info">Accessibility</h3>
          <p className="mt-1 text-xs text-info">{accessibilityNeeds}</p>
        </section>
      ) : null}

      <section className="card p-4" aria-label="Layout templates">
        <h3 className="mb-3 text-base font-semibold text-ink">Templates</h3>
        <Link
          to={templatesPath}
          className="btn btn-ghost w-full justify-center"
        >
          Browse saved templates
        </Link>
      </section>
    </aside>
  );
}
