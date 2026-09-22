// Client seam for the authored convex/catalogReclassification.ts module. The
// Kitchen feature root may not construct Convex hooks itself (Manifest
// integration guards), so the wrappers live here beside culinaryDemandClient.
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";
import type { ReclassifyKind } from "../../convex/lib/culinaryModel/catalogReclassification";

export const useCatalogReclassificationPlan = () =>
  useQuery(api.catalogReclassification.plan, {});

export function useDecideCatalogReclassification() {
  const mutate = useMutation(api.catalogReclassification.decide);
  return (args: {
    linkIds: string[];
    decision: "approved" | "rejected";
    kind?: ReclassifyKind;
  }) =>
    mutate({
      linkIds: args.linkIds as Id<"externalRecordLinks">[],
      decision: args.decision,
      kind: args.kind,
    });
}

export function useApplyCatalogReclassification() {
  const mutate = useMutation(api.catalogReclassification.apply);
  return (args: { operationKey: string; linkIds: string[] }) =>
    mutate({
      operationKey: args.operationKey,
      linkIds: args.linkIds as Id<"externalRecordLinks">[],
    });
}
