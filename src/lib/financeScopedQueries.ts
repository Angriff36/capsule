import { useEffect, useMemo } from "react";
import {
  useConvex,
  usePaginatedQuery,
  useQueries,
  useQuery,
  type RequestForQueries,
} from "convex/react";
import { getFunctionName } from "convex/server";
import { api, type Doc, type Id } from "./api";
import type { PagedTable } from "../../convex/financeWindow";
import type { EventLookupRow } from "../../convex/eventLookup";

// Finance, sales, client and report screens read only the rows they show:
// one record's rows through the generated per-record indexes, long lists one
// page at a time (convex/financeWindow.ts), all-time figures only when the
// user asks. Never a company's whole table in one read. Those screens call
// these instead of convex/react (finance features must not import it).

export type { PagedTable };

/** Rows a list screen shows first; "Load more" reads the next page. */
export const LIST_PAGE = 50;

export type PagedRows<T extends PagedTable> = {
  /** Newest first. `undefined` until the first page arrives. */
  rows: Doc<T>[] | undefined;
  /** True while older rows exist that are not loaded yet. */
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

/**
 * One table, newest first, one page at a time. The screen shows the first
 * page; the next page loads only when the user asks (`loadMore`).
 * Nothing is read while `enabled` is false (rows stay `undefined`).
 */
export function usePagedRows<T extends PagedTable>(
  table: T,
  enabled = true,
  pageSize = LIST_PAGE,
): PagedRows<T> {
  const { results, status, loadMore } = usePaginatedQuery(
    api.financeWindow.page,
    enabled ? { table } : "skip",
    { initialNumItems: pageSize },
  );
  return {
    rows:
      !enabled || status === "LoadingFirstPage"
        ? undefined
        : (results as unknown as Doc<T>[]),
    canLoadMore: status === "CanLoadMore" || status === "LoadingMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(pageSize),
  };
}

const ALL_PAGE = 500;

/**
 * Every row of one table, read page by page, ONLY once `enabled` (the user
 * asked for an all-time figure). `undefined` while not enabled or loading.
 */
export function useAllRowsOnRequest<T extends PagedTable>(
  table: T,
  enabled: boolean,
): Doc<T>[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.financeWindow.page,
    enabled ? { table } : "skip",
    { initialNumItems: ALL_PAGE },
  );
  useEffect(() => {
    if (enabled && status === "CanLoadMore") loadMore(ALL_PAGE);
  }, [enabled, status, loadMore]);
  return useMemo(
    () =>
      enabled && status === "Exhausted"
        ? (results as unknown as Doc<T>[])
        : undefined,
    [enabled, results, status],
  );
}

export type DateWindow = {
  /** The row's date is the first of these that is set (issuedAt, createdAt). */
  fields: string[];
  ranges: { from: number; to: number }[];
};

/**
 * The rows of one table whose date is in one of the window's [from, to)
 * ranges, newest first.
 * With an index on those dates the server reads only the window's rows;
 * otherwise it reads page by page and sends only the window's rows.
 * `undefined` until every page is read.
 */
export function useWindowRows<T extends PagedTable>(
  table: T,
  window: DateWindow | null,
): Doc<T>[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.financeWindow.page,
    window ? { table, window } : "skip",
    { initialNumItems: ALL_PAGE },
  );
  useEffect(() => {
    if (window && status === "CanLoadMore") loadMore(ALL_PAGE);
  }, [window, status, loadMore]);
  return useMemo(
    () =>
      window && status === "Exhausted"
        ? (results as unknown as Doc<T>[])
        : undefined,
    [window, results, status],
  );
}

/** Whether this role may read the table at all. */
export function useCanReadTable(table: PagedTable): boolean | undefined {
  return useQuery(api.financeWindow.canReadTable, { table });
}

type GetQuery =
  | typeof api.queries.getInvoice
  | typeof api.queries.getProposal
  | typeof api.queries.getLead
  | typeof api.queries.getClientContact;

/** Records by id, one point read each. `undefined` until all have loaded. */
function useDocsByIds<Row>(
  query: GetQuery,
  ids: readonly MaybeId[] | undefined,
): Row[] | undefined {
  const key =
    ids === undefined
      ? null
      : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
  const requests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const id of key ? key.split(",") : [])
      next[id] = { query, args: { id } };
    return next;
    // `api.queries.x` is a new object on every read, so the name stands in
    // for it; the object itself would rebuild the reads on every draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getFunctionName(query)]);
  const results = useQueries(requests);
  return useMemo(() => {
    if (key === null) return undefined;
    const rows: Row[] = [];
    for (const result of Object.values(results)) {
      if (result === undefined) return undefined;
      if (result instanceof Error) throw result;
      if (result) rows.push(result as Row);
    }
    return rows;
  }, [key, results]);
}

