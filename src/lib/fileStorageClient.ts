import { useMutation, useQuery } from "convex/react";
import { api } from "./api";

/** Authored seam for Convex file storage upload URLs. */
export function useGenerateUploadUrl() {
  return useMutation(api.fileStorage.generateUploadUrl);
}

export function useStorageUrls(storageIds: readonly string[]) {
  const ids = [...new Set(storageIds.filter(Boolean))];
  return useQuery(
    api.fileStorage.urlsForStorageIds,
    ids.length ? { storageIds: ids } : "skip",
  );
}
