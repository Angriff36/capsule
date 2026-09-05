import { v } from "convex/values";
import { TPP_EVENT_REPORTS } from "../../src/features/reports/tpp/catalog.event";
import type {
  TppColumn,
  TppReportResult,
  TppRow,
} from "../../src/features/reports/tpp/types";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  REPORT_ROW_LIMIT,
  decryptReportFields,
  inDateRange,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

const REPORT_IDS = new Set(TPP_EVENT_REPORTS.map((report) => report.id));
type Parameters = Record<string, string | string[] | boolean | number>;

function reportTitle(reportId: string): string {
  return (
    TPP_EVENT_REPORTS.find((report) => report.id === reportId)?.name ?? reportId
  );
}
function table(
  reportId: string,
  columns: TppColumn[],
  rows: TppRow[],
): TppReportResult {
  return {
    kind: "table",
    title: reportTitle(reportId),
    columns,
    rows,
    groups: [],
    totals: [],
  };
}
function dateText(value: number | null | undefined): string {
  return value == null ? "" : new Date(value).toLocaleString("en-US");
}
function range(parameters: Parameters): [number, number] {
  return [
    Number(parameters.dateRangeStart ?? 0),
    Number(parameters.dateRangeEnd ?? Number.MAX_SAFE_INTEGER),
  ];
}

async function eventsInRange(
  ctx: QueryCtx,
  tenantId: string,
  parameters: Parameters,
) {
  const [start, end] = range(parameters);
  const events = (
    await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(REPORT_ROW_LIMIT)
  ).filter(
    (event) =>
      isLiveTenantRow(event, tenantId) &&
      inDateRange(event.startsAt, start, end),
  );
  return await Promise.all(
    events.map((event) =>
      decryptReportFields(
        ctx,
        "Event",
        ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
        event,
      ),
    ),
  );
}

async function selectedEvent(
  ctx: QueryCtx,
  tenantId: string,
  parameters: Parameters,
) {
  const eventId =
    typeof parameters.eventId === "string"
      ? ctx.db.normalizeId("events", parameters.eventId)
      : null;
  const eventRaw = eventId ? await ctx.db.get(eventId) : null;
  if (!eventRaw || !isLiveTenantRow(eventRaw, tenantId))
    throw new Error("Choose an event");
  return await decryptReportFields(
    ctx,
    "Event",
    ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
    eventRaw,
  );
}

async function eventMenu(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const eventDishes = (
    await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(REPORT_ROW_LIMIT)
  ).filter((row) => isLiveTenantRow(row, tenantId) && row.removedAt == null);
  const dishes = await Promise.all(
    eventDishes.map((row) => ctx.db.get(row.dishId)),
  );
  return eventDishes.flatMap((item, index) => {
    const dish = dishes[index];
    return dish && isLiveTenantRow(dish, tenantId) ? [{ item, dish }] : [];
  });
}

function eventRows(events: Doc<"events">[]): TppRow[] {
  return events.map((event) => ({
    id: event._id,
    values: {
      date: event.startsAt ?? null,
      event: event.title,
      status: event.stage,
      invoice: "",
      contact: event.primaryContactName ?? "",
      guests: event.expectedHeadcount,
      venue: event.venueName ?? "",
      address: event.venueAddress ?? "",
      type: event.eventType,
      changed: event.updatedAt ?? event.createdAt ?? null,
    },
  }));
}

const EVENT_COLUMNS: TppColumn[] = [
  { key: "date", label: "Event date", kind: "date" },
  { key: "event", label: "Event", kind: "text" },
  { key: "status", label: "Status", kind: "text" },
  { key: "invoice", label: "Invoice number", kind: "text" },
  { key: "contact", label: "Contact", kind: "text" },
  { key: "guests", label: "Guests", kind: "number" },
  { key: "venue", label: "Venue", kind: "text" },
];

