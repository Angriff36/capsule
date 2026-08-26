import { useMutation } from "convex/react";
import { api } from "./api";

/** Authored seam for Convex file storage upload URLs. */
export function useGenerateUploadUrl() {
  return useMutation(api.fileStorage.generateUploadUrl);
}