/** Invoices by id (e.g. the ones the shown payments paid). */
export function useInvoicesByIds(ids: readonly MaybeId[] | undefined) {
  return useDocsByIds<Doc<"invoices">>(api.queries.getInvoice, ids);
}

/** Leads by id (e.g. the ones the shown tastings are for). */
export function useLeadsByIds(ids: readonly MaybeId[] | undefined) {
  return useDocsByIds<Doc<"leads">>(api.queries.getLead, ids);
}

/** Client contacts by id (e.g. the ones the shown threads name). */
export function useClientContactsByIds(ids: readonly MaybeId[] | undefined) {
  return useDocsByIds<Doc<"clientContacts">>(api.queries.getClientContact, ids);
}

/** Proposals by id (e.g. the ones the shown leads point at). */
export function useProposalsByIds(ids: readonly MaybeId[] | undefined) {
  return useDocsByIds<Doc<"proposals">>(api.queries.getProposal, ids);
}

type MaybeId = string | null | undefined;

/** Payments on one invoice. `undefined` while loading; skipped without an id. */
export function useInvoicePayments(invoiceId: MaybeId) {
  return useQuery(
    api.queries.listPaymentByInvoiceId,
    invoiceId ? { invoiceId: invoiceId as Id<"invoices"> } : "skip",
  );
}

/** Credit memos issued from one invoice. */
export function useInvoiceSourceCreditMemos(invoiceId: MaybeId) {
  return useQuery(
    api.queries.listCreditMemoBySourceInvoiceId,
    invoiceId ? { sourceInvoiceId: invoiceId as Id<"invoices"> } : "skip",
  );
}

/** One client's credit memos. */
export function useClientCreditMemos(clientId: MaybeId) {
  return useQuery(
    api.queries.listCreditMemoByClientId,
    clientId ? { clientId: clientId as Id<"clients"> } : "skip",
  );
}

/** One client's invoices. */
export function useClientInvoices(clientId: MaybeId) {
  return useQuery(
    api.queries.listInvoiceByClientId,
    clientId ? { clientId: clientId as Id<"clients"> } : "skip",
  );
}

/** One event's invoices. */
export function useEventInvoices(eventId: MaybeId) {
  return useQuery(
    api.queries.listInvoiceByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "overdue"
  | "partial"
  | "paid"
  | "voided"
  | "written_off";

/**
 * Invoices in the given statuses, through the status index (e.g. the open
 * ones: sent, viewed, overdue, partial). `undefined` until all have loaded.
 */
export function useInvoicesInStatuses(statuses: readonly InvoiceStatus[]) {
  const key = statuses.join(",");
  const requests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const status of key ? (key.split(",") as InvoiceStatus[]) : [])
      next[status] = {
        query: api.queries.listInvoiceByTenantIdAndStatus,
        // The server reads the caller's own tenant; this argument is unused.
        args: { tenantId: "", status },
      };
    return next;
  }, [key]);
  const results = useQueries(requests);
  return useMemo(() => {
    const rows: Doc<"invoices">[] = [];
    for (const result of Object.values(results)) {
      if (result === undefined) return undefined;
      if (result instanceof Error) throw result;
      rows.push(...(result as Doc<"invoices">[]));
    }
    return rows;
  }, [results]);
}

type IdQuery =
  | typeof api.queries.listInvoiceByEventId
  | typeof api.queries.listEventCloseoutByEventId
  | typeof api.queries.listRevenueAttributionByEventId
  | typeof api.queries.listEventAssignmentByEventId
  | typeof api.queries.listPayrollInputByEventId
  | typeof api.queries.listLeftoverDispositionByEventId
  | typeof api.queries.listPayrollExportRecordByPersonId
  | typeof api.queries.listPaymentByInvoiceId
  | typeof api.queries.listPackListByEventId
  | typeof api.queries.listLeadByClientId
  | typeof api.queries.listMessageByThreadId
  | typeof api.queries.listSignatureRequestByProposalRevisionId;

/**
 * One indexed read per id (each event's invoices, closeouts...), merged.
 * `undefined` until every read has loaded; ids repeat or blank are ignored.
 */
