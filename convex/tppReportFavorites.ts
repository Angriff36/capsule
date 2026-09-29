/**
 * AUTHOR SEAM — personal favorites for the TPP-compatible report catalog.
 *
 * Favorite rows never grant access to report data. A null reportId is a small
 * initialization marker so a person can intentionally clear every favorite
 * without the seven TPP defaults returning on the next visit.
 *
 * 2026-09-29: writes run the generated TppReportFavorite commands with the
 * caller's auth (create, unfavorite, refavorite). Unfavoriting soft-deletes the
 * row and favoriting the same report again restores it, so one person keeps
 * at most one row per catalog report. Duplicates left by an old race stay:
 * the reads below fold them, and unfavoriting retires every one.
 */
import { v } from "convex/values";
import {
  TPP_DEFAULT_FAVORITES,
  TPP_REPORT_BY_ID,
} from "../src/features/reports/tpp/catalog";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

const FAVORITE_ROWS_CAP = 100;

/** Every row for the person, retired ones too (they are restored, not re-made). */
async function rowsForPerson(
  ctx: QueryCtx | MutationCtx,
  personId: string,
  tenantId: string,
): Promise<Doc<"tppReportFavorites">[]> {
  const rows = await ctx.db
    .query("tppReportFavorites")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .take(FAVORITE_ROWS_CAP);
  return rows.filter((row) => row.tenantId === tenantId);
}

const live = (row: Doc<"tppReportFavorites">) => row.deletedAt == null;

/** Make one report a favorite: nothing if it is, restore a retired row, or create. */
async function favorite(
  ctx: MutationCtx,
  rows: readonly Doc<"tppReportFavorites">[],
  reportId: string,
): Promise<void> {
  const matching = rows.filter((row) => row.reportId === reportId);
  if (matching.some(live)) return;
  const retired = matching[0];
  if (retired) {
    await ctx.runMutation(api.mutations.TppReportFavorite_refavorite, {
      docId: retired._id,
    });
    return;
  }
  await ctx.runMutation(api.mutations.TppReportFavorite_create, { reportId });
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.personId) {
      return { initialized: false, reportIds: [] as string[] };
    }

    const rows = (
      await rowsForPerson(ctx, auth.personId, auth.tenantId)
    ).filter(live);
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

    let rows = await rowsForPerson(ctx, auth.personId, auth.tenantId);
    const initialized = rows.some((row) => row.reportId == null && live(row));

    if (!initialized) {
      await ctx.runMutation(api.mutations.TppReportFavorite_create, {});
      for (const reportId of TPP_DEFAULT_FAVORITES) {
        await favorite(ctx, rows, reportId);
      }
      rows = await rowsForPerson(ctx, auth.personId, auth.tenantId);
    }

    const matching = rows.filter((row) => row.reportId === args.reportId);
    if (args.favorite) await favorite(ctx, rows, args.reportId);
    if (!args.favorite) {
      for (const row of matching.filter(live)) {
        await ctx.runMutation(api.mutations.TppReportFavorite_unfavorite, {
          docId: row._id,
        });
      }
    }

    return { reportId: args.reportId, favorite: args.favorite };
  },
});
