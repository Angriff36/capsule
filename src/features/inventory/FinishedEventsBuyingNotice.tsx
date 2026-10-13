import { useState } from "react";
import {
  useFinishedEventsStillBuying,
  useSettleFinishedEvents,
  useStaleDraftLineCount,
} from "../../lib/purchasingRepairQueries";
import { reportActionFail, reportActionOk } from "../../ui/action-result";

/**
 * Events that finished before Capsule settled their buying at closeout, and
 * draft lines the older code worked out, can make a weekly draft buy food for
 * parties already served. Says so, and on a click settles those events and
 * works every automatic draft line out again. Lines set by hand stay as they
 * are.
 */
export function FinishedEventsBuyingNotice() {
  const events = useFinishedEventsStillBuying();
  const staleLines = useStaleDraftLineCount();
  const settle = useSettleFinishedEvents();
  const [busy, setBusy] = useState(false);
  const eventCount = events?.length ?? 0;
  const lineCount = staleLines ?? 0;
  if (eventCount === 0 && lineCount === 0) return null;
  const names = (events ?? [])
    .slice(0, 3)
    .map((row) => row.title)
    .join(", ");
  const more = eventCount > 3 ? ` and ${eventCount - 3} more` : "";
  return (
    <div
      className="mt-4 rounded-sm border border-warn/40 bg-warn-soft p-4"
      role="status"
    >
      <p className="font-medium">
        {eventCount > 0
          ? eventCount === 1
            ? "1 finished event still counts in this week's buying."
            : `${eventCount} finished events still count in this week's buying.`
          : `${lineCount} draft line${lineCount === 1 ? " is" : "s are"} out of date.`}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {eventCount > 0
          ? `${names}${more}. Their food is already served, so the draft buys too much until they are settled.`
          : "Their amounts were worked out before the current events and stock; the draft may buy too much or too little."}{" "}
        Lines you set by hand are not changed.
      </p>
      <button
        type="button"
        className="btn btn-primary mt-3"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void settle({})
            .then((result) =>
              reportActionOk(
                `Settled ${result.events} finished event${result.events === 1 ? "" : "s"} and worked out ${result.lines} draft line${result.lines === 1 ? "" : "s"} again.`,
              ),
            )
            .catch((error) =>
              reportActionFail(
                error instanceof Error
                  ? error.message
                      .replace(/^.*ConvexError: /, "")
                      .split("\n")[0]!
                  : "Couldn't update the drafts.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy
          ? "Working…"
          : eventCount > 0
            ? "Settle finished events"
            : "Work the drafts out again"}
      </button>
    </div>
  );
}
