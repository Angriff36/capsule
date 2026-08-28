import { useQuery } from "convex/react";
import { api } from "../../lib/api";

/**
 * Photos and files attached to one parent record. Lives here, not in the
 * feature that renders them: event features may not construct Convex hooks
 * directly (event-manifest integration guard).
 */
export function useParentPhotos(parentType: "eventRecord", parentId: string) {
  return useQuery(api.fileStorage.listForParent, { parentType, parentId });
}
