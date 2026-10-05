import { useMutation, useQuery } from "convex/react";
import { api } from "./api";

/** Authored seam for Convex file storage upload URLs. */
export function useGenerateUploadUrl() {
  return useMutation(api.fileStorage.generateUploadUrl);
}

/** A venue's logo for co-branded proposals (null = none; undefined = loading). */
export function useVenueLogoUrl(venueId: string) {
  return useQuery(api.brandLogo.getVenueLogoUrl, {
    venueId: venueId as never,
  });
}

export function useStorageUrls(storageIds: readonly string[]) {
  const ids = [...new Set(storageIds.filter(Boolean))];
  return useQuery(
    api.fileStorage.urlsForStorageIds,
    ids.length ? { storageIds: ids } : "skip",
  );
}
