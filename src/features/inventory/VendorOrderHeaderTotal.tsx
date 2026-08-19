import { formatMoneyExact } from "../../lib/format";
import {
  vendorOrderHeaderTotal,
  type VendorOrderLineMoneySource,
  type VendorOrderMoneySource,
} from "./vendorOrderTotals";

/** Folio masthead amount. Locked by the received-PO $100 header test. */
export function VendorOrderHeaderTotal({
  order,
  lines,
}: {
  order: VendorOrderMoneySource;
  lines?: readonly VendorOrderLineMoneySource[] | null;
}) {
  return (
    <strong data-testid="vendor-order-header-total">
      {formatMoneyExact(vendorOrderHeaderTotal(order, lines))}
    </strong>
  );
}
