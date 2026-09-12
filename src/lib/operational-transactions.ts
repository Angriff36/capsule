import { useMutation, useQuery } from "convex/react";
import type { Id } from "./api";
export const useApplyCateringPackage = () =>
  useMutation(api.lib.operationalTransactions.applyCateringPackage);
import { api } from "./api";

export const useIssueEventStock = () =>
  useMutation(api.lib.operationalTransactions.issueEventStock);

export const useReorderEventTimeline = () =>
  useMutation(api.lib.operationalTransactions.reorderEventTimeline);

export const useScheduleEventTimeline = () =>
  useMutation(api.lib.operationalTransactions.scheduleEventTimeline);

export const useEventTimingPlan = (eventId: Id<"events">) =>
  useQuery(api.lib.operationalTransactions.eventTimingPlan, { eventId });

export const useMaterializeEventMenuTemplate = () =>
  useMutation(api.lib.operationalTransactions.materializeEventMenuTemplate);
