import { useEffect, useRef } from "react";
import { formatMoneyExact } from "../../lib/format";
import {
  TRAVEL_FEE_LINE_DESCRIPTION,
  travelFeeNote,
} from "../../lib/travelFee";
import { useEventTravelFee } from "../../lib/useTravelFee";
import type { InvoiceLineDraft } from "./invoiceTax";

/** Line id for an event's travel fee, so it is never added twice. */
export const travelFeeLineId = (eventId: string) => `travel-${eventId}`;

/**
 * The event's travel & delivery fee as an invoice line. Added on its own the
 * first time the event is chosen; finance can still change or remove it, and
 * a removed line can be put back with one tap.
 */
export function InvoiceTravelFee({
  eventId,
  lines,
  onAdd,
}: {
  readonly eventId: string;
  readonly lines: readonly InvoiceLineDraft[];
  readonly onAdd: (line: InvoiceLineDraft) => void;
}) {
  const fee = useEventTravelFee(eventId || null);
  const autoAdded = useRef(new Set<string>());
  const present = lines.some((line) => line.id === travelFeeLineId(eventId));
  const line: InvoiceLineDraft | null =
    eventId && fee && fee.fee > 0
      ? {
          id: travelFeeLineId(eventId),
          description: TRAVEL_FEE_LINE_DESCRIPTION,
          category: "service",
          quantity: 1,
          unitPrice: fee.fee,
        }
      : null;

  useEffect(() => {
    if (!line || present || autoAdded.current.has(eventId)) return;
    autoAdded.current.add(eventId);
    onAdd(line);
  }, [eventId, line, present, onAdd]);

  if (!line || !fee) return null;
  const note = travelFeeNote(fee);
  return (
    <div
      className="field-hint flex flex-wrap items-center gap-2"
      data-testid="invoice-travel-fee"
    >
      <span>
        Travel & delivery fee for this event: {formatMoneyExact(fee.fee)}
        {note ? ` (${note})` : ""}
        {present ? " — on this invoice." : "."}
      </span>
      {!present ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onAdd(line)}
        >
          Add to the bill
        </button>
      ) : null}
    </div>
  );
}
