import { useEffect, useRef } from "react";
import { useLatestCascadeReceipt } from "../../lib/useCascadeReceipt";
import { reportActionOk } from "../../ui/action-result";

/** A receipt older than this is history, not news. */
const FRESH_MS = 60_000;

/**
 * When a step this person just ran on the record set off other records
 * (purchase needs, stock held, a pack list), say so once, with links.
 */
export function useCascadeReceiptToast(recordId: string | null | undefined) {
  const receipt = useLatestCascadeReceipt(recordId);
  const shown = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (receipt === undefined) return;
    const id = receipt?.stepId ?? null;
    // The first answer is what was already there when the page opened.
    if (shown.current === undefined) {
      shown.current = id;
      if (!receipt || Date.now() - receipt.at > FRESH_MS) return;
    }
    if (!receipt || shown.current === id) return;
    shown.current = id;
    reportActionOk(
      `${receipt.text}. Also: ${receipt.summary}.`,
      receipt.groups.flatMap((group) => {
        const href = group.href ?? group.links[0]?.href;
        return href ? [{ label: `${group.count} ${group.label}`, href }] : [];
      }),
    );
  }, [receipt]);
}
