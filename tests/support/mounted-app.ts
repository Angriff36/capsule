import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, vi } from "vitest";

/** Only service boundaries are doubled. Screens, forms and domain helpers stay real. */
const backend = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  calls: new Map<string, ReturnType<typeof vi.fn>>(),
  reads: vi.fn(),
  authenticated: true,
  organization: { id: "tenant-a", name: "Test Catering", publicMetadata: {} },
  user: {
    id: "user-a",
    firstName: "Ada",
    lastName: "Cook",
    fullName: "Ada Cook",
  },
  session: { id: "session-a", getToken: vi.fn() },
  setActive: vi.fn(async (): Promise<void> => undefined),
  memberships: [] as unknown[],
  clerk: { signOut: vi.fn(async () => undefined) },
}));
export { backend };
vi.mock("../../src/lib/manifest-convex-react", () => {
  const empty: unknown[] = [];
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, name) {
        if (typeof name !== "string" || name === "then" || name === "default")
          return undefined;
        if (name.startsWith("useList"))
          return () => backend.values.get(name) ?? empty;
        if (name.startsWith("useGet"))
          return (id: string) => {
            backend.reads(name, id);
            return id === "skip" ? undefined : backend.values.get(name);
          };
        if (!backend.calls.has(name))
          backend.calls.set(
            name,
            vi.fn(async () => {
              throw new Error(`Unconfigured command: ${name}`);
            }),
          );
        return () => backend.calls.get(name);
      },
    },
  );
});
vi.mock("convex/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  const command = (reference: Parameters<typeof getFunctionName>[0]) => {
    const key = getFunctionName(reference);
    if (!backend.calls.has(key))
      backend.calls.set(
        key,
        vi.fn(async () => {
          throw new Error(`Unconfigured command: ${key}`);
        }),
      );
    return backend.calls.get(key);
  };
  // One page of a supply ledger (convex/inventoryWindow.ts): the test's
  // generated-list rows, narrowed as the server would.
  const supplyPage = (name: string, args: unknown) => {
    const live = (hook: string) =>
      (
        (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
          deletedAt?: number | null;
        })[]
      ).filter((row) => row.deletedAt == null);
    const a = (args ?? {}) as { eventId?: string; tab?: string };
    if (name === "inventoryWindow:needPage")
      return live("useListPurchaseNeed").filter(
        (row) => !a.eventId || row.eventId === a.eventId,
      );
    if (name === "inventoryWindow:orderPage") {
      const lines = live("useListVendorOrderLine");
      return live("useListVendorOrder").map((row) => ({
        ...row,
        lines: lines.filter((line) => line.vendorOrderId === row._id),
      }));
    }
    if (name === "inventoryWindow:openingStockPage") {
      const tab =
        a.tab === "done" ? ["applied", "set_aside"] : [String(a.tab ?? "")];
      return live("useListOpeningStockRecord").filter((row) =>
        tab.includes(String(row.status)),
      );
    }
    const hook = (
      {
        "inventoryWindow:reservationPage": "useListInventoryReservation",
        "inventoryWindow:transferPage": "useListStockTransfer",
        "inventoryWindow:countSessionPage": "useListStockCountSession",
        "inventoryWindow:wastePage": "useListWasteRecord",
      } as Record<string, string>
    )[name];
    return hook ? live(hook) : backend.values.get(name);
  };
  return {
    ...original,
    useQuery: (
      reference: Parameters<typeof getFunctionName>[0],
      args?: unknown,
    ) => {
      const name = getFunctionName(reference);
      backend.reads(name, args);
      if (args === "skip") return undefined;
      // Facilities and fleet scoped reads (convex/facilitiesHistoryWindow.ts):
      // the test's generated-list rows, narrowed as the server would.
      if (
        name.startsWith("facilitiesHistoryWindow:") &&
        !backend.values.has(name)
      ) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const a = (args ?? {}) as Record<string, unknown>;
        const num = (value: unknown) => Number(value ?? 0);
        const logged = (hook: string) =>
          live(hook).filter((row) => row.loggedAt != null);
        switch (name) {
          case "facilitiesHistoryWindow:equipmentServiceSummary": {
            const entries = logged("useListEquipmentServiceEntry");
            return {
              tasks: ((a.taskIds as string[]) ?? []).map((taskId) => {
                const mine = entries
                  .filter((row) => String(row.maintenanceTaskId) === taskId)
                  .sort((x, y) => num(y.completedAt) - num(x.completedAt));
                return {
                  taskId,
                  latest: mine[0] ?? null,
                  count: mine.length,
                  capped: false,
                };
              }),
              total: entries.length,
              totalCapped: false,
            };
          }
          case "facilitiesHistoryWindow:maintenanceDueBefore":
            return live("useListEquipmentMaintenanceTask").filter(
              (row) =>
                row.nextDueAt != null && num(row.nextDueAt) <= num(a.before),
            );
          case "facilitiesHistoryWindow:vehicleOdometers": {
            const ids = new Set((a.vehicleIds as string[]) ?? []);
            const out: Record<string, number> = {};
            for (const row of [
              ...live("useListVehicleFuelLog"),
              ...live("useListVehicleServiceEntry"),
            ]) {
              const id = String(row.vehicleId);
              if (ids.has(id))
                out[id] = Math.max(out[id] ?? 0, num(row.odometer));
            }
            return out;
          }
          case "facilitiesHistoryWindow:vehicleLogPage": {
            const fuel = logged("useListVehicleFuelLog");
            const service = logged("useListVehicleServiceEntry");
            const limit = num(a.limit);
            return {
              fuel: fuel.slice(0, limit),
              service: service.slice(0, limit),
              fuelCount: fuel.length,
              serviceCount: service.length,
              countsCapped: false,
              hasOlder: fuel.length > limit || service.length > limit,
            };
          }
          case "facilitiesHistoryWindow:rentalMonth": {
            const from = num(a.from);
            const to = num(a.to);
            const events = live("useListEvent");
            const inMonth = new Set(
              events
                .filter(
                  (row) =>
                    row.startsAt != null &&
                    num(row.startsAt) >= from &&
                    num(row.startsAt) < to,
                )
                .map((row) => String(row._id)),
            );
            return {
              holds: live("useListEquipmentReservation").filter(
                (row) =>
                  inMonth.has(String(row.eventId)) ||
                  (row.startsAt != null &&
                    row.endsAt != null &&
                    num(row.startsAt) < to &&
                    num(row.endsAt) > from),
              ),
              lines: live("useListRentalOrderLine").filter((row) =>
                inMonth.has(String(row.eventId)),
              ),
              issues: live("useListEquipmentIssue").filter(
                (row) =>
                  row.raisedAt != null &&
                  num(row.raisedAt) >= from &&
                  num(row.raisedAt) < to,
              ),
            };
          }
          case "facilitiesHistoryWindow:leadsForSources": {
            const ids = new Set((a.sourceIds as string[]) ?? []);
            return live("useListLead").filter((row) =>
              ids.has(String(row.referralSourceId)),
            );
          }
          case "facilitiesHistoryWindow:notesForVenues": {
            const ids = new Set((a.venueIds as string[]) ?? []);
            return live("useListVenueNote").filter((row) =>
              ids.has(String(row.venueId)),
            );
          }
          case "facilitiesHistoryWindow:venueEvents":
            return live("useListEvent").filter(
              (row) => String(row.venueId ?? "") === a.venueId,
            );
        }
      }
      // Event, planning and kitchen history reads (convex/historyWindow.ts):
      // the test's generated-list rows, narrowed as the server would.
      if (name.startsWith("historyWindow:") && !backend.values.has(name)) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const a = (args ?? {}) as Record<string, unknown>;
        if (name === "historyWindow:awayForPeople") {
          const people = new Set((a.personIds as string[]) ?? []);
          const overlaps = (row: Record<string, unknown>) =>
            people.has(String(row.personId)) &&
            typeof row.startsAt === "number" &&
            typeof row.endsAt === "number" &&
            row.startsAt < (a.to as number) &&
            row.endsAt > (a.from as number);
          return {
            timeOff: live("useListTimeOffRequest").filter(
              (row) => row.status === "approved" && overlaps(row),
            ),
            availability: live("useListAvailabilityWindow").filter(overlaps),
          };
        }
        if (name === "historyWindow:eventsByNumber")
          return live("useListEvent").filter(
            (row) => row.eventNumber === a.eventNumber,
          );
        if (name === "historyWindow:importNumberRecords")
          return {
            proposals: live("useListProposal").filter(
              (row) => row.proposalNumber === a.number,
            ),
            vendorOrders: live("useListVendorOrder").filter((row) =>
              String(row.orderNumber ?? "").startsWith(`TPP-${a.number}-`),
            ),
          };
        if (name === "historyWindow:dishTasksByIds") {
          const ids = new Set((a.ids as string[]) ?? []);
          const rows = live("useListDishTask");
          for (const row of rows)
            if (ids.has(String(row._id)) && row.sequenceAfterDishTaskId)
              ids.add(String(row.sequenceAfterDishTaskId));
          return rows.filter((row) => ids.has(String(row._id)));
        }
      }
      // Stock lines with only the holds a screen uses
      // (convex/inventoryHistoryWindow.ts): the test's generated stock rows,
      // whose `reservations` stand for every hold on the line.
      if (
        name === "inventoryHistoryWindow:stockLines" &&
        !backend.values.has(name)
      ) {
        const { holds } = args as { holds: "none" | "totals" | "active" };
        const items = backend.values.get("useListInventoryItem") as
          | (Record<string, unknown> & {
              deletedAt?: number | null;
              reservations?: Record<string, unknown>[];
            })[]
          | undefined;
        if (items === undefined) return undefined;
        return items
          .filter((row) => row.deletedAt == null)
          .map((row) => {
            const { reservations, totalReserved, availableQuantity, ...rest } =
              row;
            if (holds === "none") return rest;
            const all = reservations ?? [];
            const active = all.filter((hold) => hold.status === "active");
            const reserved =
              reservations === undefined
                ? totalReserved
                : active.reduce((sum, hold) => sum + Number(hold.quantity), 0);
            const totals = {
              ...rest,
              totalReserved: reserved,
              availableQuantity:
                reservations === undefined
                  ? availableQuantity
                  : Number(row.quantityOnHand) - Number(reserved),
            };
            if (holds === "totals") return totals;
            const byLot = new Map<string, number>();
            for (const hold of all) {
              if (hold.deletedAt != null || hold.inventoryLotId == null)
                continue;
              if (hold.status !== "active" && hold.status !== "consumed")
                continue;
              const lot = String(hold.inventoryLotId);
              byLot.set(lot, (byLot.get(lot) ?? 0) + Number(hold.quantity));
            }
            return {
              ...totals,
              reservations: active,
              lotAllocations: [...byLot].map(([inventoryLotId, quantity]) => ({
                inventoryLotId,
                quantity,
              })),
            };
          });
      }
      // The light client list (convex/clientDirectory.ts) answers from the
      // same client rows a test gives the generated list, unless the test
      // sets its own.
      if (
        (name === "clientDirectory:list" ||
          name === "clientDirectory:listWithContacts") &&
        !backend.values.has(name)
      )
        return backend.values.get("useListClient") ?? [];
      // Clients by id and by name (the pickers' server search) answer from
      // the same client rows.
      if (name === "queries:getClient" && !backend.values.has(name)) {
        const id = (args as { id?: string } | undefined)?.id;
        return (
          (backend.values.get("useListClient") ?? []) as { _id: string }[]
        ).find((row) => row._id === id);
      }
      if (name === "clientDirectory:byIds" && !backend.values.has(name)) {
        const ids = new Set((args as { ids: string[] }).ids);
        return (
          (backend.values.get("useListClient") ?? []) as { _id: string }[]
        ).filter((row) => ids.has(row._id));
      }
      if (name === "clientDirectory:search" && !backend.values.has(name)) {
        const text = String((args as { text?: string }).text ?? "")
          .trim()
          .toLowerCase();
        return (
          (backend.values.get("useListClient") ?? []) as Record<
            string,
            unknown
          >[]
        ).filter(
          (row) =>
            !text ||
            [row.companyName, row.givenName, row.familyName].some((part) =>
              String(part ?? "")
                .toLowerCase()
                .includes(text),
            ),
        );
      }
      // Events by id (convex/eventLookup.ts) answer from the same event
      // rows a test gives the generated list, unless the test sets its own.
      if (
        (name === "eventLookup:byIds" || name === "eventLookup:docsByIds") &&
        !backend.values.has(name)
      ) {
        const ids = new Set((args as { ids: string[] }).ids);
        const rows = (backend.values.get("useListEvent") ?? []) as {
          _id: string;
        }[];
        return rows.filter((row) => ids.has(row._id));
      }
      if (name === "eventLookup:range" && !backend.values.has(name)) {
        const { from, to, withUndated } = args as {
          from: number;
          to: number;
          withUndated?: boolean;
        };
        const rows = (backend.values.get("useListEvent") ?? []) as {
          startsAt?: number | null;
        }[];
        return {
          rows: rows.filter((row) =>
            row.startsAt == null
              ? withUndated === true
              : row.startsAt >= from && row.startsAt < to,
          ),
          capped: false,
        };
      }
      // One event's menu lines: the test's menu line rows for that event.
      if (
        name === "queries:listEventDishByEventId" &&
        !backend.values.has(name)
      ) {
        const { eventId } = args as { eventId: string };
        const rows = (backend.values.get("useListEventDish") ?? []) as {
          eventId?: string;
          deletedAt?: number | null;
        }[];
        return rows.filter(
          (row) => row.eventId === eventId && row.deletedAt == null,
        );
      }
      // One event's guests or prep tasks: the test's rows for that event.
      for (const [query, hook] of [
        ["queries:listEventGuestByEventId", "useListEventGuest"],
        ["queries:listPrepTaskByEventId", "useListPrepTask"],
        ["queries:listReviewFlagByEventId", "useListReviewFlag"],
        ["queries:listProposalByEventId", "useListProposal"],
        ["queries:listEventAssignmentByEventId", "useListEventAssignment"],
        ["queries:listEventStaffNeedByEventId", "useListEventStaffNeed"],
        ["queries:listShiftByEventId", "useListShift"],
        ["queries:listPackListByEventId", "useListPackList"],
        ["queries:listIngredientDemandByEventId", "useListIngredientDemand"],
        [
          "queries:listEquipmentReservationByEventId",
          "useListEquipmentReservation",
        ],
        ["queries:listRentalOrderLineByEventId", "useListRentalOrderLine"],
        [
          "queries:listEventTimelineCommentByEventId",
          "useListEventTimelineComment",
        ],
        [
          "queries:listEventTimelineActivityByEventId",
          "useListEventTimelineActivity",
        ],
      ] as const)
        if (name === query && !backend.values.has(name)) {
          const { eventId } = args as { eventId: string };
          const rows = (backend.values.get(hook) ?? []) as {
            eventId?: string;
            deletedAt?: number | null;
          }[];
          return rows.filter(
            (row) => row.eventId === eventId && row.deletedAt == null,
          );
        }
      // Menu lines of some events, or of one dish: the test's menu rows.
      if (
        (name === "eventMenuLookup:forEvents" ||
          name === "eventMenuLookup:forDish") &&
        !backend.values.has(name)
      ) {
        const { eventIds, dishId } = args as {
          eventIds?: string[];
          dishId?: string;
        };
        const rows = (backend.values.get("useListEventDish") ?? []) as {
          eventId?: string;
          dishId?: string;
          deletedAt?: number | null;
        }[];
        return rows.filter(
          (row) =>
            row.deletedAt == null &&
            (eventIds
              ? eventIds.includes(String(row.eventId))
              : row.dishId === dishId),
        );
      }
      // Dishes by id: the test's dish rows with those ids.
      if (name === "dishLookup:byIds" && !backend.values.has(name)) {
        const ids = new Set((args as { ids: string[] }).ids);
        const rows = (backend.values.get("useListDish") ?? []) as {
          _id: string;
          deletedAt?: number | null;
        }[];
        return rows.filter((row) => ids.has(row._id) && row.deletedAt == null);
      }
      // Month tracker rows of some events: the test's rows for those events.
      if (name === "eventMonthRows:forEvents" && !backend.values.has(name)) {
        const ids = new Set((args as { eventIds: string[] }).eventIds);
        const rows = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as {
              eventId?: string;
              deletedAt?: number | null;
            }[]
          ).filter(
            (row) => ids.has(String(row.eventId)) && row.deletedAt == null,
          );
        return {
          packLists: rows("useListPackList"),
          reviewFlags: rows("useListReviewFlag"),
          vehicleAssignments: rows("useListEventVehicleAssignment"),
          numberAssignments: rows("useListEventNumberAssignment"),
        };
      }
      // Event screens' scoped reads (src/lib/useEventAreaRows.ts,
      // convex/eventsAreaWindow.ts): the test's generated-list rows for that
      // record or those events.
      if (!backend.values.has(name)) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const scoped: Record<string, string> = {
          "queries:listInvoiceByEventId": "useListInvoice",
          "queries:listIncidentByEventId": "useListIncident",
          "queries:listCorrectiveActionByEventId": "useListCorrectiveAction",
          "queries:listEventLayoutSectionByEventId":
            "useListEventLayoutSection",
          "queries:listClientContactByClientId": "useListClientContact",
          "queries:listProposalDishSelectionByProposalId":
            "useListProposalDishSelection",
          "queries:listProposalEnhancementByProposalId":
            "useListProposalEnhancement",
          "queries:listVenueNoteByEventId": "useListVenueNote",
          "queries:listEventDishLineOverrideByEventDishId":
            "useListEventDishLineOverride",
          "queries:listPayrollInputByEventId": "useListPayrollInput",
          "queries:listVendorOrderByEventId": "useListVendorOrder",
        };
        if (scoped[name]) {
          const [field, value] = Object.entries(
            args as Record<string, unknown>,
          )[0]!;
          return live(scoped[name]).filter((row) => row[field] === value);
        }
        if (name === "queries:listInvoiceByTenantIdAndInvoiceNumber") {
          const { invoiceNumber } = args as { invoiceNumber: string };
          return live("useListInvoice").filter(
            (row) => row.invoiceNumber === invoiceNumber,
          );
        }
        if (name.startsWith("eventsAreaWindow:")) {
          const a = args as {
            eventId?: string;
            eventIds?: string[];
            from?: number;
            to?: number;
            personIds?: string[];
            invoiceNumber?: string;
            proposalIds?: string[];
            vendorOrderIds?: string[];
          };
          const ids = new Set(a.eventIds ?? (a.eventId ? [a.eventId] : []));
          const ofEvents = (hook: string) =>
            live(hook).filter((row) => ids.has(String(row.eventId)));
          if (name === "eventsAreaWindow:guestsForEvents")
            return ofEvents("useListEventGuest");
          if (name === "eventsAreaWindow:invoicesForEvents")
            return ofEvents("useListInvoice");
          if (name === "eventsAreaWindow:trackerRows")
            return {
              deliveries: ofEvents("useListDelivery"),
              invoices: ofEvents("useListInvoice"),
              vehicleAssignments: ofEvents("useListEventVehicleAssignment"),
              numberAssignments: ofEvents("useListEventNumberAssignment"),
            };
          if (name === "eventsAreaWindow:shiftsInWindow")
            return live("useListShift").filter(
              (row) =>
                (!a.personIds || a.personIds.includes(String(row.personId))) &&
                row.startsAt != null &&
                Number(row.startsAt) < a.to! &&
                (row.endsAt != null
                  ? Number(row.endsAt) > a.from!
                  : Number(row.startsAt) >= a.from!),
            );
          if (name === "eventsAreaWindow:waitlistForEvent") {
            const needs = new Set(
              ofEvents("useListEventStaffNeed").map((row) => row._id),
            );
            return live("useListStaffNeedWaitlistEntry").filter((row) =>
              needs.has(row.staffNeedId),
            );
          }
          if (name === "eventsAreaWindow:packItemsForEvent") {
            const lists = new Set(
              ofEvents("useListPackList").map((row) => row._id),
            );
            return live("useListPackListItem").filter((row) =>
              lists.has(row.packListId),
            );
          }
          if (name === "eventsAreaWindow:purchasingForEvent") {
            const demands = ofEvents("useListIngredientDemand");
            const demandIds = new Set(demands.map((row) => row._id));
            const lineDemands = live("useListVendorOrderLineDemand").filter(
              (row) => demandIds.has(row.ingredientDemandId),
            );
            const linkedLines = new Set(
              lineDemands.map((row) => row.vendorOrderLineId),
            );
            const lines = live("useListVendorOrderLine").filter(
              (row) =>
                demandIds.has(row.ingredientDemandId) ||
                linkedLines.has(row._id),
            );
            const orderIds = new Set([
              ...lines.map((row) => row.vendorOrderId),
              ...lineDemands.map((row) => row.vendorOrderId),
            ]);
            return {
              demands,
              orders: live("useListVendorOrder").filter((row) =>
                orderIds.has(row._id),
              ),
              lines,
              lineDemands,
            };
          }
          if (name === "eventsAreaWindow:stockForEvent") {
            const demands = ofEvents("useListIngredientDemand");
            const holds = live("useListInventoryReservation");
            const ingredients = new Set([
              ...demands.map((row) => row.ingredientId),
              ...holds
                .filter((row) => ids.has(String(row.eventId)))
                .map((row) => row.ingredientId),
            ]);
            const items = live("useListInventoryItem").filter((row) =>
              ingredients.has(row.ingredientId),
            );
            const itemIds = new Set(items.map((row) => row._id));
            return {
              demands,
              items,
              lots: live("useListInventoryLot").filter((row) =>
                ingredients.has(row.ingredientId),
              ),
              reservations: holds.filter(
                (row) =>
                  ids.has(String(row.eventId)) ||
                  itemIds.has(row.inventoryItemId),
              ),
            };
          }
          if (name === "eventsAreaWindow:importDirectoryRows") {
            const invoices = live("useListInvoice").filter(
              (row) => row.invoiceNumber === a.invoiceNumber,
            );
            const invoiceIds = new Set(invoices.map((row) => row._id));
            return {
              invoices,
              payments: live("useListPayment").filter((row) =>
                invoiceIds.has(row.invoiceId),
              ),
              proposalLines: live("useListProposalLineItem").filter((row) =>
                (a.proposalIds ?? []).includes(String(row.proposalId)),
              ),
              vendorOrderLines: live("useListVendorOrderLine").filter((row) =>
                (a.vendorOrderIds ?? []).includes(String(row.vendorOrderId)),
              ),
            };
          }
        }
      }
      // A menu's recipe, price and stock rows: the test's lists, as given.
      if (name === "menuRecipeLookup:forDishes" && !backend.values.has(name)) {
        const list = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as { deletedAt?: number | null }[]
          ).filter((row) => row.deletedAt == null);
        return {
          dishIngredients: list("useListDishIngredient"),
          dishComponents: list("useListDishComponent"),
          components: list("useListComponent"),
          componentIngredients: list("useListComponentIngredient"),
          ingredients: list("useListIngredient"),
          priceObservations: list("useListIngredientPriceObservation"),
          unitMappings: list("useListItemUnitMapping"),
          containers: list("useListDishContainer"),
          inventoryItems: list("useListInventoryItem"),
          inventoryReservations: list("useListInventoryReservation"),
        };
      }
      // The whole dish list read straight (an open dish picker).
      if (name === "queries:listDish" && !backend.values.has(name))
        return backend.values.get("useListDish");
      // The picker's events: every live row the test gives (a small list).
      if (name === "eventLookup:picker" && !backend.values.has(name)) {
        const rows = (backend.values.get("useListEvent") ?? []) as {
          deletedAt?: number | null;
        }[];
        return {
          rows: rows.filter((row) => row.deletedAt == null),
          capped: false,
        };
      }
      // Whole event records for a window: the same rows, as they are.
      if (name === "eventLookup:rangeDocs" && !backend.values.has(name)) {
        const { from, to, withUndated } = args as {
          from: number;
          to: number;
          withUndated?: boolean;
        };
        const rows = (backend.values.get("useListEvent") ?? []) as {
          startsAt?: number | null;
        }[];
        return {
          rows: rows.filter((row) =>
            row.startsAt == null
              ? withUndated === true
              : row.startsAt >= from && row.startsAt < to,
          ),
          capped: false,
        };
      }
      // Staff and admin history reads (convex/workforceHistoryWindow.ts):
      // the test's generated-list rows, narrowed as the server would.
      if (
        name.startsWith("workforceHistoryWindow:") &&
        !backend.values.has(name)
      ) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const a = (args ?? {}) as Record<string, unknown>;
        switch (name) {
          case "workforceHistoryWindow:interviewsFor": {
            const ids = new Set((a.candidateIds as string[]) ?? []);
            return live("useListInterview").filter((row) =>
              ids.has(String(row.candidateId)),
            );
          }
          case "workforceHistoryWindow:oneOnOneActionsFor": {
            const ids = new Set((a.oneOnOneIds as string[]) ?? []);
            const actions = live("useListOneOnOneAction");
            const staffMeetings = a.staffMemberId
              ? live("useListOneOnOne").filter(
                  (row) =>
                    row.staffMemberId === a.staffMemberId && row.heldAt != null,
                )
              : [];
            const staffIds = new Set(staffMeetings.map((row) => row._id));
            return {
              actions: actions.filter((row) => ids.has(String(row.oneOnOneId))),
              staffMeetings,
              staffActions: actions.filter((row) =>
                staffIds.has(row.oneOnOneId),
              ),
            };
          }
          case "workforceHistoryWindow:trainingCompletionCounts": {
            const byModule: Record<string, number> = {};
            let total = 0;
            for (const row of live("useListTrainingCompletion")) {
              if (row.recordedAt == null) continue;
              const key = String(row.trainingModuleId);
              byModule[key] = (byModule[key] ?? 0) + 1;
              total += 1;
            }
            return { total, byModule };
          }
          case "workforceHistoryWindow:activeAnnouncements":
            return live("useListAnnouncement").filter(
              (row) => Number(row.expiresAt) > Number(a.now),
            );
          case "workforceHistoryWindow:pendingImportConflicts":
            return live("useListImportConflict").filter(
              (row) => row.status === "pending",
            );
        }
      }
      // Staff screens' scoped reads (convex/workforceWindow.ts and the
      // generated per-person and per-state lists): the test's generated-list
      // rows, narrowed as the server would.
      if (
        (name.startsWith("workforceWindow:") ||
          /^queries:list(Shift|TimeRecord|WeeklyScheduleNotice|AvailabilityWindow|RecurringAvailability|TimeOffRequest|ShiftSwapRequest|TrainingCompletion|EventAssignment|Delivery|PrepTask)By/.test(
            name,
          )) &&
        !backend.values.has(name)
      ) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const a = (args ?? {}) as Record<string, unknown>;
        const num = (value: unknown) =>
          typeof value === "number" ? value : null;
        const overlaps = (row: Record<string, unknown>) => {
          const start = num(row.startsAt);
          const end = num(row.endsAt);
          return (
            end != null &&
            end > (a.from as number) &&
            (a.to == null || (start != null && start < (a.to as number)))
          );
        };
        const ids = new Set((a.ids as string[] | undefined) ?? []);
        const people = new Set((a.personIds as string[] | undefined) ?? []);
        switch (name) {
          case "workforceWindow:shifts":
            return live("useListShift").filter(overlaps);
          case "workforceWindow:shiftsByIds":
          case "workforceWindow:shiftsAround":
            return live("useListShift").filter((row) =>
              ids.has(String(row._id)),
            );
          case "workforceWindow:personOpenShifts":
            return live("useListShift").filter(
              (row) =>
                row.personId === a.personId &&
                (row.status === "started" ||
                  (row.status === "scheduled" &&
                    (num(row.endsAt) == null ||
                      num(row.endsAt)! >= (a.from as number)))),
            );
          case "workforceWindow:timeRecordsIn":
            return live("useListTimeRecord").filter(
              (row) =>
                num(row.clockInAt) != null &&
                num(row.clockOutAt) != null &&
                num(row.clockInAt)! >= (a.from as number) &&
                num(row.clockOutAt)! <= (a.to as number),
            );
          case "workforceWindow:personTimeRecordsSince":
            return live("useListTimeRecord").filter(
              (row) => row.personId === a.personId,
            );
          case "workforceWindow:personScheduleNotices":
            return live("useListWeeklyScheduleNotice").filter(
              (row) =>
                row.personId === a.personId &&
                (row.weekEndsAt as number) >= (a.from as number),
            );
          case "workforceWindow:weekNotices":
            return live("useListWeeklyScheduleNotice").filter(
              (row) =>
                people.has(String(row.personId)) &&
                row.weekStartsAt === a.weekStartsAt,
            );
          case "workforceWindow:personActiveWindows":
            return live("useListAvailabilityWindow").filter(
              (row) => row.personId === a.personId && row.status === "active",
            );
          case "workforceWindow:availabilityWindows":
            return live("useListAvailabilityWindow").filter(overlaps);
          case "workforceWindow:approvedTimeOff":
            return live("useListTimeOffRequest").filter(
              (row) => row.status === "approved" && overlaps(row),
            );
          case "workforceWindow:reviewedTimeOff":
            return live("useListTimeOffRequest").filter(
              (row) => row.status !== "pending",
            );
          case "workforceWindow:trainingCompletionsFor":
            return live("useListTrainingCompletion").filter((row) =>
              people.has(String(row.personId)),
            );
          case "workforceWindow:forEvents": {
            const events = new Set(a.eventIds as string[]);
            return {
              assignments: live("useListEventAssignment").filter(
                (row) =>
                  events.has(String(row.eventId)) &&
                  (a.personId == null || row.personId === a.personId),
              ),
              staffNeeds: live("useListEventStaffNeed").filter((row) =>
                events.has(String(row.eventId)),
              ),
            };
          }
          case "workforceWindow:packForEvents": {
            const events = new Set(a.eventIds as string[]);
            const packLists = live("useListPackList").filter((row) =>
              events.has(String(row.eventId)),
            );
            const listIds = new Set(packLists.map((row) => String(row._id)));
            return {
              packLists,
              packLines: live("useListPackListItem").filter((row) =>
                listIds.has(String(row.packListId)),
              ),
            };
          }
          case "workforceWindow:myDayPrep":
            return {
              tasks: live("useListPrepTask"),
              links: live("useListPrepTaskDependency"),
            };
          case "workforceWindow:fieldCloseouts":
            return live("useListEventCloseout");
          case "workforceWindow:driverDeliveries":
            return live("useListDelivery").filter(
              (row) => row.driverId === a.driverId,
            );
        }
        const match = /^queries:list(\w+?)By(\w+)$/.exec(name);
        if (match) {
          const rows = live(`useList${match[1]}`);
          return rows.filter((row) =>
            Object.entries(a).every(
              ([field, value]) => field === "tenantId" || row[field] === value,
            ),
          );
        }
      }
      // Kitchen screens' scoped reads (convex/productionWindow.ts): the
      // test's generated-list rows, as given.
      if (
        (name === "productionWindow:prepWork" ||
          name === "productionWindow:planWork") &&
        !backend.values.has(name)
      ) {
        const list = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as { deletedAt?: number | null }[]
          ).filter((row) => row.deletedAt == null);
        return {
          eventIds: [],
          tasks: list("useListPrepTask"),
          dependencies: list("useListPrepTaskDependency"),
          checks: list("useListQualityCheck"),
          comments: list("useListPrepTaskComment"),
          batches: list("useListProductionBatch"),
          allocations: list("useListProductionBatchAllocation"),
        };
      }
      if (
        (name === "productionWindow:batchesSince" ||
          name === "productionWindow:openBatches") &&
        !backend.values.has(name)
      )
        return (
          (backend.values.get("useListProductionBatch") ?? []) as {
            deletedAt?: number | null;
          }[]
        ).filter((row) => row.deletedAt == null);
      // One recipe's, dish's, menu's, ingredient's or import's rows
      // (src/lib/recipeScopedQueries.ts): the test's generated-list rows for
      // that record.
      for (const [query, hook] of [
        ["queries:listComponentStepByComponentId", "useListComponentStep"],
        [
          "queries:listComponentPortionSpecByComponentId",
          "useListComponentPortionSpec",
        ],
        [
          "queries:listComponentComponentByComponentId",
          "useListComponentComponent",
        ],
        [
          "queries:listComponentEquipmentByComponentId",
          "useListComponentEquipment",
        ],
        [
          "queries:listComponentSnapshotByComponentId",
          "useListComponentSnapshot",
        ],
        [
          "queries:listComponentIngredientByComponentId",
          "useListComponentIngredient",
        ],
        [
          "queries:listComponentIngredientByIngredientId",
          "useListComponentIngredient",
        ],
        ["queries:listDishComponentByComponentId", "useListDishComponent"],
        ["queries:listDishComponentByDishId", "useListDishComponent"],
        ["queries:listDishIngredientByDishId", "useListDishIngredient"],
        ["queries:listDishContainerByDishId", "useListDishContainer"],
        ["queries:listDishTaskByDishId", "useListDishTask"],
        [
          "queries:listIngredientPriceObservationByIngredientId",
          "useListIngredientPriceObservation",
        ],
        [
          "queries:listComponentImportLineByImportId",
          "useListComponentImportLine",
        ],
        [
          "queries:listComponentImportByResultingComponentId",
          "useListComponentImport",
        ],
        ["queries:listMenuDishByMenuId", "useListMenuDish"],
        ["queries:listItemUnitMappingByIngredientId", "useListItemUnitMapping"],
        ["queries:listVendorItemByIngredientId", "useListVendorItem"],
        ["queries:listStylePackagingByComponentId", "useListStylePackaging"],
        ["queries:listStylePackagingByDishId", "useListStylePackaging"],
      ] as const)
        if (name === query && !backend.values.has(name)) {
          const [field, value] = Object.entries(
            args as Record<string, unknown>,
          )[0]!;
          return (
            (backend.values.get(hook) ?? []) as Record<string, unknown>[]
          ).filter((row) => row[field] === value && row.deletedAt == null);
        }
      // Kitchen windows (convex/recipeWindow.ts): the test's generated rows.
      if (name.startsWith("recipeWindow:") && !backend.values.has(name)) {
        const list = (hook: string) =>
          (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
            deletedAt?: number | null;
          })[];
        const live = (hook: string) =>
          list(hook).filter((row) => row.deletedAt == null);
        const a = args as { dishId: string; ingredientIds: string[] } & {
          eventIds: string[];
        };
        if (name === "recipeWindow:dishTaskMaterials") {
          const tasks = new Set(
            live("useListDishTask")
              .filter((task) => task.dishId === a.dishId)
              .map((task) => task._id),
          );
          return live("useListDishTaskMaterial").filter((row) =>
            tasks.has(row.dishTaskId),
          );
        }
        if (name === "recipeWindow:latestPriceObservations")
          return live("useListIngredientPriceObservation").filter((row) =>
            a.ingredientIds.includes(String(row.ingredientId)),
          );
        if (name === "recipeWindow:openComponentImports")
          return live("useListComponentImport").filter((row) =>
            [
              "uploaded",
              "parsed",
              "reviewing",
              "ready",
              "finalizing",
              "failed",
            ].includes(String(row.status)),
          );
        if (name === "recipeWindow:prepBoard") {
          const tasks = live("useListPrepTask").filter((task) =>
            a.eventIds.includes(String(task.eventId)),
          );
          const taskIds = new Set(tasks.map((task) => task._id));
          return {
            tasks,
            dependencies: list("useListPrepTaskDependency").filter((row) =>
              taskIds.has(row.dependentTaskId),
            ),
            qualityChecks: live("useListQualityCheck").filter((row) =>
              taskIds.has(row.prepTaskId),
            ),
            invoices: live("useListInvoice").filter((row) =>
              a.eventIds.includes(String(row.eventId)),
            ),
          };
        }
      }
      // Logistics, facilities and supply scoped reads
      // (convex/logisticsWindow.ts, src/features/facilities/useLogisticsWindow.ts):
      // the test's generated-list rows for that record or those events.
      if (!backend.values.has(name)) {
        const live = (hook: string) =>
          (
            (backend.values.get(hook) ?? []) as (Record<string, unknown> & {
              deletedAt?: number | null;
            })[]
          ).filter((row) => row.deletedAt == null);
        const byField: Record<string, string> = {
          "queries:listPackListItemByPackListId": "useListPackListItem",
          "queries:listPackSectionClaimByPackListId": "useListPackSectionClaim",
          "queries:listEventVehicleAssignmentByActiveEventId":
            "useListEventVehicleAssignment",
          "queries:listVehicleTripCheckByEventVehicleAssignmentId":
            "useListVehicleTripCheck",
          "queries:listDeliveryByPackListId": "useListDelivery",
          "queries:listEquipmentPartByEquipmentId": "useListEquipmentPart",
          "queries:listVenueNoteByVenueId": "useListVenueNote",
          "queries:listVenueRoomByVenueId": "useListVenueRoom",
          "queries:listVendorOrderLineByVendorOrderId":
            "useListVendorOrderLine",
          "queries:listVendorOrderLineDemandByVendorOrderId":
            "useListVendorOrderLineDemand",
          "queries:listInventoryLotByVendorOrderId": "useListInventoryLot",
          "queries:listVendorBillMatchByVendorOrderLineId":
            "useListVendorBillMatch",
          "queries:listReceiptCorrectionByVendorOrderLineId":
            "useListReceiptCorrection",
          "queries:listPackListByEventId": "useListPackList",
          "queries:listInventoryLotByIngredientId": "useListInventoryLot",
          "queries:listStockCountLineByStockCountSessionId":
            "useListStockCountLine",
        };
        if (byField[name]) {
          const [field, value] = Object.entries(
            args as Record<string, unknown>,
          )[0]!;
          return live(byField[name]).filter((row) => row[field] === value);
        }
        if (name === "queries:listVendorOrderByTenantIdAndStatus") {
          const { status } = args as { status: string };
          const lines = live("useListVendorOrderLine");
          return live("useListVendorOrder")
            .filter((row) => row.status === status)
            .map((row) => ({
              ...row,
              lines: lines.filter((line) => line.vendorOrderId === row._id),
            }));
        }
        if (name.startsWith("logisticsWindow:")) {
          const a = args as {
            eventIds?: string[];
            statuses?: string[];
            withLines?: boolean;
            equipmentIds?: string[];
            venueIds?: string[];
            vendorOrderId?: string;
          };
          if (name === "logisticsWindow:forEvents") {
            const ids = new Set(a.eventIds ?? []);
            const ofEvents = (hook: string) =>
              live(hook).filter((row) => ids.has(String(row.eventId)));
            const packLists = ofEvents("useListPackList");
            const listIds = new Set(packLists.map((row) => row._id));
            const rigs = ofEvents("useListEventVehicleAssignment");
            const rigIds = new Set(rigs.map((row) => row._id));
            return {
              packLists,
              packLines: live("useListPackListItem").filter((row) =>
                listIds.has(row.packListId),
              ),
              rigs,
              tripChecks: live("useListVehicleTripCheck").filter((row) =>
                rigIds.has(row.eventVehicleAssignmentId),
              ),
              reservations: ofEvents("useListEquipmentReservation"),
              deliveries: ofEvents("useListDelivery"),
              departureOverrides: ofEvents("useListDepartureOverride"),
              assignments: ofEvents("useListEventAssignment"),
              staffNeeds: ofEvents("useListEventStaffNeed"),
              issues: ofEvents("useListEquipmentIssue"),
            };
          }
          if (name === "logisticsWindow:packListsByStatus") {
            const packLists = live("useListPackList").filter((row) =>
              (a.statuses ?? []).includes(String(row.status)),
            );
            const listIds = new Set(packLists.map((row) => row._id));
            return {
              packLists,
              packLines: a.withLines
                ? live("useListPackListItem").filter((row) =>
                    listIds.has(row.packListId),
                  )
                : [],
            };
          }
          if (name === "logisticsWindow:deliveriesByStatus")
            return live("useListDelivery").filter((row) =>
              (a.statuses ?? []).includes(String(row.status)),
            );
          if (name === "logisticsWindow:openEquipmentIssues")
            return live("useListEquipmentIssue").filter(
              (row) => row.status === "open",
            );
          if (name === "logisticsWindow:holdsForEquipment")
            return live("useListEquipmentReservation").filter((row) =>
              (a.equipmentIds ?? []).includes(String(row.equipmentId)),
            );
          if (name === "logisticsWindow:venueEventsSince")
            return live("useListEvent").filter((row) =>
              (a.venueIds ?? []).includes(String(row.venueId)),
            );
          if (name === "logisticsWindow:vendorOrderNeeds") {
            const lineIds = new Set(
              live("useListVendorOrderLine")
                .filter((row) => row.vendorOrderId === a.vendorOrderId)
                .map((row) => row._id),
            );
            const demandIds = new Set(
              live("useListVendorOrderLineDemand")
                .filter((row) => row.vendorOrderId === a.vendorOrderId)
                .map((row) => row.ingredientDemandId),
            );
            return {
              needs: live("useListPurchaseNeed").filter(
                (row) =>
                  lineIds.has(row.vendorOrderLineId) ||
                  demandIds.has(row.ingredientDemandId),
              ),
              demands: live("useListIngredientDemand").filter((row) =>
                demandIds.has(row._id),
              ),
            };
          }
        }
        // Supply reads (convex/inventoryWindow.ts): the same narrowing.
        if (name.startsWith("inventoryWindow:")) {
          const a = (args ?? {}) as {
            eventIds?: string[];
            dishIds?: string[];
            demandIds?: string[];
            sessionIds?: string[];
            windows?: { from: number; to: number }[];
            from?: number;
            lotNumber?: string;
            receivedFrom?: number | null;
            receivedTo?: number | null;
          };
          const inList = (values: string[] | undefined, value: unknown) =>
            (values ?? []).includes(String(value));
          if (name === "inventoryWindow:demandsForEvents")
            return {
              demands: live("useListIngredientDemand").filter((row) =>
                inList(a.eventIds, row.eventId),
              ),
              needs: live("useListPurchaseNeed").filter((row) =>
                inList(a.eventIds, row.eventId),
              ),
            };
          if (name === "inventoryWindow:demandHistory") {
            const demands = live("useListIngredientDemand").filter(
              (row) =>
                inList(a.dishIds, row.dishId) &&
                (row.status === "confirmed" || row.status === "fulfilled"),
            );
            return {
              demands,
              events: live("useListEvent").filter((row) =>
                demands.some((demand) => demand.eventId === row._id),
              ),
            };
          }
          if (name === "inventoryWindow:demandInWindows") {
            const events = live("useListEvent").filter((row) =>
              (a.windows ?? []).some(
                (w) =>
                  typeof row.startsAt === "number" &&
                  row.startsAt >= w.from &&
                  row.startsAt < w.to,
              ),
            );
            return {
              events,
              demands: live("useListIngredientDemand").filter((row) =>
                events.some((event) => event._id === row.eventId),
              ),
            };
          }
          if (name === "inventoryWindow:linesForDemands") {
            const links = live("useListVendorOrderLineDemand").filter((row) =>
              inList(a.demandIds, row.ingredientDemandId),
            );
            const lines = live("useListVendorOrderLine").filter(
              (row) =>
                inList(a.demandIds, row.ingredientDemandId) ||
                links.some((link) => link.vendorOrderLineId === row._id),
            );
            return {
              lines,
              links,
              orders: live("useListVendorOrder").filter((row) =>
                lines.some((line) => line.vendorOrderId === row._id),
              ),
            };
          }
          if (name === "inventoryWindow:sentOrderNeeds") {
            const orders = live("useListVendorOrder").filter((row) =>
              ["submitted", "confirmed", "partially_received"].includes(
                String(row.status),
              ),
            );
            return {
              orders,
              needs: live("useListPurchaseNeed").filter((row) =>
                orders.some((order) => order._id === row.vendorOrderId),
              ),
            };
          }
          if (name === "inventoryWindow:vendorScoreInputs") {
            const orders = live("useListVendorOrder").filter(
              (row) =>
                row.status === "received" &&
                typeof row.receivedAt === "number" &&
                row.receivedAt >= (a.from ?? 0),
            );
            return {
              orders,
              lines: live("useListVendorOrderLine").filter((row) =>
                orders.some((order) => order._id === row.vendorOrderId),
              ),
              observations: live("useListIngredientPriceObservation"),
            };
          }
          if (name === "inventoryWindow:traceLots") {
            const typed = (a.lotNumber ?? "").trim();
            const lots = live("useListInventoryLot").filter((lot) => {
              const number = String(lot.supplierLotNumber ?? "");
              const at = lot.receivedAt as number | null | undefined;
              return (
                (!typed ||
                  number.startsWith(typed) ||
                  number.startsWith(typed.toUpperCase())) &&
                (a.receivedFrom == null ||
                  (at != null && at >= a.receivedFrom)) &&
                (a.receivedTo == null || (at != null && at <= a.receivedTo))
              );
            });
            const holds = live("useListInventoryReservation");
            return {
              lots,
              reservations: holds.filter((row) =>
                lots.some((lot) => lot._id === row.inventoryLotId),
              ),
              unattributed: typed
                ? 0
                : holds.filter(
                    (row) =>
                      !row.inventoryLotId &&
                      row.status === "consumed" &&
                      row.consumedAt != null,
                  ).length,
            };
          }
          if (name === "inventoryWindow:countSessionProgress")
            return Object.fromEntries(
              (a.sessionIds ?? []).map((id) => [
                id,
                live("useListStockCountLine").filter(
                  (line) =>
                    line.stockCountSessionId === id &&
                    line.status === "reconciled",
                ).length,
              ]),
            );
          if (name === "inventoryWindow:openingStockCounts") {
            const rows = live("useListOpeningStockRecord");
            return {
              needs_review: rows.filter((row) => row.status === "needs_review")
                .length,
              ready: rows.filter((row) => row.status === "ready").length,
              done: rows.filter(
                (row) => row.status === "applied" || row.status === "set_aside",
              ).length,
            };
          }
          if (name === "inventoryWindow:wasteSince")
            return live("useListWasteRecord");
        }
      }
      return backend.values.get(name);
    },
    // A one-off read answers as the live read would.
    useConvex: () => ({
      query: async (reference: unknown, args?: unknown) =>
        (await import("convex/react")).useQuery(
          reference as Parameters<typeof getFunctionName>[0],
          args as never,
        ),
    }),
    // All-time event pages (eventLookup:reportPage) and dish pages
    // (dishLookup:page) answer in one page from the generated list's rows,
    // unless the test sets its own.
    usePaginatedQuery: (
      reference: Parameters<typeof getFunctionName>[0],
      args?: unknown,
    ) => {
      const name = getFunctionName(reference);
      backend.reads(name, args);
      if (args === "skip")
        return { results: [], status: "LoadingFirstPage", loadMore: () => {} };
      const rows =
        name === "eventLookup:reportPage" && !backend.values.has(name)
          ? backend.values.get("useListEvent")
          : name === "clientDirectory:contactsPage" && !backend.values.has(name)
            ? backend.values.get("useListClient")
            : name === "dishLookup:page" && !backend.values.has(name)
              ? backend.values.get("useListDish")
              : name === "logisticsWindow:packListPage" &&
                  !backend.values.has(name)
                ? (backend.values.get("useListPackList") ?? [])
                : name.startsWith("inventoryWindow:") &&
                    !backend.values.has(name)
                  ? supplyPage(name, args)
                  : name.startsWith("workforceHistoryWindow:") &&
                      !backend.values.has(name)
                    ? (
                        (backend.values.get(
                          {
                            "workforceHistoryWindow:candidatePage":
                              "useListCandidate",
                            "workforceHistoryWindow:oneOnOnePage":
                              "useListOneOnOne",
                            "workforceHistoryWindow:performanceReviewPage":
                              "useListPerformanceReview",
                            "workforceHistoryWindow:trainingCompletionPage":
                              "useListTrainingCompletion",
                            "workforceHistoryWindow:trainingSignOffPage":
                              "useListTrainingSignOff",
                            "workforceHistoryWindow:announcementPage":
                              "useListAnnouncement",
                          }[name] ?? name,
                        ) ?? []) as { deletedAt?: number | null }[]
                      ).filter((row) => row.deletedAt == null)
                    : name.startsWith("workforceWindow:") &&
                        !backend.values.has(name)
                      ? (
                          (backend.values.get(
                            {
                              "workforceWindow:timeRecordPage":
                                "useListTimeRecord",
                              "workforceWindow:availabilityWindowPage":
                                "useListAvailabilityWindow",
                              "workforceWindow:swapRequestPage":
                                "useListShiftSwapRequest",
                            }[name] ?? name,
                          ) ?? []) as { deletedAt?: number | null }[]
                        ).filter((row) => row.deletedAt == null)
                      : backend.values.get(name);
      return rows === undefined
        ? { results: [], status: "LoadingFirstPage", loadMore: () => {} }
        : { results: rows, status: "Exhausted", loadMore: () => {} };
    },
    useMutation: command,
    useAction: command,
    useConvexAuth: () => ({
      isAuthenticated: backend.authenticated,
      isLoading: false,
    }),
    Authenticated: ({ children }: { children: ReactNode }) =>
      backend.authenticated ? children : null,
    Unauthenticated: ({ children }: { children: ReactNode }) =>
      backend.authenticated ? null : children,
    AuthLoading: () => null,
    AuthRefreshing: () => null,
  };
});
vi.mock("@clerk/react", () => ({
  useUser: () => ({
    user: backend.user,
    isLoaded: true,
    isSignedIn: backend.authenticated,
  }),
  useOrganization: () => ({
    organization: backend.organization,
    isLoaded: true,
  }),
  useSession: () => ({
    session: backend.session,
    isLoaded: true,
    isSignedIn: backend.authenticated,
  }),
  useOrganizationList: () => ({
    isLoaded: true,
    setActive: backend.setActive,
    userMemberships: { data: backend.memberships },
  }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: backend.authenticated,
    getToken: backend.session.getToken,
  }),
  useClerk: () => backend.clerk,
  OrganizationSwitcher: () => null,
  UserButton: () => null,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
let root: Root | undefined;
export let container: HTMLDivElement;
export let location = "";
function Location() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  backend.values.clear();
  backend.reads.mockClear();
  for (const call of backend.calls.values())
    call.mockReset().mockRejectedValue(new Error("Unconfigured command"));
  backend.authenticated = true;
  backend.memberships = [];
  backend.organization.id = "tenant-a";
  backend.setActive.mockReset().mockResolvedValue(undefined);
  backend.session.getToken.mockReset();
  backend.values.set("authStatus:getAuthStatus", {
    authenticated: true,
    accountId: "user-a",
    personId: "person-a",
    tenantId: "tenant-a",
    role: "owner",
    hasRole: true,
    hasTenant: true,
  });
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
export async function mount(node: ReactNode, path = "/") {
  root ??= createRoot(container);
  await act(async () =>
    root!.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        node,
        createElement(Location),
      ),
    ),
  );
}
export function command(
  name: string,
  result: unknown = { docId: "created-record" },
) {
  const call = backend.calls.get(name) ?? vi.fn();
  call.mockResolvedValue(result);
  backend.calls.set(name, call);
  return call;
}
export function field(name: string, scope: ParentNode = container) {
  const element = scope.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(`[name="${name}"]`);
  expect(element, `Missing form field ${name}`).not.toBeNull();
  return element!;
}
export function input(
  name: string,
  value: string,
  scope: ParentNode = container,
) {
  const element = field(name, scope);
  change(element, value);
}
export function change(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      element instanceof HTMLSelectElement
        ? new Event("change", { bubbles: true })
        : new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value,
          }),
    );
  });
}
export function button(text: string, scope: ParentNode = container) {
  const matches = [
    ...scope.querySelectorAll<HTMLButtonElement>("button"),
  ].filter(
    (node) =>
      node.textContent?.trim() === text ||
      node.getAttribute("aria-label") === text,
  );
  expect(matches, `Expected one button: ${text}`).toHaveLength(1);
  return matches[0]!;
}
export async function click(element: HTMLElement) {
  await act(async () => element.click());
}
export async function submit(form: HTMLFormElement) {
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
