import {
  packingItemDescription,
  packingAssociationMissing,
} from "../../src/lib/packingDisplay";
import {
  readableRecipeAmount,
  recipeNoteLines,
} from "../../src/lib/recipeDisplay";
import { groupEventPrep } from "../../src/lib/eventPrepGroups";
import { displayEventMenuNotes } from "../../src/features/events/eventMenuLineFields";
import { v } from "convex/values";
import { TPP_EVENT_REPORTS } from "../../src/features/reports/tpp/catalog.event";
import { EventTimelineStaffRoster } from "../../src/features/events/eventTimelineStaffRoster";
import type {
  TppColumn,
  TppDocumentSection,
  TppLabel,
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
  resolveReportEventVenue,
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
): Extract<TppReportResult, { kind: "table" }> {
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
    events.map(async (event) =>
      resolveReportEventVenue(
        ctx,
        tenantId,
        await decryptReportFields(
          ctx,
          "Event",
          ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
          event,
        ),
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
  return resolveReportEventVenue(
    ctx,
    tenantId,
    await decryptReportFields(
      ctx,
      "Event",
      ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
      eventRaw,
    ),
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

async function eventStaffing(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const [assignments, staffNeeds, shifts, people] = await Promise.all([
    ctx.db
      .query("eventAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(REPORT_ROW_LIMIT),
    ctx.db
      .query("eventStaffNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(REPORT_ROW_LIMIT),
    ctx.db
      .query("shifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(REPORT_ROW_LIMIT),
    ctx.db
      .query("people")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(REPORT_ROW_LIMIT),
  ]);
  const reportShifts = await Promise.all(
    shifts.map((shift) => decryptReportFields(ctx, "Shift", ["notes"], shift)),
  );
  const peopleById = new Map(
    people.map((person) => [String(person._id), person] as const),
  );
  const referencedPersonIds = [
    ...assignments.map((row) => row.personId),
    ...staffNeeds.map((row) => row.filledByPersonId),
    ...reportShifts.map((row) => row.personId),
  ].filter((personId): personId is Id<"people"> => personId != null);
  const missingPeople = await Promise.all(
    [...new Set(referencedPersonIds.map(String))]
      .filter((personId) => !peopleById.has(personId))
      .map((personId) => ctx.db.get(personId as Id<"people">)),
  );
  const resolvedPeople = [
    ...people,
    ...missingPeople.filter(
      (person): person is Doc<"people"> =>
        person != null && isLiveTenantRow(person, tenantId),
    ),
  ];
  return EventTimelineStaffRoster.staffingRosterEntries({
    eventId: String(eventId),
    assignments: assignments.filter((row) => isLiveTenantRow(row, tenantId)),
    staffNeeds: staffNeeds.filter((row) => isLiveTenantRow(row, tenantId)),
    shifts: reportShifts.filter((row) => isLiveTenantRow(row, tenantId)),
    people: resolvedPeople.filter((row) => isLiveTenantRow(row, tenantId)),
  });
}

function staffWindowText(window: {
  startsAt?: number | null;
  endsAt?: number | null;
}): string {
  if (window.startsAt == null && window.endsAt == null) return "Time not set";
  return [dateText(window.startsAt), dateText(window.endsAt)]
    .filter(Boolean)
    .join(" – ");
}

function staffDetails(
  entry: ReturnType<
    typeof EventTimelineStaffRoster.staffingRosterEntries
  >[number],
): string {
  const windows = entry.shiftWindows?.length
    ? entry.shiftWindows
    : (entry.plannedWindows ?? []);
  const sources = [...new Set(entry.sources ?? [entry.source])]
    .map((source) =>
      source === "filled_need" ? "filled staffing request" : source,
    )
    .join(" + ");
  return [
    windows.length ? windows.map(staffWindowText).join("; ") : "Time not set",
    entry.status.replaceAll("_", " "),
    sources,
    ...(entry.notes ?? []),
  ]
    .filter(Boolean)
    .join(" — ");
}

function serviceMethodText(
  serviceInstructions: string | null | undefined,
  serviceInstructionsSource: string | null | undefined,
  recipeInstructions: string | null | undefined,
): string {
  const text = String(serviceInstructions ?? "").trim();
  if (text) return text;
  if (String(serviceInstructionsSource ?? "").trim())
    return "Service method not recorded.";
  const legacy = String(recipeInstructions ?? "").trim();
  if (!legacy) return "Service method not recorded.";
  const lines = legacy.split(/\r?\n/);
  const heatingIndex = lines.findIndex((line) =>
    /^\s*Heating\s*&\s*Serving\s*:/i.test(line),
  );
  if (heatingIndex >= 0) {
    const heading = lines[heatingIndex].match(
      /^\s*Heating\s*&\s*Serving\s*:\s*(.*)$/i,
    );
    const section = heading?.[1]?.trim() ? [heading[1].trim()] : [];
    for (const line of lines.slice(heatingIndex + 1)) {
      if (/^\s*(?:Method|Preparation|Ingredients|Recipe|Notes)\s*:/i.test(line))
        break;
      section.push(line);
    }
    return section.join("\n").trim() || "Service method not recorded.";
  }
  if (/^Method\s*:/i.test(legacy))
    return "Service method not recorded. Preparation method is recorded separately.";
  return "Service method not recorded.";
}

const SERVICE_LABEL_MAX_CHARS = 54;

function serviceLabel(
  dishName: string,
  serviceText: string,
  id: string,
): TppLabel {
  const firstLine =
    serviceText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find(Boolean) || "Service method not recorded.";
  const boundary = firstLine.lastIndexOf(" ", SERVICE_LABEL_MAX_CHARS + 1);
  const instruction =
    firstLine.length <= SERVICE_LABEL_MAX_CHARS
      ? firstLine
      : `${firstLine.slice(
          0,
          boundary > 0 ? boundary : SERVICE_LABEL_MAX_CHARS,
        )}…`;
  return { id, lines: [dishName, instruction] };
}

async function productionWorksheet(
  ctx: QueryCtx,
  tenantId: string,
  events: Doc<"events">[],
  reportId: string,
): Promise<TppReportResult> {
  const sections: TppDocumentSection[] = [];
  const rows: TppRow[] = [];
  const human = (value: string) => value.replaceAll("_", " ");
  for (const event of [...events].sort(
    (a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0),
  )) {
    const [menu, tasks] = await Promise.all([
      eventMenu(ctx, tenantId, event._id),
      ctx.db
        .query("prepTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(REPORT_ROW_LIMIT),
    ]);
    sections.push({
      id: event._id,
      heading: event.title,
      rows: [
        { label: "Event date", value: dateText(event.startsAt) },
        { label: "Guests", value: String(event.expectedHeadcount) },
        {
          label: "Venue",
          value: [event.venueName, event.venueAddress]
            .filter(Boolean)
            .join("  /  "),
        },
      ],
    });
    const groups = groupEventPrep(
      menu.map((entry) => entry.item),
      tasks.filter(
        (task) =>
          isLiveTenantRow(task, tenantId) && task.status !== "cancelled",
      ),
    );
    if (!groups.length)
      sections.push({
        id: `${event._id}-empty`,
        rows: [{ value: "No menu items or prep steps recorded." }],
      });
    for (const group of groups) {
      const selection = group.selection;
      const dishId = selection?.dishId ?? group.tasks[0]?.dishId;
      const dish = dishId ? await ctx.db.get(dishId) : null;
      const dishName =
        dish && isLiveTenantRow(dish, tenantId) ? dish.name : "Event prep";
      const sectionRows: TppDocumentSection["rows"][number][] = [
        {
          label: "Servings",
          value: selection
            ? String(selection.quantityServings)
            : "Not linked to a current menu line",
        },
      ];
      if (dish && isLiveTenantRow(dish, tenantId))
        sectionRows.push({
          label: "Dish recipe",
          value: dishName,
          recipe: { kind: "dish", id: dish._id },
        });
      if (selection?.course)
        sectionRows.push({ label: "Course", value: selection.course });
      const categories = [...new Set(group.tasks.map((task) => task.category))];
      const sharedCategory = categories.length === 1;
      if (sharedCategory)
        sectionRows.push({ label: "Preparation", value: human(categories[0]) });
      const firstTask = group.tasks[0];
      const sharedWork =
        firstTask &&
        group.tasks.every(
          (task) =>
            task.status === firstTask.status &&
            task.assignedToId === firstTask.assignedToId &&
            task.station === firstTask.station,
        );
      const menuNotes = recipeNoteLines(
        displayEventMenuNotes(selection?.specialInstructions),
      ).join("\n");
      if (menuNotes)
        sectionRows.push({ label: "Menu notes", value: menuNotes });
      const base = {
        event: event.title,
        date: dateText(event.startsAt),
        venue: [event.venueName, event.venueAddress]
          .filter(Boolean)
          .join("  /  "),
        guests: event.expectedHeadcount,
        dish: dishName,
        servings: selection?.quantityServings ?? null,
        course: selection?.course ?? "",
        menuNotes,
      };
      if (!group.tasks.length) {
        sectionRows.push({ value: "No prep steps recorded for this dish." });
        rows.push({
          id: group.key,
          values: { ...base, task: "No prep steps recorded for this dish." },
        });
      }
      for (const task of group.tasks) {
        const [component, person] = await Promise.all([
          task.componentId ? ctx.db.get(task.componentId) : null,
          task.assignedToId ? ctx.db.get(task.assignedToId) : null,
        ]);
        const componentName =
          component && isLiveTenantRow(component, tenantId)
            ? component.name
            : "";
        const owner =
          person && isLiveTenantRow(person, tenantId)
            ? `${person.givenName} ${person.familyName}`.trim()
            : task.assignedToId
              ? "Assigned"
              : "Unassigned";
        if (sharedWork && task._id === firstTask._id)
          sectionRows.push({
            label: "Work status",
            value: [task.station, human(task.status), owner]
              .filter(Boolean)
              .join(" / "),
          });
        const notes = [
          ...new Set([
            ...recipeNoteLines(
              displayEventMenuNotes(task.specialInstructions),
              task.name,
            ),
            ...recipeNoteLines(task.notes ?? "", task.name),
          ]),
        ].join("\n");
        const quantity = readableRecipeAmount(task.quantity, task.unit);
        const completed =
          task.completedQuantity == null
            ? ""
            : `${readableRecipeAmount(task.completedQuantity, task.unit)} completed`;
        const detail = [
          quantity,
          [
            sharedCategory ? "" : human(task.category),
            ...(sharedWork ? [] : [task.station, human(task.status), owner]),
          ]
            .filter(Boolean)
            .join("  /  "),
          task.dueAt ? `Due ${dateText(task.dueAt)}` : "",
          completed,
          notes,
          task.blockReason ? `Blocked: ${task.blockReason}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        sectionRows.push({ label: task.name, value: detail });
        if (componentName && component)
          sectionRows.push({
            label: "Component recipe",
            value: componentName,
            recipe: { kind: "component", id: component._id },
          });
        else if (task.componentId)
          sectionRows.push({
            label: "Component recipe",
            value: "Recipe unavailable",
          });
        rows.push({
          id: task._id,
          values: {
            ...base,
            task: task.name,
            quantity: task.quantity,
            unit: task.unit,
            category: human(task.category),
            station: task.station ?? "",
            status: human(task.status),
            owner,
            due: dateText(task.dueAt),
            completed: task.completedQuantity ?? null,
            notes,
            blocked: task.blockReason ?? "",
            component:
              componentName || (task.componentId ? "Recipe unavailable" : ""),
          },
        });
      }
      sections.push({
        id: `${event._id}-${group.key}`,
        heading: dishName,
        headingLevel: 4,
        printContext: `${event.title} / ${dateText(event.startsAt)} / ${event.expectedHeadcount} guests`,
        rows: sectionRows,
      });
    }
  }
  const columns: TppColumn[] = [
    { key: "event", label: "Event", kind: "text" },
    { key: "date", label: "Event date", kind: "text" },
    { key: "venue", label: "Venue", kind: "text" },
    { key: "guests", label: "Guests", kind: "number" },
    { key: "dish", label: "Dish", kind: "text" },
    { key: "servings", label: "Dish servings", kind: "number" },
    { key: "course", label: "Course", kind: "text" },
    { key: "menuNotes", label: "Menu notes", kind: "text" },
    { key: "task", label: "Prep step", kind: "text" },
    { key: "quantity", label: "Quantity", kind: "quantity" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "category", label: "Category", kind: "text" },
    { key: "component", label: "Component recipe", kind: "text" },
    { key: "station", label: "Station", kind: "text" },
    { key: "owner", label: "Assigned to", kind: "text" },
    { key: "due", label: "Due", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "completed", label: "Completed quantity", kind: "quantity" },
    { key: "notes", label: "Kitchen notes", kind: "text" },
    { key: "blocked", label: "Blocked reason", kind: "text" },
  ];
  return {
    kind: "document",
    title: reportTitle(reportId),
    template: reportId,
    sections,
    exportTable: { columns, rows },
  };
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
          { key: "starts", label: "Starts", kind: "datetime" },
          { key: "ends", label: "Ends", kind: "datetime" },
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

    if (args.reportId === "master-food-production-worksheet") {
      return productionWorksheet(
        ctx,
        tenantId,
        await eventsInRange(ctx, tenantId, parameters),
        args.reportId,
      );
    }

    if (
      [
        "beverage-order-list-by-vendor",
        "miscellaneous-order-list-by-vendor",
        "other-inventory-order-list-by-vendor",
        "rental-order-list-by-vendor",
        "order-list",
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
      {
        label: "Venue",
        value: [event.venueName, event.venueAddress]
          .filter(Boolean)
          .join(" · "),
      },
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
        labels: menu.map(({ item, dish }) => {
          const menuNotes = displayEventMenuNotes(item.specialInstructions);
          if (args.reportId === "heating-serving-labels") {
            return serviceLabel(
              dish.name,
              [
                serviceMethodText(
                  dish.serviceInstructions,
                  dish.serviceInstructionsSource,
                  dish.recipeInstructions,
                ),
                menuNotes ? `Event notes: ${menuNotes}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
              String(item._id),
            );
          }
          return {
            id: item._id,
            lines:
              args.reportId === "event-menu-item-labels"
                ? [
                    event.title,
                    dateText(event.startsAt),
                    event.primaryContactName ?? "",
                    dish.name,
                  ]
                : [dish.name, dish.description ?? ""],
          };
        }),
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
      const [timeline, staffing, reservations, equipment] = await Promise.all([
        ctx.db
          .query("eventTimelineActivities")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(REPORT_ROW_LIMIT),
        eventStaffing(ctx, tenantId, event._id),
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
            rows: menu.map(({ item, dish }) => {
              const menuNotes = displayEventMenuNotes(item.specialInstructions);
              if (args.reportId === "heating-serving-event-menu") {
                return {
                  label: `${dish.name} · ${item.quantityServings} servings`,
                  value: [
                    serviceMethodText(
                      dish.serviceInstructions,
                      dish.serviceInstructionsSource,
                      dish.recipeInstructions,
                    ),
                    menuNotes ? `Event notes: ${menuNotes}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  recipe: { kind: "dish" as const, id: String(dish._id) },
                };
              }
              return {
                label: item.course ?? dish.course ?? "",
                value: `${dish.name}${menuNotes ? ` — ${menuNotes}` : ""}`,
              };
            }),
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
            rows: staffing.map((entry) => ({
              label: `${entry.label} — ${entry.role || "Role not set"}`,
              value: staffDetails(entry),
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

    if (args.reportId === "event-menu-item-production") {
      return productionWorksheet(ctx, tenantId, [event], args.reportId);
    }

    if (["production-summary", "kitchen-labor"].includes(args.reportId)) {
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
      const lists = (
        await ctx.db
          .query("packLists")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .collect()
      ).filter((list) => isLiveTenantRow(list, tenantId));
      const listNames = new Map(
        lists.map((list) => [String(list._id), list.name]),
      );
      const items = (
        await Promise.all(
          lists.map((list) =>
            ctx.db
              .query("packListItems")
              .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
              .collect(),
          ),
        )
      )
        .flat()
        .filter((row) => isLiveTenantRow(row, tenantId));
      const dishIds = [
        ...new Set(items.flatMap((row) => (row.dishId ? [row.dishId] : []))),
      ];
      const dishes = await Promise.all(dishIds.map((id) => ctx.db.get(id)));
      const dishNames = new Map(
        dishes
          .filter(
            (dish): dish is Doc<"dishes"> =>
              !!dish && isLiveTenantRow(dish, tenantId),
          )
          .map((dish) => [String(dish._id), dish.name]),
      );
      const result = table(
        args.reportId,
        [
          { key: "item", label: "Item", kind: "text" },
          { key: "association", label: "For", kind: "text" },
          ...(lists.length > 1
            ? [{ key: "loadSheet", label: "Load sheet", kind: "text" as const }]
            : []),
          { key: "required", label: "Required", kind: "quantity" },
          { key: "packed", label: "Packed", kind: "quantity" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        items.map((row) => {
          const dishName = row.dishId
            ? dishNames.get(String(row.dishId))
            : undefined;
          return {
            id: row._id,
            ...(dishName && row.dishId
              ? {
                  recipeLinks: {
                    association: {
                      kind: "dish" as const,
                      id: String(row.dishId),
                    },
                  },
                }
              : {}),
            values: {
              item: packingItemDescription(row.description),
              association:
                dishName ??
                (row.dishId
                  ? "Dish unavailable"
                  : packingAssociationMissing(row.description)
                    ? "Association not recorded"
                    : ""),
              loadSheet: listNames.get(String(row.packListId)) ?? "",
              required: row.requiredQuantity,
              packed: row.packedQuantity,
              unit: row.unit,
              status: row.status,
            },
          };
        }),
      );
      return {
        ...result,
        context: [
          { label: "Event", value: event.title },
          {
            label: "Date",
            value: event.startsAt ?? null,
            kind: "date" as const,
          },
          { label: "Guests", value: event.expectedHeadcount },
          {
            label: "Venue",
            value:
              [event.venueName, event.venueAddress]
                .filter(Boolean)
                .join(" - ") || "Not recorded",
          },
          ...(lists.length === 1
            ? [{ label: "Load sheet", value: lists[0].name }]
            : []),
        ],
      };
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
      const amount = readableRecipeAmount;
      const ingredientName = async (id: Id<"ingredients">) => {
        const ingredient = await ctx.db.get(id);
        return ingredient && isLiveTenantRow(ingredient, tenantId)
          ? ingredient.name
          : "Ingredient unavailable";
      };
      const sections: TppDocumentSection[] = [
        {
          id: "event-context",
          heading: event.title,
          rows: [
            { label: "Event date", value: dateText(event.startsAt) },
            { label: "Guests", value: String(event.expectedHeadcount) },
          ],
        },
      ];
      for (const { item, dish } of menu) {
        const [direct, attachments] = await Promise.all([
          ctx.db
            .query("dishIngredients")
            .withIndex("by_dishId", (q) => q.eq("dishId", dish._id))
            .take(REPORT_ROW_LIMIT),
          ctx.db
            .query("dishComponents")
            .withIndex("by_dishId", (q) => q.eq("dishId", dish._id))
            .take(REPORT_ROW_LIMIT),
        ]);
        const rows: TppDocumentSection["rows"][number][] = [
          {
            label: "Recipe",
            value: dish.name,
            recipe: { kind: "dish", id: String(dish._id) },
          },
          {
            label: "Servings for this menu item",
            value: String(item.quantityServings),
          },
          {
            label: "Portion",
            value: amount(dish.portionSize, dish.portionUnit),
          },
        ];
        for (const line of direct
          .filter((x) => isLiveTenantRow(x, tenantId))
          .sort((a, b) => a.sortOrder - b.sortOrder)) {
          rows.push({
            label: await ingredientName(line.ingredientId),
            value: `${amount(line.quantity, line.unit)} per serving; ${amount(line.quantity * item.quantityServings, line.unit)} for this menu item`,
          });
        }
        rows.push({
          label: "Preparation",
          value:
            dish.recipeInstructions?.trim() ||
            "Preparation method not recorded.",
        });
        sections.push({ id: String(item._id), heading: dish.name, rows });
        for (const attachment of attachments
          .filter((x) => isLiveTenantRow(x, tenantId) && x.removedAt == null)
          .sort((a, b) => a.sortOrder - b.sortOrder)) {
          const component = await ctx.db.get(attachment.componentId);
          if (!component || !isLiveTenantRow(component, tenantId)) {
            sections.push({
              id: String(attachment._id),
              heading: "Component recipe unavailable",
              headingLevel: 4,
              rows: [
                {
                  label: "Recipe",
                  value: "The linked component could not be found.",
                },
              ],
            });
            continue;
          }
          const batchCount =
            attachment.yieldQuantity > 0
              ? (item.quantityServings * attachment.batchMultiplier) /
                attachment.yieldQuantity
              : null;
          const ingredients = await ctx.db
            .query("componentIngredients")
            .withIndex("by_componentId", (q) =>
              q.eq("componentId", component._id),
            )
            .take(REPORT_ROW_LIMIT);
          const componentRows: TppDocumentSection["rows"][number][] = [
            {
              label: "Recipe",
              value: component.name,
              recipe: { kind: "component", id: String(component._id) },
            },
            {
              label: "One batch makes",
              value: amount(component.yieldQuantity, component.yieldUnit),
            },
            {
              label: "For this menu item",
              value:
                batchCount == null
                  ? "Serving ratio not recorded."
                  : amount(
                      batchCount * component.yieldQuantity,
                      component.yieldUnit,
                    ),
            },
          ];
          for (const line of ingredients
            .filter((x) => isLiveTenantRow(x, tenantId))
            .sort((a, b) => a.sortOrder - b.sortOrder)) {
            componentRows.push({
              label: await ingredientName(line.ingredientId),
              value: `${amount(line.quantity, line.unit)} per batch${batchCount == null ? "" : `; ${amount(line.quantity * batchCount, line.unit)} for this menu item`}`,
            });
          }
          if (!ingredients.some((x) => isLiveTenantRow(x, tenantId)))
            componentRows.push({
              label: "Ingredients",
              value: "Ingredient quantities not recorded.",
            });
          componentRows.push({
            label: "Preparation",
            value:
              component.instructions?.trim() ||
              "Preparation method not recorded.",
          });
          sections.push({
            id: `${item._id}:${attachment._id}`,
            heading: component.name,
            headingLevel: 4,
            rows: componentRows,
          });
        }
        if (
          !direct.some((x) => isLiveTenantRow(x, tenantId)) &&
          !attachments.some(
            (x) => isLiveTenantRow(x, tenantId) && x.removedAt == null,
          )
        ) {
          rows.push({
            label: "Ingredients",
            value: "Ingredient quantities not recorded.",
          });
        }
      }
      return {
        kind: "document",
        title: reportTitle(args.reportId),
        template: "menu_item_recipes",
        sections,
      };
    }
    throw new Error(`No Event resolver for ${args.reportId}`);
  },
});
