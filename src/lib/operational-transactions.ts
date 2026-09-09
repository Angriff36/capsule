import { useMutation } from "convex/react";
export const useApplyCateringPackage = () =>
  useMutation(api.lib.operationalTransactions.applyCateringPackage);
import { api } from "./api";

export const useIssueEventStock = () =>
  useMutation(api.lib.operationalTransactions.issueEventStock);

export const useReorderEventTimeline = () =>
  useMutation(api.lib.operationalTransactions.reorderEventTimeline);

export const useMaterializeEventMenuTemplate = () =>
  useMutation(api.lib.operationalTransactions.materializeEventMenuTemplate);
