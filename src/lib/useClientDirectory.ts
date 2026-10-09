import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { useMemo, useRef } from "react";
import { api } from "./api";
import type { Doc, Id } from "./api";

/**
 * Every client with names and status but no locked fields (email, phone,
 * address). Use it where a page needs client names or a picker; read one
 * client with useGetClient for its contact details. The full list opens ten
 * locked fields per client and is too slow for a big client book.
 */
export type DirectoryClient = Doc<"clients"> & {
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
export function useClientContacts(
  enabled = true,
): DirectoryClient[] | undefined {
  return useQuery(
    api.clientDirectory.listWithContacts,
    enabled ? {} : "skip",
  ) as DirectoryClient[] | undefined;
}

/** Reads one client with its contact details at the moment an action needs them. */
export function useReadClient(): (
  id: string,
) => Promise<Doc<"clients"> | null> {
  const convex = useConvex();
  return (id) =>
    convex.query(api.queries.getClient, { id: id as Id<"clients"> });
}

/** These clients only (names, no locked fields). "skip" or [] reads nothing. */
export function useClientsByIds(
  ids: readonly (string | null | undefined)[] | "skip",
): DirectoryClient[] | undefined {
  const key =
    ids === "skip"
      ? null
      : [...new Set(ids.filter((id): id is string => Boolean(id)))]
          .sort()
          .join(",");
  const args = useMemo(() => (key ? { ids: key.split(",") } : "skip"), [key]);
  const rows = useQuery(api.clientDirectory.byIds, args) as
    DirectoryClient[] | undefined;
  return key === "" ? [] : rows;
}

/** Clients matching the typed text (at most 25); newest ones with no text. */
export function useClientSearch(
  text: string,
  options: { withContacts?: boolean; enabled?: boolean } = {},
): DirectoryClient[] | undefined {
  const enabled = options.enabled !== false;
  const rows = useQuery(
    api.clientDirectory.search,
    enabled ? { text, withContacts: options.withContacts } : "skip",
  ) as DirectoryClient[] | undefined;
  // Keep the last answer while the next search runs, so the list does not
  // empty out on each key.
  const last = useRef<DirectoryClient[] | undefined>(undefined);
  if (!enabled) last.current = undefined;
  else if (rows !== undefined) last.current = rows;
  return last.current;
}

/** The client book 50 at a time, newest first, with email and phone. */
export function useClientContactsPage(enabled = true) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.clientDirectory.contactsPage,
    enabled ? {} : "skip",
    { initialNumItems: 50 },
  );
  return {
    rows:
      !enabled || status === "LoadingFirstPage"
        ? undefined
        : (results as DirectoryClient[]),
    canLoadMore: status === "CanLoadMore" || status === "LoadingMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(50),
  };
}
