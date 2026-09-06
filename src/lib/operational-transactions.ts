import { useMutation } from "convex/react";
import { api } from "./api";

export const useIssueEventStock = () =>
  useMutation(api.lib.operationalTransactions.issueEventStock);

export const useReorderEventTimeline = () =>
  useMutation(api.lib.operationalTransactions.reorderEventTimeline);

export const useMaterializeEventMenuTemplate = () =>
  useMutation(api.lib.operationalTransactions.materializeEventMenuTemplate);