export function useRowsForEachId<Row extends { _id: string }>(
  query: IdQuery,
  argName: string,
  ids: readonly MaybeId[] | undefined,
): Row[] | undefined {
  const key =
    ids === undefined
      ? null
      : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
  const requests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const id of key ? key.split(",") : [])
      next[id] = { query, args: { [argName]: id } };
    return next;
    // See useDocsByIds: the name, not the new-every-read object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getFunctionName(query), argName]);
  const results = useQueries(requests);
  return useMemo(() => {
    if (key === null) return undefined;
    const byId = new Map<string, Row>();
    for (const result of Object.values(results)) {
      if (result === undefined) return undefined;
      if (result instanceof Error) throw result;
      for (const row of result as Row[]) byId.set(row._id, row);
    }
    return [...byId.values()];
  }, [key, results]);
}

/** Each listed event's invoices. */
export function useInvoicesForEvents(eventIds: readonly MaybeId[] | undefined) {
  return useRowsForEachId<Doc<"invoices">>(
    api.queries.listInvoiceByEventId,
    "eventId",
    eventIds,
  );
}

/** Each listed event's closeouts. */
export function useCloseoutsForEvents(
  eventIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"eventCloseouts">>(
    api.queries.listEventCloseoutByEventId,
    "eventId",
    eventIds,
  );
}

/** Closeouts in one status (draft or finalized), through the status index. */
export function useCloseoutsInStatus(status: "draft" | "finalized" | null) {
  return useQuery(
    api.queries.listEventCloseoutByTenantIdAndStatus,
    // The server reads the caller's own tenant; tenantId is unused.
    status ? { tenantId: "", status } : "skip",
  );
}

/** Local midnight of a yyyy-mm-dd day, as a report's date inputs mean it. */
function dayStart(day: string, addDays = 0): number {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + addDays);
  return date.getTime();
}

/**
 * The closeouts of events that start in [from, to), with those events;
 * undated events come too, since a report dates their closeout by when it
 * was finalized. Only that window is read. `undefined` while loading.
 */
export function useCloseoutsForEventWindow(
  window: { from: number; to: number } | null,
) {
  const range = useQuery(
    api.eventLookup.range,
    window ? { from: window.from, to: window.to, withUndated: true } : "skip",
  );
  const events = !window
    ? []
    : range === undefined
      ? undefined
      : (range?.rows ?? []);
  const closeouts = useCloseoutsForEvents(events?.map((row) => row._id));
  return { events, closeouts: window ? closeouts : [] };
}

/** As useCloseoutsForEventWindow, for two report days (inclusive, local). */
export function useCloseoutsForEventDays(startDay: string, endDay: string) {
  const valid = Boolean(startDay && endDay && startDay <= endDay);
  return useCloseoutsForEventWindow(
    valid ? { from: dayStart(startDay), to: dayStart(endDay, 1) } : null,
  );
}

/** Each listed person's payroll export receipts. */
export function usePayrollReceiptsForPeople(
  personIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"payrollExportRecords">>(
    api.queries.listPayrollExportRecordByPersonId,
    "personId",
    personIds,
  );
}

/** Each listed event's revenue splits. */
export function useAttributionsForEvents(
  eventIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"revenueAttributions">>(
    api.queries.listRevenueAttributionByEventId,
    "eventId",
    eventIds,
  );
}

/** One event's leftover dispositions. */
export function useEventLeftovers(eventId: MaybeId) {
  return useQuery(
    api.queries.listLeftoverDispositionByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

/** One calendar year of leftovers, and the first year any were recorded. */
export function useLeftoversInYear(year: number) {
  return useQuery(api.financeWindow.leftoversInYear, { year });
}

type Range = { from: number; to: number };

/**
 * Closeouts dated in the range, dated as the dashboards date them: when
 * finalized, else captured, else created.
 */
export function useCloseoutsInRange(range: Range | null) {
  return useWindowRows(
    "eventCloseouts",
    range
      ? { fields: ["finalizedAt", "capturedAt", "createdAt"], ranges: [range] }
      : null,
  );
}

/**
 * Leads created in the range, and the proposals they point at (a lead is
 * converted when its proposal was accepted).
 */
export function useLeadsInRange(range: Range | null) {
  const leads = useWindowRows(
    "leads",
    range ? { fields: ["createdAt"], ranges: [range] } : null,
  );
  const proposals = useProposalsByIds(
    leads?.map((lead) => (lead.proposalId ? String(lead.proposalId) : null)),
  );
  return { leads, proposals };
}

/**
 * Every event of the company in light rows (convex/eventLookup.ts
 * `reportPage`), read page by page ONLY once `enabled` (the user asked for
 * an all-time figure). Live events only. `undefined` until then.
 */
export function useAllEventRowsOnRequest(enabled: boolean) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.eventLookup.reportPage,
    enabled ? {} : "skip",
    { initialNumItems: ALL_PAGE },
  );
  useEffect(() => {
    if (enabled && status === "CanLoadMore") loadMore(ALL_PAGE);
  }, [enabled, status, loadMore]);
  return useMemo(
    () =>
      enabled && status === "Exhausted"
        ? results.filter((row) => row.deletedAt == null)
        : undefined,
    [enabled, results, status],
  );
}

