import type { EventBundlePlan } from "../../../agent/CapsuleEventBundlePlan";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";

type Props = {
  bundle: EventBundle;
  plan: EventBundlePlan | null;
  recognized: ReadonlyArray<{ name: string; source: string }>;
};

function clock(minutes: number | undefined): string {
  if (minutes === undefined) return "—";
  const total = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem = hour >= 12 ? "PM" : "AM";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{value ?? "—"}</dd>
    </div>
  );
}

/**
 * What was read and what will be created, side by side, so the person can
 * check the reports were understood before anything is written.
 */
export function EventImportPreviewPanel({ bundle, plan, recognized }: Props) {
  const { header } = bundle;
  const summary = plan?.summary;
  return (
    <section className="card space-y-4 p-4" data-testid="event-import-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">
            Read from {recognized.length} source
            {recognized.length === 1 ? "" : "s"}
          </p>
          <h2 className="text-base font-semibold text-ink">
            {header.title ?? "Untitled event"}
            {header.invoiceNumber ? (
              <span className="ml-2 text-sm font-normal text-ink-3">
                TPP #{header.invoiceNumber}
              </span>
            ) : null}
          </h2>
        </div>
        <p className="text-sm text-ink-3">
          {recognized.map((source) => source.name).join(" · ")}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Fact label="Date" value={header.eventDate} />
        <Fact
          label="Time"
          value={
            header.startMinutes === undefined
              ? undefined
              : `${clock(header.startMinutes)} – ${clock(header.endMinutes)}`
          }
        />
        <Fact
          label="Guests"
          value={
            header.guestCount === undefined
              ? undefined
              : String(header.guestCount)
          }
        />
        <Fact label="Service style" value={header.serviceStyle} />
        <Fact label="Occasion" value={header.occasion} />
        <Fact label="Client" value={bundle.client.name} />
        <Fact
          label="Venue"
          value={
            bundle.venue.name === undefined
              ? undefined
              : bundle.venue.latitude !== undefined
                ? `${bundle.venue.name} (${bundle.venue.latitude}, ${bundle.venue.longitude})`
                : bundle.venue.name
          }
        />
        <Fact label="Salesperson" value={header.salespersonName} />
      </dl>

      {summary ? (
        <ul
          className="flex flex-wrap gap-2 text-sm"
          data-testid="event-import-summary"
        >
          <li className="chip">{plan.steps.length} steps</li>
          <li className="chip">{bundle.menu.length} menu lines</li>
          <li className="chip">{summary.dishes} new catalog dishes</li>
          <li className="chip">{summary.timelineActivities} timeline blocks</li>
          <li className="chip">{summary.openShifts} open shifts</li>
          <li className="chip">{summary.staffAssignments} staff assigned</li>
          <li className="chip">{summary.packListItems} pack list items</li>
          <li className="chip">{summary.reviewFlags} review flags</li>
        </ul>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Menu</h3>
          {bundle.menu.length === 0 ? (
            <p className="text-sm text-ink-3">No menu rows were recognized.</p>
          ) : (
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Servings</th>
                    <th>Dish</th>
                    <th>Course</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.menu.map((item, index) => (
                    <tr key={`${item.name}:${index}`}>
                      <td className="supply-number">
                        {item.quantityServings ?? "—"}
                      </td>
                      <td>
                        <strong>{item.name}</strong>
                        {item.specialInstructions ? (
                          <small className="block text-ink-2">
                            ** {item.specialInstructions}
                          </small>
                        ) : null}
                      </td>
                      <td className="text-ink-3">{item.course ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">Timeline</h3>
            {bundle.timeline.length === 0 ? (
              <p className="text-sm text-ink-3">
                No timeline rows were recognized.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {bundle.timeline.map((entry, index) => (
                  <li key={`${entry.name}:${index}`} className="flex gap-3">
                    <span className="w-20 shrink-0 tabular-nums text-ink-3">
                      {clock(entry.minutes)}
                    </span>
                    <span className="text-ink">
                      {entry.name}
                      {entry.notes ? (
                        <span className="text-ink-3"> — {entry.notes}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {bundle.staff.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">Staff</h3>
              <ul className="space-y-1 text-sm">
                {bundle.staff.map((member, index) => (
                  <li key={`${member.role}:${index}`} className="flex gap-3">
                    <span className="w-20 shrink-0 tabular-nums text-ink-3">
                      {member.startMinutes === undefined
                        ? ""
                        : `${clock(member.startMinutes)}`}
                    </span>
                    <span className="text-ink">
                      {member.role ?? "Event staff"}
                      <span className="text-ink-3">
                        {" — "}
                        {/^unassigned$/i.test(member.name)
                          ? "open shift"
                          : member.name}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
