import { useConvex, useQuery } from "convex/react";
import { api } from "./api";
import type { Doc, Id } from "./api";

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

/**
 * Every client with names, status, email and phone (no address). For pages
 * that search or show how to reach every client.
 */
export function useClientContacts(): DirectoryClient[] | undefined {
  return useQuery(api.clientDirectory.listWithContacts) as
    DirectoryClient[] | undefined;
}

/** Reads one client with its contact details at the moment an action needs them. */
export function useReadClient(): (
  id: string,
) => Promise<Doc<"clients"> | null> {
  const convex = useConvex();
  return (id) =>
    convex.query(api.queries.getClient, { id: id as Id<"clients"> });
}
