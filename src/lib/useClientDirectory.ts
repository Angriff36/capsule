import { useQuery } from "convex/react";
import { api } from "./api";
import type { Doc } from "./api";

/**
 * Every client with names and status but no locked fields (email, phone,
 * address). Use it where a page needs client names or a picker; read one
 * client with useGetClient for its contact details. The full list opens ten
 * locked fields per client and is too slow for a big client book.
 */
type DirectoryClient = Doc<"clients"> & {
  displayName: string;
  isArchived: boolean;
};

export function useClientDirectory(): DirectoryClient[] | undefined {
  return useQuery(api.clientDirectory.list) as DirectoryClient[] | undefined;
}
