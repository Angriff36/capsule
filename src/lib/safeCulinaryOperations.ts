import { useMutation } from "convex/react";
import { api } from "./api";

export const useCloneMenuSafely = () =>
  useMutation(api.lib.culinaryOperations.cloneMenu);

export const useImportComponentSafely = () =>
  useMutation(api.lib.culinaryOperations.importComponent);

export const useRestoreComponentSnapshotSafely = () =>
  useMutation(api.lib.culinaryOperations.restoreComponentSnapshot);
