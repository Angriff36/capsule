import { useMutation, useQuery } from "convex/react";
import { api } from "./api";

// Finished events whose buying still counts on a weekly draft, automatic
// draft lines whose amount is out of date, and the step that settles both
// (convex/purchasingRepair.ts). `undefined` while loading.
export const useFinishedEventsStillBuying = () =>
  useQuery(api.purchasingRepair.finishedEventsStillBuying, {});

export const useStaleDraftLineCount = () =>
  useQuery(api.purchasingRepair.staleDraftLineCount, {});

export const useSettleFinishedEvents = () =>
  useMutation(api.purchasingRepair.settleFinishedEvents);
