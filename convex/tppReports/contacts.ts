import { v } from "convex/values";
import { TPP_CONTACT_REPORTS } from "../../src/features/reports/tpp/catalog.contacts";
import type {
  TppDocumentSection,
  TppReportResult,
  TppRow,
} from "../../src/features/reports/tpp/types";
import { query, type QueryCtx } from "../_generated/server";
import { getAuthContext } from "../lib/authContext";
import { canRead } from "../search";
import { formatMoneyExact } from "../../src/lib/format";
import {
  REPORT_ROW_LIMIT,
  keepReportRows,
  reportHandler,
  decryptReportFields,
  inDateRange,
  isLiveTenantRow,
  requireReportTenant,
  resolveReportEventVenue,
} from "./shared";

const REPORT_IDS = new Set(TPP_CONTACT_REPORTS.map((report) => report.id));

type Parameters = Record<string, string | string[] | boolean | number>;

// Generated read policies (convex/queries.ts) of the records these reports
// show. A report opens only for a caller who may read its main records; data
// joined in from other records shows only when the caller may read those too.
const CLIENT_READ = ["salesAccess", "financeAccess"];
const EVENT_READ = ["staffAccess"];
const DISH_READ = ["kitchenAccess", "salesAccess", "manageAccess"];
const VENUE_READ = ["eventAccess"];
const INVOICE_READ = ["financeAccess", "manageAccess"];
const PROPOSAL_READ = ["salesAccess"];
const CONTRACT_READ = ["salesAccess"];
const TIMELINE_READ = ["staffAccess"];
const CLIENT_REPORTS = new Set([
  "address-phone-list",
  "birthday-list",
  "contact-activity",
  "contact-letter-builder",
]);

/** Every read policy the report's main records need (all must pass). */
function reportReads(reportId: string): string[][] {
  if (CLIENT_REPORTS.has(reportId)) return [CLIENT_READ];
  if (reportId === "event-menu" || reportId === "packing-slip")
    return [EVENT_READ, DISH_READ];
  if (reportId === "invoice-event") return [EVENT_READ, INVOICE_READ];
  if (reportId === "proposal-of-service") return [EVENT_READ, PROPOSAL_READ];
  if (reportId === "contract-for-service") return [EVENT_READ, CONTRACT_READ];
  return [EVENT_READ];
}

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
  return value == null
    ? ""
    : new Date(value).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** "entree" prints as "Entree", like the courses typed with a capital. */
function courseLabel(course: string | null | undefined): string {
  const text = (course ?? "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** "YYYY-MM-DD" → epoch ms at UTC noon, so no zone shifts the calendar day. */
function birthdayEpoch(birthday: string | null | undefined): number | null {
  const match = birthday?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), 12);
}

/** Clients with a birthday on file, in calendar order (month, then day). */
function birthdayRows(
  clients: Array<{
    _id: string;
    companyName?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    phone?: string | null;
    birthday?: string | null;
  }>,
): TppRow[] {
  return clients
    .flatMap((client) => {
      const birthday = birthdayEpoch(client.birthday);
      return birthday === null ? [] : [{ client, birthday }];
    })
    .sort((a, b) => {
      const aDate = new Date(a.birthday);
      const bDate = new Date(b.birthday);
      return (
        aDate.getUTCMonth() - bDate.getUTCMonth() ||
        aDate.getUTCDate() - bDate.getUTCDate()
      );
    })
    .map(({ client, birthday }) => ({
      id: client._id,
      values: {
        name: clientName(client),
        birthday,
        phone: client.phone ?? "",
      },
    }));
}

/**
 * The company's logo, printed name and address, as the letter and contract
 * head. Null when the company has none of them.
 */
async function companyHeading(
  ctx: QueryCtx,
  tenantId: string,
): Promise<TppDocumentSection | null> {
  const organizations = await ctx.db
    .query("organizations")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .take(10);
  const organization =
    organizations.find(
      (row) => row.deletedAt == null && row.status === "active",
    ) ?? organizations.find((row) => row.deletedAt == null);
  const rows = [
    organization?.brandDisplayName?.trim() || organization?.name?.trim() || "",
    organization?.brandAddress?.trim() ?? "",
  ]
    .filter(Boolean)
    .map((value) => ({ value }));
  const storageId = organization?.brandLogoStorageId;
  const logoId =
    typeof storageId === "string" && storageId
      ? ctx.db.system.normalizeId("_storage", storageId)
      : null;
  const logoUrl = logoId ? await ctx.storage.getUrl(logoId) : null;
  if (rows.length === 0 && !logoUrl) return null;
  return { id: "company", rows, ...(logoUrl ? { logoUrl } : {}) };
}

