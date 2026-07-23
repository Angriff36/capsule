import { useState, type FormEvent } from "react";
import {
  useCreateRecurringAvailability,
  useListRecurringAvailability,
  useRecurringAvailabilityWithdraw,
} from "../../lib/manifest-convex-react";
import {
  DAY_NAMES,
  bandLabel,
  timeToMinutes,
} from "../workforce/availabilityGrid";

/**
 * Mobile self-service editor for a person's general weekly availability:
 * one time band per (weekday, row); remove = governed withdraw.
 */
export function WeeklyAvailabilityCard({
  personId,
  busy,
  run,
}: {
  personId: string;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
}) {
  const rows = useListRecurringAvailability();
  const declare = useCreateRecurringAvailability();
  const withdraw = useRecurringAvailabilityWithdraw();
  const [showAdd, setShowAdd] = useState(false);

  const mine = (rows ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.personId === personId &&
        String(row.status) === "active",
    )
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run("weekly-declare", async () => {
      await declare({
        personId,
        dayOfWeek: Number(data.get("dayOfWeek")),
        startMinute: timeToMinutes(String(data.get("from"))),
        endMinute: timeToMinutes(String(data.get("until"))),
      });
      setShowAdd(false);
    });
  };

  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Weekly availability</p>
        <button
          className="btn btn-ghost btn-sm py-2"
          onClick={() => setShowAdd((value) => !value)}
        >
          {showAdd ? "Close" : "Add"}
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">
        The days and hours you can generally work each week.
      </p>
      {showAdd ? (
        <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
          <label className="field-label">
            Day
            <select name="dayOfWeek" className="input" required>
              {DAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            From
            <input name="from" className="input" type="time" required />
          </label>
          <label className="field-label">
            Until
            <input name="until" className="input" type="time" required />
          </label>
          <button
            className="btn btn-primary w-full py-3 text-[15px]"
            disabled={busy != null}
          >
            {busy === "weekly-declare" ? "Saving…" : "Save weekly availability"}
          </button>
        </form>
      ) : null}
      {rows === undefined ? null : mine.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">
          No weekly availability set.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-line-2">
          {mine.map((row) => (
            <li key={row._id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">
                  {DAY_NAMES[row.dayOfWeek] ?? `Day ${row.dayOfWeek}`}
                </p>
                <p className="text-[12.5px] text-ink-2">
                  {bandLabel(row.startMinute, row.endMinute)}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm py-2"
                disabled={busy != null}
                onClick={() =>
                  run(`weekly:${row._id}`, async () => {
                    await withdraw({ docId: row._id, version: row.version });
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
