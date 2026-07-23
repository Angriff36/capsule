import {
  useListAvailabilityWindow,
  useListRecurringAvailability,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { availabilityForDay, upcomingDays } from "./availabilityGrid";

interface PersonRow {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
}

/**
 * Live availability grid for scheduling managers: active people × the next
 * seven days, resolved from weekly patterns plus date-range exceptions.
 * Convex reactive queries keep it live while shifts are being built.
 */
export function AvailabilityGridSection({ people }: { people: PersonRow[] }) {
  const recurring = useListRecurringAvailability();
  const windows = useListAvailabilityWindow();
  const days = upcomingDays(7);

  return (
    <section className="working-ledger">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Availability</p>
          <h2>Who can work · next 7 days</h2>
        </div>
        <span>{people.length} people</span>
      </div>
      {recurring === undefined || windows === undefined ? (
        <TableSkeleton rows={4} />
      ) : people.length === 0 ? (
        <div className="document-empty">
          <p>No active staff profiles.</p>
          <span>Add people to the roster to see their availability.</span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Person</th>
                {days.map((day) => (
                  <th key={day.getTime()}>
                    {day.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const myRecurring = recurring.filter(
                  (row) => row.personId === person._id,
                );
                const myWindows = windows.filter(
                  (row) => row.personId === person._id,
                );
                return (
                  <tr key={person._id}>
                    <td>
                      <strong>
                        {person.givenName} {person.familyName}
                      </strong>
                    </td>
                    {days.map((day) => {
                      const cell = availabilityForDay(
                        day,
                        myRecurring,
                        myWindows,
                      );
                      return (
                        <td
                          key={day.getTime()}
                          className={
                            cell.state === "off"
                              ? "text-danger"
                              : cell.state === "unknown"
                                ? "text-ink-3"
                                : undefined
                          }
                        >
                          {cell.label}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
