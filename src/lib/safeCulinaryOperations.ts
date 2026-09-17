import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";

export const useCloneMenuSafely = () =>
  useMutation(api.lib.culinaryOperations.cloneMenu);

export const useImportComponentSafely = () =>
  useMutation(api.lib.culinaryOperations.importComponent);

/** Durable recipe-review persistence (one governed transaction per call). */
export const useCreateComponentImportReview = () =>
  useMutation(api.lib.culinaryOperations.createComponentImportReview);

export const useSaveComponentImportReview = () =>
  useMutation(api.lib.culinaryOperations.saveComponentImportReview);

export const useRestoreComponentSnapshotSafely = () =>
  useMutation(api.lib.culinaryOperations.restoreComponentSnapshot);

/** The server reconciles stored work groups through generated prep commands. */
export const useReconcileEventPrepWork = () =>
  useMutation(api.lib.culinaryOperations.reconcileEventPrepWorkBalance);

export const useEventPrepWorkReview = (eventId: string) =>
  useQuery(api.lib.culinaryOperations.eventPrepWorkReview, {
    eventId: eventId as Id<"events">,
  });