/** Each listed invoice's payments. */
export function usePaymentsForInvoices(
  invoiceIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"payments">>(
    api.queries.listPaymentByInvoiceId,
    "invoiceId",
    invoiceIds,
  );
}

/** Live events in [from, to) plus undated ones, light rows (at most 3000). */
export function useEventRowsInRange(range: Range | null) {
  const result = useQuery(
    api.eventLookup.range,
    range ? { from: range.from, to: range.to, withUndated: true } : "skip",
  );
  if (!range) return undefined;
  if (result === undefined) return undefined;
  return result?.rows ?? [];
}

/** Each listed event's pack lists. */
export function usePackListsForEvents(
  eventIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"packLists">>(
    api.queries.listPackListByEventId,
    "eventId",
    eventIds,
  );
}

/**
 * The rows of one table where every listed field is empty (e.g. open leads:
 * closedAt), newest first. The server reads the table page by page and
 * sends only those rows. `undefined` until every page is read.
 */
export function useRowsWithEmpty<T extends PagedTable>(
  table: T,
  emptyFields: string[] | null,
): Doc<T>[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.financeWindow.page,
    emptyFields ? { table, emptyFields } : "skip",
    { initialNumItems: ALL_PAGE },
  );
  useEffect(() => {
    if (emptyFields && status === "CanLoadMore") loadMore(ALL_PAGE);
  }, [emptyFields, status, loadMore]);
  return useMemo(
    () =>
      emptyFields && status === "Exhausted"
        ? (results as unknown as Doc<T>[])
        : undefined,
    [emptyFields, results, status],
  );
}

/** Each listed client's leads. */
export function useLeadsForClients(clientIds: readonly MaybeId[] | undefined) {
  return useRowsForEachId<Doc<"leads">>(
    api.queries.listLeadByClientId,
    "clientId",
    clientIds,
  );
}

/** Date holds and waitlist entries on `today` (yyyy-mm-dd) or later. */
export function useDatesFrom(today: string) {
  return useQuery(api.financeWindow.datesFrom, { today });
}

/** Each listed thread's messages. */
export function useMessagesForThreads(
  threadIds: readonly MaybeId[] | undefined,
) {
  return useRowsForEachId<Doc<"messages">>(
    api.queries.listMessageByThreadId,
    "threadId",
    threadIds,
  );
}

/** When each listed thread last had a message. */
export function useThreadLastMessageAt(
  threadIds: readonly string[] | undefined,
) {
  return useQuery(
    api.financeWindow.threadLastMessageAt,
    threadIds === undefined
      ? "skip"
      : { threadIds: threadIds as Id<"messageThreads">[] },
  );
}

/**
 * One proposal's signature requests, through its sent versions (a request
 * is made against a version).
 */
export function useProposalSignatureRequests(proposalId: MaybeId) {
  const revisions = useQuery(
    api.queries.listProposalRevisionByProposalId,
    proposalId ? { proposalId: proposalId as Id<"proposals"> } : "skip",
  );
  return useRowsForEachId<Doc<"signatureRequests">>(
    api.queries.listSignatureRequestByProposalRevisionId,
    "proposalRevisionId",
    revisions?.map((row) => row._id),
  );
}

/**
 * The rows of one table whose fields hold these texts (e.g. status
 * "pending"), newest first, read page by page; only those rows are sent.
 * `undefined` until every page is read.
 */
export function useRowsWhere<T extends PagedTable>(
  table: T,
  fieldEquals: { field: string; value: string }[] | null,
): Doc<T>[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.financeWindow.page,
    fieldEquals ? { table, fieldEquals } : "skip",
    { initialNumItems: ALL_PAGE },
  );
  useEffect(() => {
    if (fieldEquals && status === "CanLoadMore") loadMore(ALL_PAGE);
  }, [fieldEquals, status, loadMore]);
  return useMemo(
    () =>
      fieldEquals && status === "Exhausted"
        ? (results as unknown as Doc<T>[])
        : undefined,
    [fieldEquals, results, status],
  );
}

