import { useEffect, useState } from "react";
import { formatDate, formatTime } from "../../lib/format";
import { useVendorOrderEmailActions } from "../../lib/vendorOrderEmailActions";

type HistoryItem = Awaited<
  ReturnType<ReturnType<typeof useVendorOrderEmailActions>["getHistory"]>
>[number];

/** Statuses where the order is marked sent and still open. */
const EMAILABLE = new Set(["submitted", "confirmed", "partially_received"]);

function errorWords(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === "string" && data.trim()) return data;
  return "The order email did not go. Send again; if it fails again, tell whoever runs Capsule.";
}

/**
 * "Email the order to the vendor" plus every try so far. Capsule sends the
 * items and amounts to the vendor's dispatch contact (then rep, then any
 * contact, then the vendor's own email). "Taken by the email service" is the
 * most Capsule knows; it does not hear about delivery yet.
 */
export function VendorOrderEmailSection({
  vendorOrderId,
  status,
}: {
  vendorOrderId: string;
  status: string;
}) {
  const { send, getHistory } = useVendorOrderEmailActions();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const emailable = EMAILABLE.has(status);

  useEffect(() => {
    let current = true;
    setLoadFailed(false);
    void getHistory(vendorOrderId)
      .then((rows) => {
        if (current) setItems(rows);
      })
      .catch(() => {
        if (current) setLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [getHistory, vendorOrderId, refreshKey]);

  const emailOrder = async () => {
    setSending(true);
    setNote(null);
    try {
      const result = await send(vendorOrderId);
      setNote(
        result.status === "already_sent"
          ? {
              ok: true,
              words: `This order already went${result.to ? ` to ${result.to}` : ""}${
                result.sentAt
                  ? ` at ${formatTime(result.sentAt)} on ${formatDate(result.sentAt)}`
                  : ""
              }. Change the order to send it again today.`,
            }
          : {
              ok: true,
              words: `Order emailed${result.to ? ` to ${result.to}` : ""}.`,
            },
      );
    } catch (error) {
      setNote({ ok: false, words: errorWords(error) });
    } finally {
      setSending(false);
      setRefreshKey((key) => key + 1);
    }
  };

  return (
    <section className="mt-4" aria-labelledby="vendor-order-email-title">
      <h2 id="vendor-order-email-title" className="text-base font-semibold">
        Email the order to the vendor
      </h2>
      {emailable ? (
        <div className="supply-row-actions mt-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={sending}
            onClick={() => void emailOrder()}
          >
            {sending ? "Sending…" : "Email to vendor"}
          </button>
        </div>
      ) : (
        <p className="field-help">
          {status === "draft" || status === "pending_approval"
            ? "Mark the order sent first, then you can email it to the vendor."
            : "This order is finished, so it is not emailed."}
        </p>
      )}
      {note ? (
        <p
          className={note.ok ? "field-help" : "text-base text-danger"}
          role={note.ok ? "status" : "alert"}
        >
          {note.words}
        </p>
      ) : null}
      {loadFailed ? (
        <p className="mt-2 text-base text-ink-2" role="status">
          Could not load the email list. Reload the page to try again.
        </p>
      ) : items == null ? (
        <p className="mt-2 text-base text-ink-2">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-base text-ink-2">
          This order has not been emailed.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {items.map((item, index) => (
            <li key={`${item.at}-${index}`} className="text-base">
              <span className="text-ink-2">
                {formatDate(item.at)} {formatTime(item.at)}
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
    </section>
  );
}
