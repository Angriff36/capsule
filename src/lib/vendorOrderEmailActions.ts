import { useAction } from "convex/react";
import { useCallback } from "react";
import { api, type Id } from "./api";

/** Authored "Email the order to the vendor" actions kept outside feature code. */
export function useVendorOrderEmailActions() {
  const sendAction = useAction(api.vendorOrderEmail.send);
  const historyAction = useAction(api.vendorOrderEmail.getHistory);

  const send = useCallback(
    (vendorOrderId: string) =>
      sendAction({ vendorOrderId: vendorOrderId as Id<"vendorOrders"> }),
    [sendAction],
  );
  const getHistory = useCallback(
    (vendorOrderId: string) =>
      historyAction({ vendorOrderId: vendorOrderId as Id<"vendorOrders"> }),
    [historyAction],
  );

  return { send, getHistory };
}
