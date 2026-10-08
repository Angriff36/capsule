import { useMemo } from "react";
import { mapBundleDirectory } from "../../../agent/CapsuleEventBundleDirectoryMapper";
import type { CapsuleEventBundleDirectory } from "../../../agent/CapsuleEventBundleExistingState";
import {
  useListIngredient,
  useListOrganization,
  useListPerson,
  useListProposal,
  useListVendor,
  useListVendorOrder,
} from "../../../lib/manifest-convex-react";
import { useImportDirectoryRows } from "../../../lib/useEventAreaRows";

/**
 * The tenant directory the browser importer plans against, from the same
 * generated list queries the agent loader reads. Null until every list has
 * arrived, so a plan is never drawn against a half-loaded picture and a
 * re-import of a half-finished bundle adds only what is missing (#241).
 *
 * The plans look records up by the bundle's number (bundleIdentity): the
 * invoice with that number and its payments, the proposal with that number,
 * and the orders numbered TPP-<number>-…. Only those invoices, payments and
 * the matched proposals' and orders' lines are read, not every one the
 * company has. Null while there is no bundle.
 */
export function useEventImportDirectory(
  identity: string | null,
): CapsuleEventBundleDirectory | null {
  const organizations = useListOrganization();
  const people = useListPerson();
  const vendors = useListVendor();
  const ingredients = useListIngredient();
  // No index by proposal or order number yet: these two stay whole lists.
  const proposals = useListProposal();
  const vendorOrders = useListVendorOrder();
  const proposalIds = useMemo(
    () =>
      identity === null || proposals === undefined
        ? undefined
        : proposals
            .filter((row) => row.proposalNumber === identity)
            .map((row) => String(row._id)),
    [identity, proposals],
  );
  const vendorOrderIds = useMemo(
    () =>
      identity === null || vendorOrders === undefined
        ? undefined
        : vendorOrders
            .filter((row) =>
              String(row.orderNumber ?? "").startsWith(`TPP-${identity}-`),
            )
            .map((row) => String(row._id)),
    [identity, vendorOrders],
  );
  const rows = useImportDirectoryRows(identity, proposalIds, vendorOrderIds);

  return useMemo(() => {
    const lists = [
      organizations,
      people,
      vendors,
      ingredients,
      proposals,
      vendorOrders,
      rows,
    ];
    if (lists.some((list) => list === undefined)) return null;
    return mapBundleDirectory({
      organizations,
      people,
      vendors,
      ingredients,
      invoices: rows?.invoices,
      payments: rows?.payments,
      proposals,
      vendorOrders,
      proposalLines: rows?.proposalLines,
      vendorOrderLines: rows?.vendorOrderLines,
    });
  }, [
    organizations,
    people,
    vendors,
    ingredients,
    proposals,
    vendorOrders,
    rows,
  ]);
}
