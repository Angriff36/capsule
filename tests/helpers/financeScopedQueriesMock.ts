// In-memory stand-in for src/lib/financeScopedQueries.ts in screen tests.
// Each hook returns the seeded rows of its Convex table, filtered the way the
// server filters them (by id, by record, by date window), so a screen test
// seeds whole tables as before and sees only what the screen asks for.
//
// Use from a test:
//   vi.mock("../src/lib/financeScopedQueries", async () =>
//     (await import("./helpers/financeScopedQueriesMock")).financeScopedMock(
//       (table) => seed[table],
//     ),
//   );
type Row = Record<string, unknown>;
type Rows = Row[];
type MaybeId = string | null | undefined;
type Range = { from: number; to: number };

/** Rows of a Convex table (e.g. "invoices", "eventCloseouts"). */
export type TableRows = (table: string) => Rows | undefined;

const live = (rows: Rows) => rows.filter((row) => row.deletedAt == null);

function dateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function inWindow(
  row: Row,
  fields: readonly string[],
  ranges: readonly Range[],
): boolean {
  const at = fields
    .map((field) => dateValue(row[field]))
    .find((value) => value != null);
  return at != null && ranges.some((r) => at >= r.from && at < r.to);
}

const ids = (list: readonly MaybeId[] | undefined) =>
  list === undefined
    ? undefined
    : new Set(list.filter((id): id is string => !!id));

