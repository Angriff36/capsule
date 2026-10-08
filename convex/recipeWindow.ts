// Kitchen screens about one recipe, one dish or one week of prep read their
// rows here through indexes. They used to load these tables whole (every
// price, import, prep step, check and invoice the company ever had), and on
// the live server whole-table loads ran out of time.
//
// Each kind keeps the read rule of its generated list (convex/queries.ts);
// a kind the caller may not read comes back empty, as those lists do. None of
// these tables has encrypted fields in its generated list.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";
import { latestPriceByIngredient } from "../src/features/kitchen/IngredientPriceHistory";

export const INGREDIENT_IDS_CAP = 1000;
export const BOARD_EVENT_CAP = 500;
const OPEN_IMPORTS_SHOWN = 8;

const live = <T extends { tenantId: string; deletedAt?: number | null }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);

/** Prep-step materials of one dish's prep steps (listDishTaskMaterial). */
export const dishTaskMaterials = query({
  args: { dishId: v.string() },
  handler: async (ctx, { dishId }): Promise<Doc<"dishTaskMaterials">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["kitchenAccess", "manageAccess"]))
      return [];
    const tenantId = auth.tenantId;
    const id = ctx.db.normalizeId("dishes", dishId);
    if (!id) return [];
    const tasks = await ctx.db
      .query("dishTasks")
      .withIndex("by_dishId", (q) => q.eq("dishId", id))
      .collect();
    const out: Doc<"dishTaskMaterials">[] = [];
    for (const task of tasks) {
      if (task.tenantId !== tenantId) continue;
      out.push(
        ...live(
          await ctx.db
            .query("dishTaskMaterials")
            .withIndex("by_dishTaskId", (q) => q.eq("dishTaskId", task._id))
            .collect(),
          tenantId,
        ),
      );
    }
    return out;
  },
});

/**
 * The latest price observation of each of these ingredients, the one a cost
 * uses (listIngredientPriceObservation read rule; latest by the same rule as
 * the screens' latestPriceByIngredient). Older prices stay on the server.
 */
export const latestPriceObservations = query({
  args: { ingredientIds: v.array(v.string()) },
  handler: async (
    ctx,
    { ingredientIds },
  ): Promise<Doc<"ingredientPriceObservations">[]> => {
    const auth = await getAuthContext(ctx);
    if (
      !auth.tenantId ||
      !canRead(auth, ["kitchenAccess", "procurementAccess", "manageAccess"])
    )
      return [];
    const tenantId = auth.tenantId;
    const out: Doc<"ingredientPriceObservations">[] = [];
    for (const raw of [...new Set(ingredientIds)].slice(
      0,
      INGREDIENT_IDS_CAP,
    )) {
      const id = ctx.db.normalizeId("ingredients", raw);
      if (!id) continue;
      out.push(
        ...live(
          await ctx.db
            .query("ingredientPriceObservations")
            .withIndex("by_ingredientId", (q) => q.eq("ingredientId", id))
            .collect(),
          tenantId,
        ),
      );
    }
    const latest = new Set(
      [...latestPriceByIngredient(out).values()].map((row) => row._id),
    );
    return out.filter((row) => latest.has(row._id));
  },
});

export type OpenComponentImport = Pick<
  Doc<"componentImports">,
  "_id" | "parsedName" | "sourceFilename" | "status" | "updatedAt"
>;

const RESUMABLE = new Set([
  "uploaded",
  "parsed",
  "reviewing",
  "ready",
  "finalizing",
  "failed",
]);

/**
 * The recipe imports still in progress, most recently changed first, at most
 * eight, without their source text (listComponentImport). componentImports
 * has no status index, so the company's imports are read here and only the
 * few short rows the import page lists go to the browser.
 */
export const openComponentImports = query({
  args: {},
  handler: async (ctx): Promise<OpenComponentImport[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["kitchenAccess"])) return [];
    const tenantId = auth.tenantId;
    const rows = await ctx.db
      .query("componentImports")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    return rows
      .filter((row) => row.deletedAt == null && RESUMABLE.has(row.status))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, OPEN_IMPORTS_SHOWN)
      .map((row) => ({
        _id: row._id,
        parsedName: row.parsedName,
        sourceFilename: row.sourceFilename,
        status: row.status,
        updatedAt: row.updatedAt,
      }));
  },
});

export type BoardInvoice = Pick<
  Doc<"invoices">,
  "_id" | "eventId" | "status" | "invoiceNumber" | "deletedAt"
>;

/**
 * The kitchen board's rows for the events it shows: their prep steps, the
 * "do after" links and quality checks of those steps, and the events'
 * invoice numbers (listPrepTask, listPrepTaskDependency, listQualityCheck,
 * listInvoice read rules).
 */
export const prepBoard = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      tasks: [] as Doc<"prepTasks">[],
      dependencies: [] as Doc<"prepTaskDependencies">[],
      qualityChecks: [] as Doc<"qualityChecks">[],
      invoices: [] as BoardInvoice[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const readsPrep = canRead(auth, ["kitchenAccess", "manageAccess"]);
    const readsChecks = canRead(auth, ["kitchenAccess"]);
    const readsInvoices = canRead(auth, ["financeAccess", "manageAccess"]);
    const ids: Id<"events">[] = [];
    for (const raw of [...new Set(eventIds)].slice(0, BOARD_EVENT_CAP)) {
      const id = ctx.db.normalizeId("events", raw);
      if (id) ids.push(id);
    }
    for (const eventId of ids) {
      // Steps are read for the checks even when the caller may not see them.
      const tasks =
        readsPrep || readsChecks
          ? live(
              await ctx.db
                .query("prepTasks")
                .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                .collect(),
              tenantId,
            )
          : [];
      if (readsPrep) out.tasks.push(...tasks);
      for (const task of tasks) {
        if (readsPrep)
          out.dependencies.push(
            ...(
              await ctx.db
                .query("prepTaskDependencies")
                .withIndex("by_dependentTaskId", (q) =>
                  q.eq("dependentTaskId", task._id),
                )
                .collect()
            ).filter((row) => row.tenantId === tenantId),
          );
        if (readsChecks)
          out.qualityChecks.push(
            ...live(
              await ctx.db
                .query("qualityChecks")
                .withIndex("by_prepTaskId", (q) => q.eq("prepTaskId", task._id))
                .collect(),
              tenantId,
            ),
          );
      }
      if (readsInvoices)
        for (const invoice of live(
          await ctx.db
            .query("invoices")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        ))
          out.invoices.push({
            _id: invoice._id,
            eventId: invoice.eventId,
            status: invoice.status,
            invoiceNumber: invoice.invoiceNumber,
            deletedAt: invoice.deletedAt,
          });
    }
    return out;
  },
});
