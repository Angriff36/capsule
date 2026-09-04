import { v } from "convex/values";
import { TPP_GENERAL_REPORTS } from "../../src/features/reports/tpp/catalog.general";
import type {
  TppColumn,
  TppReportResult,
  TppRow,
} from "../../src/features/reports/tpp/types";
import { query } from "../_generated/server";
import {
  REPORT_ROW_LIMIT,
  inDateRange,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

const REPORT_IDS = new Set(TPP_GENERAL_REPORTS.map((report) => report.id));
type Parameters = Record<string, string | string[] | boolean | number>;

function title(reportId: string): string {
  return (
    TPP_GENERAL_REPORTS.find((report) => report.id === reportId)?.name ??
    reportId
  );
}

function table(
  reportId: string,
  columns: TppColumn[],
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

function name(client: {
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}): string {
  return (
    client.companyName ||
    [client.givenName, client.familyName].filter(Boolean).join(" ") ||
    "Unnamed"
  );
}

function range(parameters: Parameters): [number, number] {
  return [
    Number(parameters.dateRangeStart ?? 0),
    Number(parameters.dateRangeEnd ?? Number.MAX_SAFE_INTEGER),
  ];
}

export const run = query({
  args: { reportId: v.string(), parameters: v.any() },
  handler: async (ctx, args): Promise<TppReportResult> => {
    const tenantId = await requireReportTenant(ctx);
    if (!REPORT_IDS.has(args.reportId))
      throw new Error("Unknown TPP General report");
    const parameters = (args.parameters ?? {}) as Parameters;

    if (args.reportId === "contact-task-notes") {
      const [tasks, clients] = await Promise.all([
        ctx.db
          .query("clientOutreachTasks")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("clients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const clientsById = new Map(
        clients.map((client) => [String(client._id), name(client)]),
      );
      const [start, end] = range(parameters);
      return table(
        args.reportId,
        [
          { key: "contact", label: "Contact", kind: "text" },
          { key: "task", label: "Task / note", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
          { key: "opened", label: "Opened", kind: "date" },
          { key: "resolution", label: "Resolution", kind: "text" },
        ],
        tasks
          .filter(
            (row) =>
              row.tenantId === tenantId &&
              inDateRange(row.openedAt ?? row.createdAt, start, end),
          )
          .map((row) => ({
            id: row._id,
            values: {
              contact: clientsById.get(String(row.clientId)) ?? "",
              task: row.reason,
              status: row.status,
              opened: row.openedAt ?? row.createdAt ?? null,
              resolution: row.resolutionNote ?? "",
            },
          })),
      );
    }

    if (args.reportId === "contact-lead-opportunities") {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const [start, end] = range(parameters);
      return table(
        args.reportId,
        [
          { key: "lead", label: "Contact / lead", kind: "text" },
          { key: "source", label: "Source", kind: "text" },
          { key: "stage", label: "Stage", kind: "text" },
          { key: "value", label: "Estimated value", kind: "money" },
          { key: "probability", label: "Probability", kind: "number" },
        ],
        leads
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              inDateRange(row.capturedAt ?? row.createdAt, start, end),
          )
          .map((row) => ({
            id: row._id,
            values: {
              lead: name(row),
              source: row.source,
              stage: row.stage,
              value: row.estimatedValue,
              probability: row.probability,
            },
          })),
      );
    }

    if (args.reportId === "events-pending-final-confirmation") {
      const events = await ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const [start, end] = range(parameters);
      return table(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "date", label: "Date", kind: "date" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "venue", label: "Venue", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        events
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              [
                "planning",
                "pending_approval",
                "approved",
                "sales_lock",
              ].includes(row.stage) &&
              inDateRange(row.startsAt, start, end),
          )
          .map((row) => ({
            id: row._id,
            values: {
              event: row.title,
              date: row.startsAt ?? null,
              contact: row.primaryContactName ?? "",
              venue: row.venueName ?? "",
              status: row.stage,
            },
          })),
      );
    }

    if (args.reportId === "inventory-in-stock") {
      const [items, ingredients, locations] = await Promise.all([
        ctx.db
          .query("inventoryItems")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("ingredients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("storageLocations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const ingredientsById = new Map(
        ingredients.map((row) => [String(row._id), row]),
      );
      const locationsById = new Map(
        locations.map((row) => [String(row._id), row.name]),
      );
      const rows = items
        .filter(
          (row) => isLiveTenantRow(row, tenantId) && row.removedAt == null,
        )
        .map((row) => ({
          id: row._id,
          values: {
            item: ingredientsById.get(String(row.ingredientId))?.name ?? "",
            category:
              ingredientsById.get(String(row.ingredientId))?.category ?? "",
            location: locationsById.get(String(row.locationId)) ?? "",
            quantity: row.quantityOnHand,
            unit: row.unit,
            unitCost: row.unitCost,
            value: row.quantityOnHand * row.unitCost,
          },
        }));
      return {
        kind: "financial",
        title: title(args.reportId),
        columns: [
          { key: "item", label: "Inventory item", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "location", label: "Location", kind: "text" },
          { key: "quantity", label: "On hand", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "unitCost", label: "Unit cost", kind: "money" },
          { key: "value", label: "Value", kind: "money" },
        ],
        rows,
        groups: [],
        totals: [
          {
            key: "value",
            label: "Inventory value",
            value: rows.reduce((sum, row) => sum + Number(row.values.value), 0),
            kind: "money",
          },
        ],
        measures: [],
      };
    }

    if (args.reportId === "mailing-labels") {
      const clients = await ctx.db
        .query("clients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      return {
        kind: "labels",
        title: title(args.reportId),
        stock: "avery_5160",
        labels: clients
          .filter(
            (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
          )
          .map((row) => ({
            id: row._id,
            lines: [
              name(row),
              row.addressLine1,
              row.addressLine2,
              [row.city, row.region, row.postalCode].filter(Boolean).join(" "),
            ].filter((line): line is string => !!line),
          })),
      };
    }

    if (
      [
        "menu-item-listing-report",
        "menu-item-packages",
        "menu-item-popularity",
      ].includes(args.reportId)
    ) {
      const [dishes, menuDishes, menus, eventDishes, events] =
        await Promise.all([
          ctx.db
            .query("dishes")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("menuDishes")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("menus")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("eventDishes")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("events")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(REPORT_ROW_LIMIT),
        ]);
      const dishById = new Map(dishes.map((row) => [String(row._id), row]));
      const menuById = new Map(menus.map((row) => [String(row._id), row.name]));
      if (args.reportId === "menu-item-packages") {
        return table(
          args.reportId,
          [
            { key: "package", label: "Package", kind: "text" },
            { key: "item", label: "Menu item", kind: "text" },
            { key: "course", label: "Course", kind: "text" },
            { key: "price", label: "Selling price", kind: "money" },
          ],
          menuDishes
            .filter(
              (row) => isLiveTenantRow(row, tenantId) && row.removedAt == null,
            )
            .map((row) => ({
              id: row._id,
              values: {
                package: menuById.get(String(row.menuId)) ?? "",
                item: dishById.get(String(row.dishId))?.name ?? "",
                course: row.course ?? "",
                price: row.sellingPrice ?? 0,
              },
            })),
        );
      }
      if (args.reportId === "menu-item-popularity") {
        const [start, end] = range(parameters);
        const eventById = new Map(events.map((row) => [String(row._id), row]));
        const counts = new Map<
          string,
          { events: Set<string>; servings: number }
        >();
        for (const item of eventDishes) {
          const event = eventById.get(String(item.eventId));
          if (
            !event ||
            !inDateRange(event.startsAt, start, end) ||
            !isLiveTenantRow(item, tenantId)
          )
            continue;
          const current = counts.get(String(item.dishId)) ?? {
            events: new Set<string>(),
            servings: 0,
          };
          current.events.add(String(item.eventId));
          current.servings += item.quantityServings;
          counts.set(String(item.dishId), current);
        }
        return table(
          args.reportId,
          [
            { key: "item", label: "Menu item", kind: "text" },
            { key: "category", label: "Category", kind: "text" },
            { key: "events", label: "Event count", kind: "number" },
            { key: "servings", label: "Servings", kind: "quantity" },
          ],
          [...counts.entries()].map(([dishId, count]) => ({
            id: dishId,
            values: {
              item: dishById.get(dishId)?.name ?? "",
              category: dishById.get(dishId)?.category ?? "",
              events: count.events.size,
              servings: count.servings,
            },
          })),
        );
      }
      return table(
        args.reportId,
        [
          { key: "item", label: "Menu item", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "course", label: "Course", kind: "text" },
          { key: "portion", label: "Portion", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "dietary", label: "Dietary tags", kind: "text" },
        ],
        dishes
          .filter(
            (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
          )
          .map((row) => ({
            id: row._id,
            values: {
              item: row.name,
              category: row.category ?? "",
              course: row.course ?? "",
              portion: row.portionSize,
              unit: row.portionUnit,
              dietary: row.dietaryTags?.join(", ") ?? "",
            },
          })),
      );
    }

    if (args.reportId === "post-event-notes") {
      const [closeouts, events] = await Promise.all([
        ctx.db
          .query("eventCloseouts")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("events")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const eventById = new Map(events.map((row) => [String(row._id), row]));
      const [start, end] = range(parameters);
      return table(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "date", label: "Event date", kind: "date" },
          { key: "notes", label: "Post event notes", kind: "text" },
          { key: "issues", label: "Unresolved issues", kind: "text" },
        ],
        closeouts
          .filter(
            (row) =>
              isLiveTenantRow(row, tenantId) &&
              inDateRange(
                eventById.get(String(row.eventId))?.startsAt,
                start,
                end,
              ),
          )
          .map((row) => ({
            id: row._id,
            values: {
              event: eventById.get(String(row.eventId))?.title ?? "",
              date: eventById.get(String(row.eventId))?.startsAt ?? null,
              notes: row.performanceNotes ?? row.notes ?? "",
              issues: row.unresolvedIssues ?? "",
            },
          })),
      );
    }

    if (args.reportId === "staff-address-phone-list") {
      const people = await ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      return table(
        args.reportId,
        [
          { key: "staff", label: "Staff member", kind: "text" },
          { key: "role", label: "Role", kind: "text" },
          { key: "phone", label: "Phone", kind: "text" },
          { key: "email", label: "Email", kind: "text" },
        ],
        people
          .filter(
            (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
          )
          .map((row) => ({
            id: row._id,
            values: {
              staff: `${row.givenName} ${row.familyName}`,
              role: row.role,
              phone: row.phone ?? "",
              email: row.email,
            },
          })),
      );
    }

    if (args.reportId === "vendor-phone-list") {
      const vendors = await ctx.db
        .query("vendors")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      return table(
        args.reportId,
        [
          { key: "vendor", label: "Vendor", kind: "text" },
          { key: "phone", label: "Phone", kind: "text" },
          { key: "email", label: "Email", kind: "text" },
        ],
        vendors
          .filter(
            (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
          )
          .map((row) => ({
            id: row._id,
            values: {
              vendor: row.name,
              phone: row.phone ?? "",
              email: row.email ?? "",
            },
          })),
      );
    }

    if (args.reportId === "venue-detail" || args.reportId === "venue-listing") {
      const venues = await ctx.db
        .query("venues")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const active = venues.filter(
        (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
      );
      if (args.reportId === "venue-detail") {
        const venue = active.find((row) => row._id === parameters.venueId);
        if (!venue) throw new Error("Venue not found");
        return {
          kind: "document",
          title: title(args.reportId),
          template: "venue_detail",
          sections: [
            {
              id: "venue",
              heading: venue.name,
              rows: [
                {
                  label: "Address",
                  value: [
                    venue.addressLine1,
                    venue.addressLine2,
                    venue.city,
                    venue.region,
                    venue.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                },
                { label: "Phone", value: venue.contactPhone ?? "" },
                { label: "Contact", value: venue.contactName ?? "" },
                {
                  label: "Directions / load-in",
                  value: venue.loadInInstructions ?? "",
                },
                {
                  label: "Special notes",
                  value: venue.cateringNotes ?? venue.accessNotes ?? "",
                },
              ],
            },
          ],
        };
      }
      return table(
        args.reportId,
        [
          { key: "venue", label: "Venue", kind: "text" },
          { key: "type", label: "Type", kind: "text" },
          { key: "address", label: "Address", kind: "text" },
          { key: "phone", label: "Phone", kind: "text" },
          { key: "capacity", label: "Capacity", kind: "number" },
        ],
        active.map((venue) => ({
          id: venue._id,
          values: {
            venue: venue.name,
            type: venue.venueType,
            address: [
              venue.addressLine1,
              venue.city,
              venue.region,
              venue.postalCode,
            ]
              .filter(Boolean)
              .join(", "),
            phone: venue.contactPhone ?? "",
            capacity: venue.capacity,
          },
        })),
      );
    }
    throw new Error(`No TPP General resolver for ${args.reportId}`);
  },
});