export type QuoteSubmissionStatus =
  "pending" | "processing" | "completed" | "failed" | "dismissed";

/** Quote requests in the given statuses, through the status index. */
export function useQuoteSubmissionsInStatuses(
  statuses: readonly QuoteSubmissionStatus[],
) {
  const key = statuses.join(",");
  const requests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const status of key ? (key.split(",") as QuoteSubmissionStatus[]) : [])
      next[status] = {
        query: api.queries.listQuoteSubmissionByTenantIdAndStatus,
        // The server reads the caller's own tenant; this argument is unused.
        args: { tenantId: "", status },
      };
    return next;
  }, [key]);
  const results = useQueries(requests);
  return useMemo(() => {
    const rows: Doc<"quoteSubmissions">[] = [];
    for (const result of Object.values(results)) {
      if (result === undefined) return undefined;
      if (result instanceof Error) throw result;
      rows.push(...(result as Doc<"quoteSubmissions">[]));
    }
    return rows;
  }, [results]);
}

// ---- One record's rows (sales, clients, reports screens) ----

const proposalArgs = (proposalId: MaybeId) =>
  proposalId ? { proposalId: proposalId as Id<"proposals"> } : "skip";

/** One proposal's price lines. */
export function useProposalLineItems(proposalId: MaybeId) {
  return useQuery(
    api.queries.listProposalLineItemByProposalId,
    proposalArgs(proposalId),
  );
}

/** One proposal's dish choices. */
export function useProposalDishSelections(proposalId: MaybeId) {
  return useQuery(
    api.queries.listProposalDishSelectionByProposalId,
    proposalArgs(proposalId),
  );
}

/** One proposal's optional enhancements. */
export function useProposalEnhancements(proposalId: MaybeId) {
  return useQuery(
    api.queries.listProposalEnhancementByProposalId,
    proposalArgs(proposalId),
  );
}

/** One proposal's sent versions. */
export function useProposalRevisions(proposalId: MaybeId) {
  return useQuery(
    api.queries.listProposalRevisionByProposalId,
    proposalArgs(proposalId),
  );
}

/** One proposal's share links. */
export function useProposalShareLinks(proposalId: MaybeId) {
  return useQuery(
    api.queries.listShareLinkByProposalId,
    proposalArgs(proposalId),
  );
}