export const run = query({
  args: { reportId: v.string(), parameters: v.any() },
  handler: async (ctx, args): Promise<TppReportResult> => {
    const tenantId = await requireReportTenant(ctx);
    if (!REPORT_IDS.has(args.reportId)) throw new Error("Unknown Event report");
    const parameters = (args.parameters ?? {}) as Parameters;

    if (args.reportId === "contact-worksheet-blank") {
      return {
        kind: "document",
        title: reportTitle(args.reportId),
        template: "contact_worksheet_blank",
        sections: [
          {
            id: "contact",
            heading: "Contact",
            rows: [
              { label: "Name", value: "" },
              { label: "Company", value: "" },
              { label: "Phone", value: "" },
              { label: "Email", value: "" },
              { label: "Address", value: "" },
            ],
          },
          {
            id: "event",
            heading: "Event",
            rows: [
              { label: "Date", value: "" },
              { label: "Occasion", value: "" },
              { label: "Guest count", value: "" },
              { label: "Venue", value: "" },
              { label: "Notes", value: "" },
            ],
          },
        ],
      };
    }

    if (
      [
        "event-changes",
        "event-list",
        "event-schedule",
        "event-delivery-addresses",
        "event-tasks-notes",
      ].includes(args.reportId)
    ) {
      const events = await eventsInRange(ctx, tenantId, parameters);
      if (args.reportId === "event-delivery-addresses") {
        const deliveries = await ctx.db
          .query("deliveries")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT);
        const eventIds = new Set(events.map((event) => String(event._id)));
        return table(
          args.reportId,
          [
            { key: "date", label: "Delivery date", kind: "date" },
            { key: "event", label: "Event", kind: "text" },
            { key: "destination", label: "Delivery address", kind: "text" },
            { key: "window", label: "Delivery window", kind: "text" },
            { key: "status", label: "Status", kind: "text" },
          ],
          deliveries
            .filter(
              (row) =>
                isLiveTenantRow(row, tenantId) &&
                eventIds.has(String(row.eventId)),
            )
            .map((row) => {
              const event = events.find((item) => item._id === row.eventId);
              return {
                id: row._id,
                values: {
                  date: row.windowStartsAt ?? event?.startsAt ?? null,
                  event: event?.title ?? "",
                  destination: row.destination,
                  window: `${dateText(row.windowStartsAt)} – ${dateText(row.windowEndsAt)}`,
                  status: row.status,
                },
              };
            }),
        );
      }
      if (args.reportId === "event-tasks-notes") {
        const activities = await ctx.db
          .query("eventTimelineActivities")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT);
        const eventById = new Map(
          events.map((event) => [String(event._id), event]),
        );
        return table(
          args.reportId,
          [
            { key: "date", label: "Date", kind: "date" },
            { key: "event", label: "Event", kind: "text" },
            { key: "task", label: "Task / note", kind: "text" },
            { key: "responsible", label: "Responsible", kind: "text" },
          ],
          activities
            .filter(
              (row) =>
                isLiveTenantRow(row, tenantId) &&
                eventById.has(String(row.eventId)),
            )
            .map((row) => ({
              id: row._id,
              values: {
                date: row.startsAt ?? null,
                event: eventById.get(String(row.eventId))?.title ?? "",
                task: `${row.name}${row.notes ? ` — ${row.notes}` : ""}`,
                responsible:
                  row.responsibleParty ?? row.assigneeTeams?.join(", ") ?? "",
              },
            })),
        );
      }
      const columns =
        args.reportId === "event-changes"
          ? [
              ...EVENT_COLUMNS,
              { key: "changed", label: "Last changed", kind: "date" as const },
            ]
          : EVENT_COLUMNS;
      return table(args.reportId, columns, eventRows(events));
    }

    if (["invoice-number-history", "staff-schedules"].includes(args.reportId)) {
      const events = await eventsInRange(ctx, tenantId, parameters);
      const eventById = new Map(
        events.map((event) => [String(event._id), event]),
      );
      if (args.reportId === "invoice-number-history") {
        const invoices = await ctx.db
          .query("invoices")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT);
        return table(
          args.reportId,
          [
            { key: "invoice", label: "Invoice number", kind: "text" },
            { key: "date", label: "Issued", kind: "date" },
            { key: "event", label: "Event", kind: "text" },
            { key: "status", label: "Status", kind: "text" },
            { key: "total", label: "Total", kind: "money" },
          ],
          invoices
            .filter(
              (row) =>
                isLiveTenantRow(row, tenantId) &&
                row.eventId &&
                eventById.has(String(row.eventId)),
            )
            .map((row) => ({
              id: row._id,
              values: {
                invoice: row.invoiceNumber ?? "",
                date: row.issuedAt ?? null,
                event: row.eventId
                  ? (eventById.get(String(row.eventId))?.title ?? "")
                  : "",
                status: row.status,
                total: row.total,
              },
            })),
        );
      }
      const [shifts, people] = await Promise.all([
        ctx.db
          .query("shifts")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("people")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const peopleById = new Map(
        people.map((person) => [
          String(person._id),
          `${person.givenName} ${person.familyName}`,
        ]),
      );
      return table(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "staff", label: "Staff member", kind: "text" },
          { key: "role", label: "Role", kind: "text" },
          { key: "starts", label: "Starts", kind: "date" },
          { key: "ends", label: "Ends", kind: "date" },
          { key: "status", label: "Status", kind: "text" },
        ],
        shifts
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              row.eventId &&
              eventById.has(String(row.eventId)),
          )
          .map((row) => ({
            id: row._id,
            values: {
              event: row.eventId
                ? (eventById.get(String(row.eventId))?.title ?? "")
                : "",
              staff: peopleById.get(String(row.personId)) ?? "",
              role: row.role ?? "",
              starts: row.startsAt ?? null,
              ends: row.endsAt ?? null,
              status: row.status,
            },
          })),
      );
    }

    if (
      [
        "beverage-order-list-by-vendor",
        "miscellaneous-order-list-by-vendor",
        "other-inventory-order-list-by-vendor",
        "rental-order-list-by-vendor",
        "order-list",
        "master-food-production-worksheet",
      ].includes(args.reportId)
    ) {
      const events = await eventsInRange(ctx, tenantId, parameters);
      const eventById = new Map(
        events.map((event) => [String(event._id), event]),
      );
      const [needs, ingredients, vendors] = await Promise.all([
        ctx.db
          .query("purchaseNeeds")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("ingredients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("vendors")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const ingredientById = new Map(
        ingredients.map((item) => [String(item._id), item]),
      );
      const vendorById = new Map(
        vendors.map((vendor) => [String(vendor._id), vendor.name]),
      );
      let rows: TppRow[] = needs
        .filter(
          (row) =>
            isLiveTenantRow(row, tenantId) &&
            eventById.has(String(row.eventId)) &&
            row.status !== "cancelled",
        )
        .map((row) => ({
          id: row._id,
          values: {
            vendor: row.preferredVendorId
              ? (vendorById.get(String(row.preferredVendorId)) ?? "Unassigned")
              : "Unassigned",
            item: ingredientById.get(String(row.ingredientId))?.name ?? "",
            category:
              ingredientById.get(String(row.ingredientId))?.category ?? "",
            quantity: row.requiredQuantity,
            unit: row.unit,
            event: eventById.get(String(row.eventId))?.title ?? "",
            due: row.purchasingWeekStart ?? null,
            status: row.status,
          },
        }));
      if (args.reportId === "beverage-order-list-by-vendor")
        rows = rows.filter((row) =>
          /beverage|drink|wine|beer|liquor/i.test(String(row.values.category)),
        );
      if (args.reportId === "miscellaneous-order-list-by-vendor")
        rows = rows.filter((row) =>
          /misc|floral|entertainment|service/i.test(
            String(row.values.category),
          ),
        );
      if (args.reportId === "other-inventory-order-list-by-vendor")
        rows = rows.filter((row) =>
          /supply|disposable|other|inventory/i.test(
            String(row.values.category),
          ),
        );
      if (args.reportId === "rental-order-list-by-vendor") {
        const [reservations, equipment] = await Promise.all([
          ctx.db
            .query("equipmentReservations")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("equipments")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
        ]);
        const equipmentById = new Map(
          equipment.map((item) => [String(item._id), item]),
        );
        rows = reservations
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              eventById.has(String(row.eventId)) &&
              equipmentById.get(String(row.equipmentId))?.ownership ===
                "rented",
          )
          .map((row) => ({
            id: row._id,
            values: {
              vendor: "Rental",
              item: equipmentById.get(String(row.equipmentId))?.name ?? "",
              category:
                equipmentById.get(String(row.equipmentId))?.category ?? "",
              quantity: row.quantity,
              unit: "each",
              event: eventById.get(String(row.eventId))?.title ?? "",
              due: row.startsAt ?? null,
              status: row.status,
            },
          }));
      }
      return table(
        args.reportId,
        [
          { key: "vendor", label: "Vendor", kind: "text" },
          { key: "item", label: "Item", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "quantity", label: "Quantity", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "event", label: "Event", kind: "text" },
          { key: "due", label: "Needed", kind: "date" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows,
      );
    }

    const event = await selectedEvent(ctx, tenantId, parameters);
    if (args.reportId === "event-booking")
      return table(args.reportId, EVENT_COLUMNS, eventRows([event]));
    const menu = await eventMenu(ctx, tenantId, event._id);
    const header = [
      { label: "Event", value: event.title },
      { label: "Date", value: dateText(event.startsAt) },
      { label: "Contact", value: event.primaryContactName ?? "" },
      { label: "Venue", value: event.venueName ?? "" },
      { label: "Guests", value: String(event.expectedHeadcount) },
      { label: "Status", value: event.stage },
    ];

    if (
      [
        "event-menu-item-labels",
        "heating-serving-labels",
        "menu-item-table-tents",
      ].includes(args.reportId)
    ) {
      return {
        kind: "labels",
        title: reportTitle(args.reportId),
        stock:
          args.reportId === "event-menu-item-labels"
            ? "avery_5163"
            : args.reportId === "heating-serving-labels"
              ? "avery_5160"
              : "table_tent",
        labels: menu.map(({ item, dish }) => ({
          id: item._id,
          lines:
            args.reportId === "event-menu-item-labels"
              ? [
                  event.title,
                  dateText(event.startsAt),
                  event.primaryContactName ?? "",
                  dish.name,
                ]
              : args.reportId === "heating-serving-labels"
                ? [
                    dish.name,
                    item.specialInstructions ?? dish.description ?? "",
                  ]
                : [dish.name, dish.description ?? ""],
        })),
      };
    }

    if (
      [
        "event-beo",
        "event-timeline",
        "event-worksheet",
        "heating-serving-event-menu",
      ].includes(args.reportId)
    ) {
      const [timeline, assignments, reservations, equipment] =
        await Promise.all([
          ctx.db
            .query("eventTimelineActivities")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("eventAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("equipmentReservations")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("equipments")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
        ]);
      const equipmentById = new Map(
        equipment.map((item) => [String(item._id), item.name]),
      );
      return {
        kind: "document",
        title: reportTitle(args.reportId),
        template: args.reportId,
        sections: [
          {
            id: "event",
            heading:
              args.reportId === "event-beo" ? "Banquet Event Order" : "Event",
            rows: header,
          },
          {
            id: "menu",
            heading:
              args.reportId === "heating-serving-event-menu"
                ? "Heating and serving"
                : "Menu",
            rows: menu.map(({ item, dish }) => ({
              label: item.course ?? dish.course ?? "",
              value: `${dish.name}${item.specialInstructions ? ` — ${item.specialInstructions}` : ""}`,
            })),
          },
          {
            id: "timeline",
            heading: "Timeline",
            rows: timeline
              .filter((row) => isLiveTenantRow(row, tenantId))
              .sort(
                (a, b) =>
                  (a.startsAt ?? a.sortOrder ?? 0) -
                  (b.startsAt ?? b.sortOrder ?? 0),
              )
              .map((row) => ({
                label: dateText(row.startsAt),
                value: `${row.name}${row.notes ? ` — ${row.notes}` : ""}`,
              })),
          },
          {
            id: "staff",
            heading: "Staffing",
            rows: assignments
              .filter((row) => isLiveTenantRow(row, tenantId))
              .map((row) => ({
                label: row.role,
                value: `${dateText(row.startsAt)} – ${dateText(row.endsAt)}${row.notes ? ` — ${row.notes}` : ""}`,
              })),
          },
          {
            id: "equipment",
            heading: "Equipment",
            rows: reservations
              .filter(
                (row) =>
                  isLiveTenantRow(row, tenantId) && row.status !== "cancelled",
              )
              .map((row) => ({
                label:
                  equipmentById.get(String(row.equipmentId)) ?? "Equipment",
                value: `${row.quantity}`,
              })),
          },
          {
            id: "notes",
            heading: "Notes",
            rows: [
              { value: event.serviceRequirements ?? "" },
              { value: event.operationalRequirements ?? "" },
            ],
          },
        ],
      };
    }

    if (
      [
        "event-menu-item-production",
        "production-summary",
        "kitchen-labor",
      ].includes(args.reportId)
    ) {
      const prep = await ctx.db
        .query("prepTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(REPORT_ROW_LIMIT);
      return table(
        args.reportId,
        [
          { key: "item", label: "Menu item / task", kind: "text" },
          { key: "quantity", label: "Quantity", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "station", label: "Station", kind: "text" },
          { key: "due", label: "Due", kind: "date" },
          { key: "status", label: "Status", kind: "text" },
          { key: "notes", label: "Kitchen notes", kind: "text" },
        ],
        prep
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) && row.status !== "cancelled",
          )
          .map((row) => ({
            id: row._id,
            values: {
              item: row.name,
              quantity: row.quantity,
              unit: row.unit,
              station: row.station ?? row.category,
              due: row.dueAt ?? null,
              status: row.status,
              notes: row.specialInstructions ?? row.notes ?? "",
            },
          })),
      );
    }

    if (args.reportId === "equipment-summary") {
      const [reservations, equipment] = await Promise.all([
        ctx.db
          .query("equipmentReservations")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("equipments")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const byId = new Map(equipment.map((item) => [String(item._id), item]));
      return table(
        args.reportId,
        [
          { key: "item", label: "Equipment", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "quantity", label: "Quantity", kind: "quantity" },
          { key: "ownership", label: "Owned / rented", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        reservations
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) && row.status !== "cancelled",
          )
          .map((row) => ({
            id: row._id,
            values: {
              item: byId.get(String(row.equipmentId))?.name ?? "",
              category: byId.get(String(row.equipmentId))?.category ?? "",
              quantity: row.quantity,
              ownership: byId.get(String(row.equipmentId))?.ownership ?? "",
              status: row.status,
            },
          })),
      );
    }

    if (args.reportId === "pack-list") {
      const lists = await ctx.db
        .query("packLists")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(20);
      const listIds = new Set(lists.map((list) => String(list._id)));
      const items = await ctx.db
        .query("packListItems")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      return table(
        args.reportId,
        [
          { key: "item", label: "Item", kind: "text" },
          { key: "required", label: "Required", kind: "quantity" },
          { key: "packed", label: "Packed", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        items
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              listIds.has(String(row.packListId)),
          )
          .map((row) => ({
            id: row._id,
            values: {
              item: row.description,
              required: row.requiredQuantity,
              packed: row.packedQuantity,
              unit: row.unit,
              status: row.status,
            },
          })),
      );
    }

    if (args.reportId === "shopping-list") {
      const [demands, ingredients] = await Promise.all([
        ctx.db
          .query("ingredientDemands")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("ingredients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const byId = new Map(
        ingredients.map((item) => [String(item._id), item.name]),
      );
      return table(
        args.reportId,
        [
          { key: "item", label: "Ingredient / beverage", kind: "text" },
          { key: "quantity", label: "Needed", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        demands
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) && row.status !== "superseded",
          )
          .map((row) => ({
            id: row._id,
            values: {
              item: byId.get(String(row.ingredientId)) ?? "",
              quantity: row.requiredQuantity,
              unit: row.unit,
              status: row.status,
            },
          })),
      );
    }

    if (args.reportId === "menu-item-recipes") {
      const dishIds = new Set(menu.map(({ dish }) => String(dish._id)));
      const lines = await ctx.db
        .query("dishIngredients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const ingredients = await ctx.db
        .query("ingredients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const ingredientById = new Map(
        ingredients.map((item) => [String(item._id), item.name]),
      );
      const dishById = new Map(
        menu.map(({ dish }) => [String(dish._id), dish]),
      );
      return {
        kind: "document",
        title: reportTitle(args.reportId),
        template: "menu_item_recipes",
        sections: [...dishIds].map((dishId) => ({
          id: dishId,
          heading: dishById.get(dishId)?.name ?? "Recipe",
          rows: [
            ...lines
              .filter(
                (line) =>
                  String(line.dishId) === dishId &&
                  isLiveTenantRow(line, tenantId),
              )
              .map((line) => ({
                label: ingredientById.get(String(line.ingredientId)) ?? "",
                value: `${line.quantity} ${line.unit}`,
              })),
            {
              label: "Preparation",
              value: dishById.get(dishId)?.description ?? "",
            },
          ],
        })),
      };
    }
    throw new Error(`No Event resolver for ${args.reportId}`);
  },
});
