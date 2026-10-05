import { useEffect, useState } from "react";
import { useShiftMarkNoShow } from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { useAttendanceAlerts } from "../facilities/useLaborSummary";
import { attendanceAlertText } from "./timePay";

type ShiftVersion = { _id: string; version?: number | null };

const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * Time sheet "Needs attention": late clock-ins, people not in yet, missed
 * shifts (with Mark no-show), entries still open, and weeks past 40 hours.
 * Nothing here blocks payroll; it tells the manager what to check.
 */
export function TimeAttentionPanel({
  shifts,
  onFailure,
}: {
  shifts: readonly ShiftVersion[] | undefined;
  onFailure: (error: unknown) => void;
}) {
  const [now, setNow] = useState(minuteNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(minuteNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const view = useAttendanceAlerts(now);
  const markNoShow = useShiftMarkNoShow();
  const [busy, setBusy] = useState<string | null>(null);

  if (!view) return null;
  const { alerts, overtime } = view;
  if (alerts.length === 0 && overtime.length === 0) return null;

  const record = (shiftId: string) => {
    const shift = shifts?.find((row) => row._id === shiftId);
    if (!shift) return;
    setBusy(shiftId);
    Promise.resolve(markNoShow({ docId: shift._id, version: shift.version }))
      .catch(onFailure)
      .finally(() => setBusy(null));
  };

  return (
    <section className="working-ledger" data-testid="time-attention">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Attendance</p>
          <h2>Needs attention</h2>
        </div>
      </div>
      <ul className="grid gap-2 px-1 py-2 text-sm">
        {alerts.map((alert) => (
          <li
            key={`${alert.kind}:${alert.shiftId ?? alert.timeRecordId}`}
            className="flex flex-wrap items-center gap-3"
          >
            <span className={alert.recorded ? "text-ink-2" : "text-warn"}>
              {attendanceAlertText(alert, alert.personName)}
            </span>
            {alert.kind === "no_show" && !alert.recorded && alert.shiftId ? (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy != null}
                onClick={() => record(alert.shiftId!)}
              >
                {busy === alert.shiftId ? "Working…" : "Mark no-show"}
              </button>
            ) : null}
          </li>
        ))}
        {overtime.map((week) => (
          <li
            key={`ot:${week.personId}:${week.weekStartsAt}`}
            className="text-warn"
          >
            {week.personName} has {week.hours} hours in the week of{" "}
            {formatDate(week.weekStartsAt)} — {week.overtimeHours} hours over 40
            are overtime.
          </li>
        ))}
      </ul>
    </section>
  );
}
