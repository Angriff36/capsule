import { v } from "convex/values";
import { query } from "./_generated/server";
import { readDemandProvenance } from "./lib/demandProvenance/DemandProvenanceManager";

/** Read-only, demand-scoped calculation trace. Authorization mirrors inventory demand. */
export const get = query({
  args: { ingredientDemandId: v.id("ingredientDemands") },
  handler: (ctx, args) =>
    readDemandProvenance(ctx, String(args.ingredientDemandId)),
});
