import { useEffect, useState } from "react";
import { formatDate, formatTime } from "../../lib/format";
import { useInvoiceReminderActions } from "../../lib/invoiceReminderActions";

type HistoryItem = Awaited<
  ReturnType<ReturnType<typeof useInvoiceReminderActions>["getHistory"]>
>[number];

/**
 * Every invoice email and payment reminder Capsule tried for one invoice: who
 * it went to, what
 * happened, and what to do when it did not go. "Taken by the email service"
 * is the most Capsule knows; it does not hear about delivery or bounces yet.
 */
export function ReminderHistoryList({
  invoiceId,
  refreshKey,
}: {
  invoiceId: string;
  refreshKey: number;
}) {
  const { getHistory } = useInvoiceReminderActions();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setFailed(false);
    void getHistory(invoiceId)
      .then((rows) => {
        if (current) setItems(rows);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [getHistory, invoiceId, refreshKey]);

  return (
    <div className="mt-4" aria-labelledby="reminder-history-title">
      <h3 id="reminder-history-title" className="text-base font-semibold">
        Emails to the client
      </h3>
      {failed ? (
        <p className="mt-2 text-base text-ink-2" role="status">
          Could not load the email list. Reload the page to try again.
        </p>
      ) : items == null ? (
        <p className="mt-2 text-base text-ink-2">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-base text-ink-2">
          No invoice or reminder emails yet.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {items.map((item, index) => (
            <li key={`${item.at}-${index}`} className="text-base">
              <span className="text-ink-2">
                {formatDate(item.at)} {formatTime(item.at)} ·{" "}
                {item.source === "manual" ? "Sent by hand" : "Scheduled"}
                {item.attempt != null && item.attempt > 1
                  ? ` · try ${item.attempt}`
                  : ""}
              </span>
              <br />
              {item.words}
              {item.remedy ? (
                <span className="field-help block">{item.remedy}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
