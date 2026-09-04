/**
 * AUTHOR SEAM — personal favorites for the TPP-compatible report catalog.
 *
 * Favorite rows never grant access to report data. A null reportId is a small
 * initialization marker so a person can intentionally clear every favorite
 * without the seven TPP defaults returning on the next visit.
 */
import { v } from "convex/values";
import {
  TPP_DEFAULT_FAVORITES,
  TPP_REPORT_BY_ID,
} from "../src/features/reports/tpp/catalog";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

const FAVORITE_ROWS_CAP = 100;

async function rowsForPerson(
  ctx: QueryCtx | MutationCtx,
  personId: string,
  tenantId: string,
) {
  const rows = await ctx.db
    .query("tppReportFavorites")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .take(FAVORITE_ROWS_CAP);
  return rows.filter((row) => row.tenantId === tenantId);
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.personId) {
      return { initialized: false, reportIds: [] as string[] };
    }

    const rows = await rowsForPerson(ctx, auth.personId, auth.tenantId);
    return {
      initialized: rows.some((row) => row.reportId == null),
      reportIds: [
        ...new Set(
          rows.flatMap((row) =>
            row.reportId && TPP_REPORT_BY_ID.has(row.reportId)
              ? [row.reportId]
              : [],
          ),
        ),
      ],
    };
  },
});

export const setFavorite = mutation({
  args: { reportId: v.string(), favorite: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.personId) {
      throw new Error("Sign in to change report favorites");
    }
    if (!TPP_REPORT_BY_ID.has(args.reportId)) {
      throw new Error("Unknown TPP report");
    }

    const now = Date.now();
    let rows = await rowsForPerson(ctx, auth.personId, auth.tenantId);
    const initialized = rows.some((row) => row.reportId == null);

    if (!initialized) {
      await ctx.db.insert("tppReportFavorites", {
        tenantId: auth.tenantId,
        personId: auth.personId,
        reportId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      for (const reportId of TPP_DEFAULT_FAVORITES) {
        await ctx.db.insert("tppReportFavorites", {
          tenantId: auth.tenantId,
          personId: auth.personId,
          reportId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        });
      }
      rows = await rowsForPerson(ctx, auth.personId, auth.tenantId);
    }

    const matching = rows.filter((row) => row.reportId === args.reportId);
    if (args.favorite && matching.length === 0) {
      await ctx.db.insert("tppReportFavorites", {
        tenantId: auth.tenantId,
        personId: auth.personId,
        reportId: args.reportId,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
    }
    if (!args.favorite) {
      for (const row of matching) await ctx.db.delete(row._id);
    }
    if (args.favorite) {
      for (const duplicate of matching.slice(1)) {
        await ctx.db.delete(duplicate._id);
      }
    }

    return { reportId: args.reportId, favorite: args.favorite };
  },
});
