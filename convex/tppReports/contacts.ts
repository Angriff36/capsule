import { v } from "convex/values";
import { TPP_CONTACT_REPORTS } from "../../src/features/reports/tpp/catalog.contacts";
import type {
  TppReportResult,
  TppRow,
} from "../../src/features/reports/tpp/types";
import { query, type QueryCtx } from "../_generated/server";
import {
  REPORT_ROW_LIMIT,
  inDateRange,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

const REPORT_IDS = new Set(TPP_CONTACT_REPORTS.map((report) => report.id));

type Parameters = Record<string, string | string[] | boolean | number>;

function title(reportId: string): string {
  return (
    TPP_CONTACT_REPORTS.find((report) => report.id === reportId)?.name ??
    reportId
  );
}

function table(
  reportId: string,
  columns: {
    key: string;
    label: string;
    kind: "text" | "date" | "number" | "money" | "quantity";
  }[],
  rows: TppRow[],
): TppReportResult {
  return {
    kind: "table",
    title: title(reportId),
    columns,
    rows,
    groups: [],
    totals: [],
  };
}

function document(
  reportId: string,
  template: string,
  sections: Extract<TppReportResult, { kind: "document" }>["sections"],
): TppReportResult {
  return { kind: "document", title: title(reportId), template, sections };
}

function clientName(client: {
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}): string {
  return (
    client.companyName ||
    [client.givenName, client.familyName].filter(Boolean).join(" ") ||
    "Unnamed contact"
  );
}

function dateText(value: number | null | undefined): string {
  return value == null ? "" : new Date(value).toLocaleDateString("en-US");
}

async function eventBundle(
  ctx: QueryCtx,
  tenantId: string,
  rawEventId: unknown,
) {
  const eventId =
    typeof rawEventId === "string"
      ? ctx.db.normalizeId("events", rawEventId)
      : null;
  if (!eventId) throw new Error("Choose an event");
  const event = await ctx.db.get(eventId);
  if (!event || !isLiveTenantRow(event, tenantId))
    throw new Error("Event not found");
  const [client, invoices, proposals, contracts, eventDishes] =
    await Promise.all([
      ctx.db.get(event.clientId),
      ctx.db
        .query("invoices")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(20),
      ctx.db
        .query("proposals")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(20),
      ctx.db
        .query("contracts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(20),
      ctx.db
        .query("eventDishes")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(REPORT_ROW_LIMIT),
    ]);
  const dishes = await Promise.all(
    eventDishes.map((item) => ctx.db.get(item.dishId)),
  );
  return {
    event,
    client: client && isLiveTenantRow(client, tenantId) ? client : null,
    invoices: invoices.filter((row) => isLiveTenantRow(row, tenantId)),
    proposals: proposals.filter((row) => isLiveTenantRow(row, tenantId)),
    contracts: contracts.filter((row) => isLiveTenantRow(row, tenantId)),
    menu: eventDishes.flatMap((item, index) => {
      const dish = dishes[index];
      return dish && isLiveTenantRow(dish, tenantId)
        ? [
            {
              name: dish.name,
              course: item.course ?? dish.course ?? "",
              quantity: item.quantityServings,
              notes: item.specialInstructions ?? "",
            },
          ]
        : [];
    }),
  };
}

export const run = query({
  args: { reportId: v.string(), parameters: v.any() },
  handler: async (ctx, args): Promise<TppReportResult> => {
    const tenantId = await requireReportTenant(ctx);
    if (!REPORT_IDS.has(args.reportId))
      throw new Error("Unknown Contacts report");
    const parameters = (args.parameters ?? {}) as Parameters;

    if (
      ["address-phone-list", "birthday-list", "contact-activity"].includes(
        args.reportId,
      )
    ) {
      const clients = (
        await ctx.db
          .query("clients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT)
      ).filter(
        (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
      );
      const filtered =
        args.reportId === "contact-activity"
          ? clients.filter((row) =>
              inDateRange(
                row.createdAt,
                Number(parameters.dateRangeStart ?? 0),
                Number(parameters.dateRangeEnd ?? Number.MAX_SAFE_INTEGER),
              ),
            )
          : clients;
      const rows = filtered.map((client) => ({
        id: client._id,
        values: {
          name: clientName(client),
          address: [
            client.addressLine1,
            client.addressLine2,
            client.city,
            client.region,
            client.postalCode,
          ]
            .filter(Boolean)
            .join(", "),
          phone: client.phone ?? "",
          email: client.email ?? "",
          created: client.createdAt ?? null,
        },
      }));
      if (args.reportId === "birthday-list") {
        return table(
          args.reportId,
          [
            { key: "name", label: "Contact", kind: "text" },
            { key: "birthday", label: "Birthday", kind: "date" },
            { key: "phone", label: "Phone", kind: "text" },
          ],
          [],
        );
      }
      return table(
        args.reportId,
        [
          { key: "name", label: "Contact", kind: "text" },
          { key: "address", label: "Address", kind: "text" },
          { key: "phone", label: "Phone", kind: "text" },
          { key: "email", label: "Email", kind: "text" },
          ...(args.reportId === "contact-activity"
            ? [{ key: "created", label: "Created", kind: "date" as const }]
            : []),
        ],
        rows,
      );
    }

    if (args.reportId === "contact-letter-builder") {
      const clientId =
        typeof parameters.clientId === "string"
          ? ctx.db.normalizeId("clients", parameters.clientId)
          : null;
      const client = clientId ? await ctx.db.get(clientId) : null;
      if (!client || !isLiveTenantRow(client, tenantId))
        throw new Error("Contact not found");
      return document(args.reportId, "contact_letter", [
        { id: "date", rows: [{ value: dateText(Date.now()) }] },
        {
          id: "recipient",
          rows: [
            { value: clientName(client) },
            {
              value: [
                client.addressLine1,
                client.city,
                client.region,
                client.postalCode,
              ]
                .filter(Boolean)
                .join(", "),
            },
          ],
        },
        { id: "body", rows: [{ value: String(parameters.body ?? "") }] },
      ]);
    }

    if (args.reportId === "order-activity-list") {
      const [events, clients] = await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("clients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const clientsById = new Map(
        clients.map((client) => [String(client._id), clientName(client)]),
      );
      const start = Number(parameters.dateRangeStart ?? 0);
      const end = Number(parameters.dateRangeEnd ?? Number.MAX_SAFE_INTEGER);
      return table(
        args.reportId,
        [
          { key: "contact", label: "Contact", kind: "text" },
          { key: "lastOrder", label: "Last ordered", kind: "date" },
          { key: "event", label: "Event", kind: "text" },
          { key: "status", label: "Event status", kind: "text" },
          { key: "type", label: "Event type", kind: "text" },
        ],
        events
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              inDateRange(row.startsAt, start, end),
          )
          .map((row) => ({
            id: row._id,
            values: {
              contact:
                clientsById.get(String(row.clientId)) ??
                row.primaryContactName ??
                "",
              lastOrder: row.startsAt ?? null,
              event: row.title,
              status: row.stage,
              type: row.eventType,
            },
          })),
      );
    }

    const bundle = await eventBundle(ctx, tenantId, parameters.eventId);
    const contact = bundle.client
      ? clientName(bundle.client)
      : (bundle.event.primaryContactName ?? "");
    const eventHeader = [
      { label: "Event", value: bundle.event.title },
      { label: "Date", value: dateText(bundle.event.startsAt) },
      { label: "Contact", value: contact },
      { label: "Venue", value: bundle.event.venueName ?? "" },
      { label: "Guests", value: String(bundle.event.expectedHeadcount) },
    ];

    if (args.reportId === "contact-event-envelope") {
      const lines = bundle.client
        ? [
            contact,
            bundle.client.addressLine1,
            bundle.client.addressLine2,
            [bundle.client.city, bundle.client.region, bundle.client.postalCode]
              .filter(Boolean)
              .join(" "),
          ]
        : [contact, bundle.event.venueAddress];
      return {
        kind: "labels",
        title: title(args.reportId),
        stock: "envelope_10",
        labels: [
          {
            id: bundle.event._id,
            lines: lines.filter((line): line is string => !!line),
          },
        ],
      };
    }

    if (args.reportId === "event-menu" || args.reportId === "packing-slip") {
      return document(args.reportId, args.reportId, [
        { id: "event", heading: "Event", rows: eventHeader },
        {
          id: "menu",
          heading:
            args.reportId === "packing-slip" ? "Packed menu items" : "Menu",
          rows: bundle.menu.map((dish) => ({
            label: dish.course,
            value: `${dish.name}${dish.quantity ? ` — ${dish.quantity} servings` : ""}${dish.notes ? ` — ${dish.notes}` : ""}`,
          })),
        },
      ]);
    }

    if (args.reportId === "invoice-event") {
      const invoice = bundle.invoices.sort(
        (a, b) =>
          (b.issuedAt ?? b.createdAt ?? 0) - (a.issuedAt ?? a.createdAt ?? 0),
      )[0];
      return document(args.reportId, "invoice", [
        { id: "event", heading: "Invoice", rows: eventHeader },
        {
          id: "amounts",
          rows: invoice
            ? [
                { label: "Invoice number", value: invoice.invoiceNumber ?? "" },
                { label: "Subtotal", value: String(invoice.subtotal) },
                { label: "Tax", value: String(invoice.taxAmount) },
                { label: "Discount", value: String(invoice.discountAmount) },
                { label: "Total", value: String(invoice.total) },
                { label: "Paid", value: String(invoice.amountPaid) },
                { label: "Balance due", value: String(invoice.amountDue) },
              ]
            : [{ value: "No invoice has been created for this event." }],
        },
      ]);
    }

    if (args.reportId === "proposal-of-service") {
      const proposal = bundle.proposals.sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      )[0];
      return document(args.reportId, "proposal", [
        { id: "event", heading: "Proposal of Service", rows: eventHeader },
        {
          id: "menu",
          heading: "Menu",
          rows: bundle.menu.map((dish) => ({
            label: dish.course,
            value: dish.name,
          })),
        },
        {
          id: "pricing",
          heading: "Pricing",
          rows: proposal
            ? [
                { label: "Subtotal", value: String(proposal.subtotal) },
                { label: "Tax", value: String(proposal.taxAmount) },
                { label: "Discount", value: String(proposal.discountAmount) },
                { label: "Total", value: String(proposal.total) },
                { label: "Terms", value: proposal.terms ?? "" },
                { label: "Notes", value: proposal.notes ?? "" },
              ]
            : [{ value: "No proposal has been created for this event." }],
        },
      ]);
    }

    if (args.reportId === "contract-for-service") {
      const contract = bundle.contracts.sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      )[0];
      return document(args.reportId, "contract", [
        { id: "event", heading: "Contract for Service", rows: eventHeader },
        {
          id: "terms",
          rows: contract
            ? [
                {
                  label: "Contract",
                  value: contract.contractNumber ?? contract.title,
                },
                { label: "Status", value: contract.status },
                { label: "Expires", value: dateText(contract.expiresAt) },
                { label: "Signed by", value: contract.signedBy ?? "" },
                { label: "Notes", value: contract.notes ?? "" },
              ]
            : [{ value: "No contract has been created for this event." }],
        },
      ]);
    }

    throw new Error(`No Contacts resolver for ${args.reportId}`);
  },
});
