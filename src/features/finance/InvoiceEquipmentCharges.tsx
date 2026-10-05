import { formatMoneyExact } from "../../lib/format";
import { useEventEquipmentExceptions } from "../facilities/equipmentCheckout";
import type { InvoiceLineDraft } from "./invoiceTax";

type ClientCharge = {
  issueId: string;
  description: string;
  payer: string;
  chargeAmount: number | null;
};

/** Line id for one equipment charge, so the same charge is never added twice. */
export const equipmentChargeLineId = (issueId: string) =>
  `equipment-${issueId}`;

/**
 * PL-RETURNS (AC-551): equipment problems the office decided the client pays
 * for (broken, lost, late) offered as lines on this event's invoice. Finance
 * adds them with one tap and can still change or remove each line; nothing
 * is added on its own.
 */
export function InvoiceEquipmentCharges({
  eventId,
  lines,
  onAdd,
}: {
  readonly eventId: string;
  readonly lines: readonly InvoiceLineDraft[];
  readonly onAdd: (lines: InvoiceLineDraft[]) => void;
}) {
  const data = useEventEquipmentExceptions(eventId || null);
  if (!eventId || data == null) return null;
  const present = new Set(lines.map((line) => line.id));
  const charges = (data.problems as ClientCharge[]).filter(
    (row) =>
      row.payer === "client" &&
      Number(row.chargeAmount ?? 0) > 0 &&
      !present.has(equipmentChargeLineId(String(row.issueId))),
  );
  if (charges.length === 0) return null;
  const total = charges.reduce(
    (sum, row) => sum + Number(row.chargeAmount ?? 0),
    0,
  );
  return (
    <div
      className="field-hint flex flex-wrap items-center gap-2"
      data-testid="invoice-equipment-charges"
    >
      <span>
        {charges.length === 1
          ? "1 equipment charge"
          : `${charges.length} equipment charges`}{" "}
        for this event ({formatMoneyExact(total)}) are marked for the client to
        pay.
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          onAdd(
            charges.map((row) => ({
              id: equipmentChargeLineId(String(row.issueId)),
              description: `Equipment: ${row.description}`,
              category: "rental",
              quantity: 1,
              unitPrice: Number(row.chargeAmount),
            })),
          )
        }
      >
        Add to the bill
      </button>
    </div>
  );
}