export function financeScopedMock(tableRows: TableRows) {
  const all = (table: string) => live(tableRows(table) ?? []);
  const where = (table: string, field: string, value: MaybeId) =>
    value
      ? all(table).filter((row) => String(row[field]) === value)
      : undefined;
  const whereIn = (
    table: string,
    field: string,
    list: readonly MaybeId[] | undefined,
  ) => {
    const set = ids(list);
    return set === undefined
      ? undefined
      : all(table).filter((row) => set.has(String(row[field])));
  };
  const events = () => all("events");
  const eventsIn = (range: Range | null) =>
    range
      ? events().filter((row) => {
          const at = dateValue(row.startsAt);
          return at == null || (at >= range.from && at < range.to);
        })
      : undefined;
  const dayStart = (day: string, addDays = 0) => {
    const date = new Date(`${day}T00:00:00`);
    date.setDate(date.getDate() + addDays);
    return date.getTime();
  };
  const closeoutsForEventWindow = (range: Range | null) => {
    const rows = eventsIn(range);
    return {
      events: range ? rows : [],
      closeouts: range
        ? whereIn(
            "eventCloseouts",
            "eventId",
            (rows ?? []).map((row) => String(row._id)),
          )
        : [],
    };
  };
  const paged = (table: string, enabled = true) => ({
    rows: enabled ? all(table) : undefined,
    canLoadMore: false,
    loadingMore: false,
    loadMore: () => undefined,
  });

  return {
    LIST_PAGE: 50,
    usePagedRows: paged,
    useAllRowsOnRequest: (table: string, enabled: boolean) =>
      enabled ? all(table) : undefined,
    useWindowRows: (
      table: string,
      window: { fields: string[]; ranges: Range[] } | null,
    ) =>
      window
        ? all(table).filter((row) =>
            inWindow(row, window.fields, window.ranges),
          )
        : undefined,
    useRowsWithEmpty: (table: string, fields: string[] | null) =>
      fields
        ? all(table).filter((row) => fields.every((f) => row[f] == null))
        : undefined,
    useRowsWhere: (
      table: string,
      fieldEquals: { field: string; value: string }[] | null,
    ) =>
      fieldEquals
        ? all(table).filter((row) =>
            fieldEquals.every(({ field, value }) => row[field] === value),
          )
        : undefined,
    useCanReadTable: () => true,
    useInvoicesByIds: (list: readonly MaybeId[] | undefined) =>
      whereIn("invoices", "_id", list),
    useLeadsByIds: (list: readonly MaybeId[] | undefined) =>
      whereIn("leads", "_id", list),
    useClientContactsByIds: (list: readonly MaybeId[] | undefined) =>
      whereIn("clientContacts", "_id", list),
    useProposalsByIds: (list: readonly MaybeId[] | undefined) =>
      whereIn("proposals", "_id", list),
    useInvoicePayments: (id: MaybeId) => where("payments", "invoiceId", id),
    useInvoiceSourceCreditMemos: (id: MaybeId) =>
      where("creditMemos", "sourceInvoiceId", id),
    useClientCreditMemos: (id: MaybeId) => where("creditMemos", "clientId", id),
    useClientInvoices: (id: MaybeId) => where("invoices", "clientId", id),
    useEventInvoices: (id: MaybeId) => where("invoices", "eventId", id),
    useInvoicesInStatuses: (statuses: readonly string[]) =>
      all("invoices").filter((row) => statuses.includes(String(row.status))),
    useInvoicesForEvents: (list: readonly MaybeId[] | undefined) =>
      whereIn("invoices", "eventId", list),
    useCloseoutsForEvents: (list: readonly MaybeId[] | undefined) =>
      whereIn("eventCloseouts", "eventId", list),
    useCloseoutsInStatus: (status: string | null) =>
      status
        ? all("eventCloseouts").filter((row) => row.status === status)
        : undefined,
    useCloseoutsForEventWindow: closeoutsForEventWindow,
    useCloseoutsForEventDays: (startDay: string, endDay: string) =>
      closeoutsForEventWindow(
        startDay && endDay && startDay <= endDay
          ? { from: dayStart(startDay), to: dayStart(endDay, 1) }
          : null,
      ),
    usePayrollReceiptsForPeople: (list: readonly MaybeId[] | undefined) =>
      whereIn("payrollExportRecords", "personId", list),
    useAttributionsForEvents: (list: readonly MaybeId[] | undefined) =>
      whereIn("revenueAttributions", "eventId", list),
    useEventLeftovers: (id: MaybeId) =>
      where("leftoverDispositions", "eventId", id),
    useLeftoversInYear: (year: number) => {
      const rows = all("leftoverDispositions");
      const years = rows
        .map((row) => Number(String(row.dispositionDate ?? "").slice(0, 4)))
        .filter((y) => Number.isInteger(y) && y > 0);
      return {
        rows: rows.filter((row) =>
          String(row.dispositionDate ?? "").startsWith(`${year}-`),
        ),
        firstYear: years.length ? Math.min(...years) : null,
      };
    },
    useCloseoutsInRange: (range: Range | null) =>
      range
        ? all("eventCloseouts").filter((row) =>
            inWindow(row, ["finalizedAt", "capturedAt", "createdAt"], [range]),
          )
        : undefined,
    useLeadsInRange: (range: Range | null) => {
      const leads = range
        ? all("leads").filter((row) => inWindow(row, ["createdAt"], [range]))
        : undefined;
      return {
        leads,
        proposals: whereIn(
          "proposals",
          "_id",
          leads?.map((lead) =>
            lead.proposalId ? String(lead.proposalId) : null,
          ),
        ),
      };
    },
    useAllEventRowsOnRequest: (enabled: boolean) =>
      enabled ? events() : undefined,
    usePaymentsForInvoices: (list: readonly MaybeId[] | undefined) =>
      whereIn("payments", "invoiceId", list),
    useEventRowsInRange: (range: Range | null) => eventsIn(range),
    usePackListsForEvents: (list: readonly MaybeId[] | undefined) =>
      whereIn("packLists", "eventId", list),
    useLeadsForClients: (list: readonly MaybeId[] | undefined) =>
      whereIn("leads", "clientId", list),
    useDatesFrom: (today: string) => ({
      holds: all("dateHolds").filter((row) => String(row.holdDate) >= today),
      waitlist: all("dateWaitlistEntries").filter(
        (row) => String(row.holdDate) >= today,
      ),
    }),
    useMessagesForThreads: (list: readonly MaybeId[] | undefined) =>
      whereIn("messages", "threadId", list),
    useThreadLastMessageAt: (threadIds: readonly string[] | undefined) => {
      if (threadIds === undefined) return undefined;
      const out: Record<string, number> = {};
      for (const id of threadIds) {
        out[id] = all("messages")
          .filter((row) => row.threadId === id)
          .reduce(
            (max, row) =>
              Math.max(max, Number(row.sentAt ?? row.createdAt ?? 0)),
            0,
          );
      }
      return out;
    },
    useProposalSignatureRequests: (id: MaybeId) =>
      where("signatureRequests", "proposalId", id),
    useQuoteSubmissionsInStatuses: (statuses: readonly string[]) =>
      all("quoteSubmissions").filter((row) =>
        statuses.includes(String(row.status)),
      ),
    useProposalLineItems: (id: MaybeId) =>
      where("proposalLineItems", "proposalId", id),
    useProposalDishSelections: (id: MaybeId) =>
      where("proposalDishSelections", "proposalId", id),
    useProposalEnhancements: (id: MaybeId) =>
      where("proposalEnhancements", "proposalId", id),
    useProposalRevisions: (id: MaybeId) =>
      where("proposalRevisions", "proposalId", id),
    useProposalShareLinks: (id: MaybeId) =>
      where("shareLinks", "proposalId", id),
    useEventTimelineActivities: (id: MaybeId) =>
      where("eventTimelineActivities", "eventId", id),
    useEventProposals: (id: MaybeId) => where("proposals", "eventId", id),
    useEventNumberAssignments: (id: MaybeId) =>
      where("eventNumberAssignments", "eventId", id),
    useTastingDishes: (id: MaybeId) => where("tastingDishes", "tastingId", id),
    useClientContactRows: (id: MaybeId) =>
      where("clientContacts", "clientId", id),
    useClientProposals: (id: MaybeId) => where("proposals", "clientId", id),
    useClientContracts: (id: MaybeId) => where("contracts", "clientId", id),
    useReportSnapshotRows: (id: MaybeId) =>
      where("savedReportSnapshots", "savedReportDefinitionId", id),
    useDayHolds: (dateKey: string | null) => ({
      holds: dateKey ? where("dateHolds", "holdDate", dateKey) : undefined,
      waitlist: dateKey
        ? where("dateWaitlistEntries", "holdDate", dateKey)
        : undefined,
    }),
    useReadClientEvents: () => async (clientId: string) =>
      events().filter((row) => String(row.clientId) === clientId),
    useCommunicationsFor: (
      target:
        | { kind: "event"; eventId: string }
        | { kind: "contacts"; contactIds: string[]; clientId?: string | null },
    ) =>
      all("clientCommunications").filter((row) =>
        target.kind === "event"
          ? row.eventId === target.eventId
          : (row.clientContactId != null &&
              target.contactIds.includes(String(row.clientContactId))) ||
            (target.clientId != null && row.clientId === target.clientId),
      ),
    useClientPairHistory: (clientIds: string[]) => {
      const contacts = all("clientContacts").filter((row) =>
        clientIds.includes(String(row.clientId)),
      );
      const pairEvents = events().filter((row) =>
        clientIds.includes(String(row.clientId)),
      );
      const contactIds = new Set(contacts.map((row) => String(row._id)));
      const eventIds = new Set(pairEvents.map((row) => String(row._id)));
      return {
        contacts,
        events: pairEvents,
        communications: all("clientCommunications").filter(
          (row) =>
            clientIds.includes(String(row.clientId)) ||
            contactIds.has(String(row.clientContactId)) ||
            eventIds.has(String(row.eventId)),
        ),
      };
    },
  };
}

/** "invoices" -> "useListInvoice", "dateWaitlistEntries" -> "useListDateWaitlistEntry". */
export function listHookFor(table: string): string {
  const singular = table.endsWith("ies")
    ? `${table.slice(0, -3)}y`
    : table.endsWith("s")
      ? table.slice(0, -1)
      : table;
  return `useList${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;
}

/**
 * For tests on tests/support/mounted-app.ts: a table's rows are the rows the
 * test gives that table's generated list hook (backend.values).
 */
export function fromListHooks(values: Map<string, unknown>): TableRows {
  return (table) => values.get(listHookFor(table)) as Rows | undefined;
}
