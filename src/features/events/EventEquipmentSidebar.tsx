import { BoxIcon, ClockIcon } from "../../ui/icons";
import { formatDate, formatTime } from "../../lib/format";

export type EquipmentCategoryCount = {
  readonly name: string;
  readonly count: number;
};

export type EquipmentStatusCount = {
  readonly label: string;
  readonly count: number;
  readonly tone: "done" | "out" | "pending";
};

type Props = {
  readonly categories: readonly EquipmentCategoryCount[];
  readonly statuses: readonly EquipmentStatusCount[];
  readonly totalItems: number;
  /** Earliest checkout and latest expected-back across this event's holds. */
  readonly loadOut?: number | null;
  readonly loadBack?: number | null;
  readonly eventStartsAt?: number | null;
  readonly eventEndsAt?: number | null;
};

function stamp(value?: number | null): string | null {
  if (value == null) return null;
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** Right rail of the equipment tab: category split, handoff state, load window. */
export function EventEquipmentSidebar({
  categories,
  statuses,
  totalItems,
  loadOut,
  loadBack,
  eventStartsAt,
  eventEndsAt,
}: Props) {
  const loadOutLabel = stamp(loadOut);
  const loadBackLabel = stamp(loadBack);
  const eventStartLabel = stamp(eventStartsAt);
  const eventEndLabel = stamp(eventEndsAt);

  return (
    <aside className="w-full shrink-0 space-y-5 xl:w-[17rem]">
      {categories.length > 0 ? (
        <section className="card p-4" aria-label="Equipment by category">
          <h3 className="mb-3 text-base font-semibold text-ink">By category</h3>
          <ul className="flex flex-col gap-1">
            {categories.map((category) => (
              <li
                key={category.name}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5"
              >
                <BoxIcon className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-base text-ink">
                  {category.name}
                </span>
                <span className="rounded-sm bg-inset px-2 py-0.5 text-xs font-semibold text-ink-2">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-4" aria-label="Handoff state">
        <h3 className="mb-3 text-base font-semibold text-ink">Handoff state</h3>
        <div className="flex flex-col gap-2.5">
          {statuses.map((status) => (
            <div key={status.label}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-base font-medium text-ink">
                  {status.label}
                </span>
                <span className="rounded-sm bg-inset px-1.5 py-0.5 text-xs font-semibold text-ink-2">
                  {status.count}
                </span>
              </div>
              <div className="equipment-meter" data-tone={status.tone}>
                <i
                  style={{
                    width:
                      totalItems > 0
                        ? `${Math.round((status.count / totalItems) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4" aria-label="Load window">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <ClockIcon className="text-ink-3" />
          Load window
        </h3>
        <dl className="flex flex-col gap-2.5">
          <div>
            <dt className="text-xs text-ink-3">First checkout</dt>
            <dd className="font-medium text-ink">
              {loadOutLabel ?? "Not scheduled"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Last expected back</dt>
            <dd className="font-medium text-ink">
              {loadBackLabel ?? "Not scheduled"}
            </dd>
          </div>
          {eventStartLabel ? (
            <div className="border-t border-line pt-2.5">
              <dt className="text-xs text-ink-3">Event service</dt>
              <dd className="font-medium text-ink">
                {eventStartLabel}
                {eventEndLabel ? ` – ${eventEndLabel}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </aside>
  );
}
