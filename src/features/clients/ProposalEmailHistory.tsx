import { useEffect, useState } from "react";
import { formatDate, formatTime } from "../../lib/format";
import { useProposalEmailHistory } from "../../lib/proposalEmailActions";

type HistoryItem = Awaited<
  ReturnType<ReturnType<typeof useProposalEmailHistory>>
>[number];

/**
 * Every time staff emailed this proposal: who it went to, or why it did not
 * go and what to do. "Taken by the email service" is the most Capsule knows;
 * it does not hear about delivery or bounces yet.
 */
export function ProposalEmailHistory({
  proposalId,
  refreshKey,
}: {
  proposalId: string;
  refreshKey: number;
}) {
  const getHistory = useProposalEmailHistory();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setFailed(false);
    void getHistory(proposalId)
      .then((rows) => {
        if (current) setItems(rows);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [getHistory, proposalId, refreshKey]);

  return (
    <div aria-labelledby={`proposal-emails-${proposalId}`}>
      <h3
        id={`proposal-emails-${proposalId}`}
        className="text-base font-semibold"
      >
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
          This proposal has not been emailed yet.
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
                <span className="field-help-note block">{item.remedy}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
