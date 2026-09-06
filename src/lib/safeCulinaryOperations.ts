import { useMutation } from "convex/react";
import { api } from "./api";

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
