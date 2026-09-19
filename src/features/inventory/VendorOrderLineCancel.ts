import type { ActionPromptSession } from "../../ui/action-prompt";

export type VendorOrderLineRow = {
  _id: string;
  version: number;
  status: string;
};

/** States in which a single line may still be cancelled (Manifest guards). */
const CANCELLABLE_ORDER_STATES = ["draft", "submitted", "confirmed"];
const CANCELLABLE_LINE_STATES = ["added", "receiving"];

export function canCancelVendorOrderLine(
  orderStatus: string,
  lineStatus: string,
): boolean {
  return (
    CANCELLABLE_ORDER_STATES.includes(String(orderStatus)) &&
    CANCELLABLE_LINE_STATES.includes(String(lineStatus))
  );
}

/**
 * Cancel one line of a vendor order. The command releases the quantity the
 * line holds, so it asks for a reason first.
 */
export function cancelVendorOrderLine({
  line,
  itemName,
  prompt,
  run,
  cancelLine,
}: {
  line: VendorOrderLineRow;
  itemName: string;
  prompt: ActionPromptSession;
  run: (key: string, work: () => Promise<void>) => void;
  cancelLine: (args: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
}) {
  void (async () => {
    const reason = await prompt.askReason({
      title: `Cancel the ${itemName} line`,
      description:
        "The line leaves this order and the quantity it holds is released. Add the item again if it comes back.",
      label: "Cancellation reason",
      placeholder: "e.g. Bought from another vendor",
      confirmLabel: "Cancel line",
      tone: "danger",
    });
    if (!reason) return;
    run(`${line._id}:cancel`, async () => {
      await cancelLine({
        docId: line._id,
        version: line.version,
        reason,
      });
    });
  })();
}