/** One event's timeline activities. */
export function useEventTimelineActivities(eventId: MaybeId) {
  return useQuery(
    api.queries.listEventTimelineActivityByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

/** One event's proposals. */
export function useEventProposals(eventId: MaybeId) {
  return useQuery(
    api.queries.listProposalByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

/** One event's number assignments. */
export function useEventNumberAssignments(eventId: MaybeId) {
  return useQuery(
    api.queries.listEventNumberAssignmentByEventId,
    eventId ? { eventId } : "skip",
  );
}

/** One tasting's dishes. */
export function useTastingDishes(tastingId: MaybeId) {
  return useQuery(
    api.queries.listTastingDishByTastingId,
    tastingId ? { tastingId: tastingId as Id<"tastings"> } : "skip",
  );
}

const clientArgs = (clientId: MaybeId) =>
  clientId ? { clientId: clientId as Id<"clients"> } : "skip";

/** One client's contacts. */
export function useClientContactRows(clientId: MaybeId) {
  return useQuery(
    api.queries.listClientContactByClientId,
    clientArgs(clientId),
  );
}

/** One client's proposals. */
export function useClientProposals(clientId: MaybeId) {
  return useQuery(api.queries.listProposalByClientId, clientArgs(clientId));
}

/** One client's contracts. */
export function useClientContracts(clientId: MaybeId) {
  return useQuery(api.queries.listContractByClientId, clientArgs(clientId));
}

/** One saved report's snapshots. */
export function useReportSnapshotRows(reportId: MaybeId) {
  return useQuery(
    api.queries.listSavedReportSnapshotBySavedReportDefinitionId,
    reportId
      ? { savedReportDefinitionId: reportId as Id<"savedReportDefinitions"> }
      : "skip",
  );
}

/** One day's date holds and waitlist (holdDate is a yyyy-mm-dd day). */
export function useDayHolds(dateKey: string | null) {
  const holds = useQuery(
    api.queries.listDateHoldByHoldDate,
    dateKey ? { holdDate: dateKey } : "skip",
  );
  const waitlist = useQuery(
    api.queries.listDateWaitlistEntryByHoldDate,
    dateKey ? { holdDate: dateKey } : "skip",
  );
  return { holds, waitlist };
}

/** Reads one client's live events (light rows) when an action needs them. */
export function useReadClientEvents(): (
  clientId: string,
) => Promise<EventLookupRow[]> {
  const convex = useConvex();
  return async (clientId) =>
    (await convex.query(api.eventLookup.byClient, { clientId })) ?? [];
}

/** Merges every result of a set of reads; `undefined` until all have loaded. */
function mergeResults<Row extends { _id: string }>(
  results: Record<string, unknown>,
): Row[] | undefined {
  const byId = new Map<string, Row>();
  for (const result of Object.values(results)) {
    if (result === undefined) return undefined;
    if (result instanceof Error) throw result;
    // A read this role may not make comes back null: nothing to show.
    for (const row of (result ?? []) as Row[]) byId.set(row._id, row);
  }
  return [...byId.values()];
}

export type CommunicationsTarget =
  | { kind: "event"; eventId: string }
  | { kind: "contacts"; contactIds: string[]; clientId?: string | null };

/**
 * Communications for a client's contacts plus those filed on the client
 * itself, or for one event.
 */
export function useCommunicationsFor(target: CommunicationsTarget) {
  const key =
    target.kind === "event"
      ? `event:${target.eventId}`
      : [`client:${target.clientId ?? ""}`, ...target.contactIds].join(",");
  const requests = useMemo(() => {
    const next: RequestForQueries = {};
    const [head, ...ids] = key.split(",");
    if (head.startsWith("event:")) {
      next.event = {
        query: api.queries.listClientCommunicationByEventId,
        args: { eventId: head.slice("event:".length) },
      };
      return next;
    }
    for (const id of ids)
      next[`contact:${id}`] = {
        query: api.queries.listClientCommunicationByClientContactId,
        args: { clientContactId: id },
      };
    const clientId = head.slice("client:".length);
    if (clientId)
      next.client = {
        query: api.queries.listClientCommunicationByClientId,
        args: { clientId },
      };
    return next;
  }, [key]);
  return mergeResults<Doc<"clientCommunications">>(useQueries(requests));
}

/**
 * The contacts, live events and communication history of the clients under
 * review (the duplicate-merge pair): each client's contacts and events, then
 * every note filed on the client, one of its contacts, or one of its events.
 */
export function useClientPairHistory(clientIds: string[]) {
  const pairKey = clientIds.join(",");
  const eventRequests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const clientId of pairKey ? pairKey.split(",") : [])
      next[clientId] = { query: api.eventLookup.byClient, args: { clientId } };
    return next;
  }, [pairKey]);
  const events = mergeResults<EventLookupRow>(useQueries(eventRequests));
  const contactRequests = useMemo(() => {
    const next: RequestForQueries = {};
    for (const clientId of pairKey ? pairKey.split(",") : [])
      next[clientId] = {
        query: api.queries.listClientContactByClientId,
        args: { clientId },
      };
    return next;
  }, [pairKey]);
  const contacts = mergeResults<Doc<"clientContacts">>(
    useQueries(contactRequests),
  );
  const contactKey = (contacts ?? []).map((row) => row._id).join(",");
  const eventKey = (events ?? []).map((row) => row._id).join(",");
  const ready = contacts !== undefined && events !== undefined;
  const communicationRequests = useMemo(() => {
    const next: RequestForQueries = {};
    if (!ready) return next;
    for (const clientId of pairKey ? pairKey.split(",") : [])
      next[`client:${clientId}`] = {
        query: api.queries.listClientCommunicationByClientId,
        args: { clientId },
      };
    for (const id of contactKey ? contactKey.split(",") : [])
      next[`contact:${id}`] = {
        query: api.queries.listClientCommunicationByClientContactId,
        args: { clientContactId: id },
      };
    for (const id of eventKey ? eventKey.split(",") : [])
      next[`event:${id}`] = {
        query: api.queries.listClientCommunicationByEventId,
        args: { eventId: id },
      };
    return next;
  }, [ready, pairKey, contactKey, eventKey]);
  const communications = mergeResults<Doc<"clientCommunications">>(
    useQueries(communicationRequests),
  );
  return {
    contacts,
    events,
    communications: ready ? communications : undefined,
  };
}
