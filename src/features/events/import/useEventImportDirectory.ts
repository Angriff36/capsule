import { useMemo } from "react";
import { mapBundleDirectory } from "../../../agent/CapsuleEventBundleDirectoryMapper";
import type { CapsuleEventBundleDirectory } from "../../../agent/CapsuleEventBundleExistingState";
import {
  useListIngredient,
  useListInvoice,
  useListOrganization,
  useListPayment,
  useListPerson,
  useListProposal,
  useListProposalLineItem,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
} from "../../../lib/manifest-convex-react";

/**
 * The tenant directory the browser importer plans against, from the same
 * generated list queries the agent loader reads. Null until every list has
 * arrived, so a plan is never drawn against a half-loaded picture and a
 * re-import of a half-finished bundle adds only what is missing (#241).
 */
export function useEventImportDirectory(): CapsuleEventBundleDirectory | null {
  const organizations = useListOrganization();
  const people = useListPerson();
  const vendors = useListVendor();
  const ingredients = useListIngredient();
  const invoices = useListInvoice();
  const payments = useListPayment();
  const proposals = useListProposal();
  const vendorOrders = useListVendorOrder();
  const proposalLines = useListProposalLineItem();
  const vendorOrderLines = useListVendorOrderLine();

  return useMemo(() => {
    const lists = [
      organizations,
      people,
      vendors,
      ingredients,
      invoices,
      payments,
      proposals,
      vendorOrders,
      proposalLines,
      vendorOrderLines,
    ];
    if (lists.some((list) => list === undefined)) return null;
    return mapBundleDirectory({
      organizations,
      people,
      vendors,
      ingredients,
      invoices,
      payments,
      proposals,
      vendorOrders,
      proposalLines,
      vendorOrderLines,
    });
  }, [
    organizations,
    people,
    vendors,
    ingredients,
    invoices,
    payments,
    proposals,
    vendorOrders,
    proposalLines,
    vendorOrderLines,
  ]);
}
