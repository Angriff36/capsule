import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";
import type { Id } from "../_generated/dataModel";

type ViewDefinition = {
  pageKey?: unknown;
  isDefault?: unknown;
  state?: unknown;
};

async function personalViews(
  ctx: any,
  tenantId: string,
  ownerId: string,
  pageKey: string,
) {
  const rows = await ctx.db
    .query("savedReportDefinitions")
    .withIndex("by_ownerId", (q: any) => q.eq("ownerId", ownerId))
    .collect();
  return rows.filter((row: any) => {
    const definition = row.definition as ViewDefinition;
    return (
      row.tenantId === tenantId &&
      row.deletedAt == null &&
      row.status === "active" &&
      row.chartType === "list-view" &&
      definition?.pageKey === pageKey
    );
  });
}

export const setDefault = mutation({
  args: { pageKey: v.string(), targetId: v.id("savedReportDefinitions") },
  handler: async (ctx, args): Promise<void> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!auth.personId) throw new Error("A linked staff profile is required");
    const rows = await personalViews(
      ctx,
      tenantId,
      auth.personId,
      args.pageKey,
    );
    const target = rows.find((row: any) => row._id === args.targetId);
    if (!target) throw new Error("Saved view not found");
    for (const row of rows.filter(
      (candidate: any) =>
        candidate.definition?.isDefault === true &&
        candidate._id !== target._id,
    )) {
      await ctx.runMutation(
        api.mutations.SavedReportDefinition_updateDefinition,
        {
          docId: row._id,
          version: row.version,
          definition: { ...row.definition, isDefault: false },
        },
      );
    }
    if (target.definition?.isDefault !== true) {
      await ctx.runMutation(
        api.mutations.SavedReportDefinition_updateDefinition,
        {
          docId: target._id,
          version: target.version,
          definition: { ...target.definition, isDefault: true },
        },
      );
    }
  },
});

export const create = mutation({
  args: {
    pageKey: v.string(),
    name: v.string(),
    subjectArea: v.any(),
    state: v.any(),
    makeDefault: v.boolean(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ docId: Id<"savedReportDefinitions"> }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!auth.personId) throw new Error("A linked staff profile is required");
    const rows = await personalViews(
      ctx,
      tenantId,
      auth.personId,
      args.pageKey,
    );
    if (args.makeDefault) {
      for (const row of rows.filter(
        (candidate: any) => candidate.definition?.isDefault === true,
      )) {
        await ctx.runMutation(
          api.mutations.SavedReportDefinition_updateDefinition,
          {
            docId: row._id,
            version: row.version,
            definition: { ...row.definition, isDefault: false },
          },
        );
      }
    }
    return (await ctx.runMutation(
      api.mutations.SavedReportDefinition_createViaCreateDefinition,
      {
        name: args.name,
        subjectArea: args.subjectArea,
        chartType: "list-view",
        definition: {
          pageKey: args.pageKey,
          isDefault: args.makeDefault,
          state: args.state,
        },
        sharingScope: "owner_only",
      },
    )) as { docId: Id<"savedReportDefinitions"> };
  },
});
