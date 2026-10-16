import { useEffect, useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "./api";

/** The parallel-run menu check, counted on the server. */
export function useMenuLinkStats() {
  return useQuery(api.externalRecordLinkLists.menuLinkStats, {});
}

/** One page of imported rows still waiting. Show more asks for the next page. */
export function useImportQueue(sourceSystem: string | null) {
  return usePaginatedQuery(
    api.externalRecordLinkLists.queuePage,
    { sourceSystem: sourceSystem ?? undefined },
    { initialNumItems: 50 },
  );
}

/**
 * Every old payment, page by page, only after the person runs the money
 * check. The spreadsheet text is not included.
 */
export function usePaymentMoneyWhen(enabled: boolean) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.externalRecordLinkLists.paymentMoneyPage,
    enabled ? {} : "skip",
    { initialNumItems: 200 },
  );
  useEffect(() => {
    if (enabled && status === "CanLoadMore") loadMore(200);
  }, [enabled, status, loadMore]);
  return useMemo(
    () => (enabled && status === "Exhausted" ? results : undefined),
    [enabled, status, results],
  );
}