/** The kitchen's own time zone, so printed times match the event clock. */
async function kitchenTimeZone(
  ctx: QueryCtx,
  tenantId: string,
  locationId: string | null | undefined,
): Promise<string | undefined> {
  const locations = await ctx.db
    .query("operatingLocations")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .take(50);
  const live = locations.filter((row) => row.deletedAt == null && row.timeZone);
  const zone = (
    live.find((row) => String(row._id) === String(locationId)) ??
    live.find((row) => row.status === "active")
  )?.timeZone;
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

async function eventBundle(
  ctx: QueryCtx,
  tenantId: string,
  rawEventId: unknown,
  see: { clients: boolean; venues: boolean; dishes: boolean },
) {
  const eventId =
    typeof rawEventId === "string"
      ? ctx.db.normalizeId("events", rawEventId)
      : null;
  if (!eventId) throw new Error("Choose an event");
  const eventRaw = await ctx.db.get(eventId);
  if (!eventRaw || !isLiveTenantRow(eventRaw, tenantId))
    throw new Error("Event not found");
  const plainEvent = await decryptReportFields(
    ctx,
    "Event",
    ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
    eventRaw,
  );
  // The event's own venue snapshot is event data; filling it from the Venue
  // record follows the venue read policy.
  const event = see.venues
    ? await resolveReportEventVenue(ctx, tenantId, plainEvent)
    : plainEvent;
  const [client, invoices, proposals, contracts, eventDishes] =
    await Promise.all([
      see.clients && event.clientId ? ctx.db.get(event.clientId) : null,
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
        .take(REPORT_ROW_LIMIT + 1)
        .then(keepReportRows(ctx, "event dishes")),
    ]);
  const menuLines = see.dishes
    ? eventDishes.filter((row) => isLiveTenantRow(row, tenantId))
    : [];
  const dishes = await Promise.all(
    menuLines.map((item) => ctx.db.get(item.dishId)),
  );
  const plainClient =
    client && isLiveTenantRow(client, tenantId)
      ? await decryptReportFields(
          ctx,
          "Client",
          [
            "email",
            "phone",
            "addressLine1",
            "addressLine2",
            "city",
            "region",
            "postalCode",
            "countryCode",
          ],
          client,
        )
      : null;
  return {
    event,
    client: plainClient,
    invoices: invoices.filter((row) => isLiveTenantRow(row, tenantId)),
    proposals: proposals.filter((row) => isLiveTenantRow(row, tenantId)),
    contracts: contracts.filter((row) => isLiveTenantRow(row, tenantId)),
    menu: menuLines.flatMap((item, index) => {
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
  handler: reportHandler(async (ctx, args): Promise<TppReportResult> => {
    const tenantId = await requireReportTenant(ctx);
    if (!REPORT_IDS.has(args.reportId))
      throw new Error("Unknown Contacts report");
    const auth = await getAuthContext(ctx);
    if (!reportReads(args.reportId).every((read) => canRead(auth, read)))
      throw new Error(
        "Your role can't open this report. Ask someone who works with these records to run it.",
      );
    const seeClients = canRead(auth, CLIENT_READ);
    const parameters = (args.parameters ?? {}) as Parameters;

    if (
      ["address-phone-list", "birthday-list", "contact-activity"].includes(
        args.reportId,
      )
    ) {
      const rawClients = (
        await ctx.db
          .query("clients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT + 1)
          .then(keepReportRows(ctx, "clients"))
      ).filter(
        (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
      );
      const clients = await Promise.all(
        rawClients.map((client) =>
          decryptReportFields(
            ctx,
            "Client",
            [
              "email",
              "phone",
              "addressLine1",
              "addressLine2",
              "city",
              "region",
              "postalCode",
              "countryCode",
              "birthday",
            ],
            client,
          ),
        ),
      );
      if (args.reportId === "birthday-list") {
        return table(
          args.reportId,
          [
            { key: "name", label: "Contact", kind: "text" },
            { key: "birthday", label: "Birthday", kind: "date" },
            { key: "phone", label: "Phone", kind: "text" },
          ],
          birthdayRows(clients),
        );
      }
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
      const clientRaw = clientId ? await ctx.db.get(clientId) : null;
      if (!clientRaw || !isLiveTenantRow(clientRaw, tenantId))
        throw new Error("Contact not found");
      const client = await decryptReportFields(
        ctx,
        "Client",
        [
          "email",
          "phone",
          "addressLine1",
          "addressLine2",
          "city",
          "region",
          "postalCode",
          "countryCode",
        ],
        clientRaw,
      );
      const said = (key: string) => {
        const value = parameters[key];
        return typeof value === "string" ? value.trim() : "";
      };
      // Lines the writer left empty are left out of the letter.
      const lines = (rows: { label?: string; value: string }[]) =>
        rows.filter((row) => row.value !== "");
      const company =
        parameters.showCompanyInfo !== false
          ? await companyHeading(ctx, tenantId)
          : null;
      const letterDate =
        parameters.noLetterDate === true
          ? ""
          : new Date(
              typeof parameters.letterDate === "number"
                ? parameters.letterDate
                : Date.now(),
            ).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
      const sections: TppDocumentSection[] = [
        { id: "date", rows: lines([{ value: letterDate }]) },
        {
          id: "recipient",
          rows: lines([
            { value: clientName(client) },
            {
              value: [
                client.addressLine1,
                client.addressLine2,
                [client.city, client.region, client.postalCode]
                  .filter(Boolean)
                  .join(" "),
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ]),
        },
        {
          id: "reference",
          rows: lines([
            { label: "Ref", value: said("ref") },
            { label: "Attn", value: said("attn") },
            { label: "Subject", value: said("subject") },
          ]),
        },
        {
          id: "body",
          rows: lines([
            { value: said("salutation") },
            { value: String(parameters.body ?? "") },
            { value: said("closing") },
          ]),
        },
        {
          id: "sender",
          rows: lines([
            { value: said("senderName") },
            { value: said("senderTitle") },
            { value: said("senderCompany") },
          ]),
        },
        { id: "cc", rows: lines([{ label: "CC", value: said("cc") }]) },
      ];
      return document(args.reportId, "contact_letter", [
        ...(company ? [company] : []),
        ...sections.filter((section) => section.rows.length > 0),
      ]);
    }

    if (args.reportId === "order-activity-list") {
      const [events, clients] = await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT + 1)
          .then(keepReportRows(ctx, "events")),
        seeClients
          ? ctx.db
              .query("clients")
              .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
              .take(REPORT_ROW_LIMIT + 1)
              .then(keepReportRows(ctx, "clients"))
          : [],
      ]);
      const plainEvents = await Promise.all(
        events.map((event) =>
          decryptReportFields(
            ctx,
            "Event",
            [
              "primaryContactName",
              "primaryContactEmail",
              "primaryContactPhone",
            ],
            event,
          ),
        ),
      );
      const clientsById = new Map(
        clients
          .filter((client) => isLiveTenantRow(client, tenantId))
          .map((client) => [String(client._id), clientName(client)]),
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
        plainEvents
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

    const bundle = await eventBundle(ctx, tenantId, parameters.eventId, {
      clients: seeClients,
      venues: canRead(auth, VENUE_READ),
      dishes: canRead(auth, DISH_READ),
    });
    const contact = bundle.client
      ? clientName(bundle.client)
      : (bundle.event.primaryContactName ?? "");
    const eventHeader = [
      { label: "Event", value: bundle.event.title },
      { label: "Date", value: dateText(bundle.event.startsAt) },
      { label: "Contact", value: contact },
      {
        label: "Venue",
        value: [bundle.event.venueName, bundle.event.venueAddress]
          .filter(Boolean)
          .join(" · "),
      },
      {
        label: "Guests",
        value: String(bundle.event.expectedHeadcount ?? "Not recorded"),
      },
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
            label: courseLabel(dish.course),
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
                {
                  label: "Subtotal",
                  value: formatMoneyExact(invoice.subtotal),
                },
                { label: "Tax", value: formatMoneyExact(invoice.taxAmount) },
                {
                  label: "Discount",
                  value: formatMoneyExact(invoice.discountAmount),
                },
                { label: "Total", value: formatMoneyExact(invoice.total) },
                { label: "Paid", value: formatMoneyExact(invoice.amountPaid) },
                {
                  label: "Balance due",
                  value: formatMoneyExact(invoice.amountDue),
                },
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
            label: courseLabel(dish.course),
            value: dish.name,
          })),
        },
        {
          id: "pricing",
          heading: "Pricing",
          rows: proposal
            ? [
                {
                  label: "Subtotal",
                  value: formatMoneyExact(proposal.subtotal),
                },
                { label: "Tax", value: formatMoneyExact(proposal.taxAmount) },
                {
                  label: "Discount",
                  value: formatMoneyExact(proposal.discountAmount),
                },
                { label: "Total", value: formatMoneyExact(proposal.total) },
                { label: "Terms", value: proposal.terms ?? "" },
                { label: "Notes", value: proposal.notes ?? "" },
              ]
            : bundle.event.quotedPrice
              ? [
                  {
                    label: "Quoted price",
                    value: formatMoneyExact(bundle.event.quotedPrice),
                  },
                  { value: "Tax is added on the invoice." },
                ]
              : [{ value: "No price on this event yet." }],
        },
      ]);
    }

    if (args.reportId === "contract-for-service") {
      const contract = bundle.contracts.sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      )[0];
      // The old system's contract printout: company head, who it is for and
      // the event facts, the timeline, then the terms with initial lines.
      const proposal = canRead(auth, PROPOSAL_READ)
        ? bundle.proposals.sort(
            (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
          )[0]
        : undefined;
      const event = bundle.event;
      const [company, zone, timeline] = await Promise.all([
        companyHeading(ctx, tenantId),
        kitchenTimeZone(ctx, tenantId, event.operatingLocationId),
        canRead(auth, TIMELINE_READ)
          ? ctx.db
              .query("eventTimelineActivities")
              .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
              .take(REPORT_ROW_LIMIT + 1)
              .then(keepReportRows(ctx, "timeline steps"))
          : null,
      ]);
      const when = (value: number, options: Intl.DateTimeFormatOptions) =>
        new Date(value).toLocaleString("en-US", { ...options, timeZone: zone });
      const client = bundle.client;
      const filled = (rows: { label: string; value: string }[]) =>
        rows.filter((row) => row.value.trim() !== "");
      const timelineRows = (timeline ?? [])
        .filter((row) => isLiveTenantRow(row, tenantId))
        .sort(
          (a, b) =>
            (a.startsAt ?? Number.MAX_SAFE_INTEGER) -
              (b.startsAt ?? Number.MAX_SAFE_INTEGER) ||
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        )
        .map((row) => ({
          label:
            row.startsAt == null
              ? ""
              : when(row.startsAt, { hour: "numeric", minute: "2-digit" }),
          value: [
            row.name,
            row.responsibleParty ?? row.assigneeTeams?.join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
        }));
      const total = proposal?.total ?? event.quotedPrice;
      return document(args.reportId, "contract", [
        ...(company ? [company] : []),
        {
          id: "event",
          heading: "Contract for Service",
          rows: filled([
            { label: "Prepared for", value: contact },
            {
              label: "Address",
              value: client
                ? [
                    client.addressLine1,
                    client.addressLine2,
                    [client.city, client.region, client.postalCode]
                      .filter(Boolean)
                      .join(" "),
                  ]
                    .filter(Boolean)
                    .join("\n")
                : "",
            },
            {
              label: "Phone",
              value: client?.phone ?? event.primaryContactPhone ?? "",
            },
            {
              label: "Email",
              value: client?.email ?? event.primaryContactEmail ?? "",
            },
            {
              label: "Contract #",
              value: contract?.contractNumber ?? event.eventNumber ?? "",
            },
            {
              label: "Event date",
              value:
                event.startsAt == null
                  ? ""
                  : when(event.startsAt, {
                      month: "numeric",
                      day: "numeric",
                      year: "numeric",
                      weekday: "long",
                    }),
            },
            { label: "Event title", value: event.title },
            {
              label: "Guest count",
              value:
                event.expectedHeadcount == null
                  ? ""
                  : String(event.expectedHeadcount),
            },
            { label: "Service style", value: event.serviceStyleName ?? "" },
            { label: "Occasion", value: event.occasionName ?? "" },
            { label: "Salesperson", value: event.ownerName ?? "" },
            {
              label: "Event total",
              value:
                // No priced proposal yet: leave the line off, never "$0.00".
                total == null || total <= 0
                  ? ""
                  : total.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    }),
            },
            {
              label: "Venue",
              value: event.venueAddress?.startsWith(event.venueName ?? "\0")
                ? event.venueAddress
                : [event.venueName, event.venueAddress]
                    .filter(Boolean)
                    .join("\n"),
            },
            {
              label: "Last change",
              value:
                event.updatedAt == null
                  ? ""
                  : when(event.updatedAt, {
                      month: "numeric",
                      day: "numeric",
                      year: "numeric",
                    }),
            },
          ]),
        },
        ...(timelineRows.length > 0
          ? [{ id: "timeline", heading: "Timeline", rows: timelineRows }]
          : []),
        {
          id: "menu-review",
          heading: "Menu review",
          rows: [
            {
              value:
                "I have reviewed my menu in detail and the menu displayed is correct. I understand that what is listed is what will be provided at my event.",
            },
            { label: "Initial", value: "________________" },
          ],
        },
        {
          id: "terms",
          heading: "Terms",
          rows: [
            {
              value:
                proposal?.terms?.trim() ||
                "No terms written yet. Put your standard terms on the event's proposal (or its proposal template).",
            },
            ...(contract?.notes?.trim()
              ? [{ label: "Notes", value: contract.notes.trim() }]
              : []),
            { label: "Client initial", value: "________________" },
          ],
        },
        {
          id: "contract",
          heading: "Contract",
          rows: contract
            ? filled([
                {
                  label: "Contract",
                  value: contract.contractNumber ?? contract.title,
                },
                { label: "Status", value: contract.status },
                { label: "Expires", value: dateText(contract.expiresAt) },
                { label: "Signed by", value: contract.signedBy ?? "" },
              ])
            : [{ value: "No contract has been created for this event." }],
        },
      ]);
    }

    throw new Error(`No Contacts resolver for ${args.reportId}`);
  }),
});
