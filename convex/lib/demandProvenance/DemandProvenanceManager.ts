import type { QueryCtx } from "../../_generated/server";
import { getAuthContext } from "../authContext";
import { permits } from "../operationalTransactions";
import { changedInputs } from "./DemandSnapshotDiffManager";
import type { DemandProvenanceChange, DemandProvenanceRow, DemandProvenanceTotal } from "./types";

const MASS: Record<string, number> = { gram: 1, kilogram: 1000, ounce: 28.349523125, pound: 453.59237 };
const VOLUME: Record<string, number> = { milliliter: 1, liter: 1000, teaspoon: 4.92892159375, tablespoon: 14.78676478125, cup: 236.5882365, pint: 473.176473, quart: 946.352946, gallon: 3785.411784 };

function reconcileTotal(rows: DemandProvenanceRow[], demandUnit: string): DemandProvenanceTotal {
  const live = rows.filter((row) => !row.deleted);
  const factors = MASS[demandUnit] ? MASS : VOLUME[demandUnit] ? VOLUME : null;
  if (!factors || live.some((row) => factors[row.unit] == null)) return { state: "mismatch", units: [...new Set(live.map((row) => row.unit))] };
  return { state: "ready", quantity: live.reduce((total, row) => total + (row.quantity * factors[row.unit]) / factors[demandUnit], 0), unit: demandUnit };
}

export async function readDemandProvenance(ctx: QueryCtx, demandId: string) {
  const auth = await getAuthContext(ctx);
  if (!permits(auth, "inventoryAccess") && !permits(auth, "manageAccess")) return null;
  const id = ctx.db.normalizeId("ingredientDemands", demandId);
  const demand = id ? await ctx.db.get(id) : null;
  if (!demand || demand.tenantId !== auth.tenantId || demand.deletedAt != null) return null;

  const sourceRows = await ctx.db
    .query("eventIngredientContributions")
    .withIndex("by_eventId_and_ingredientId", (q) => q.eq("eventId", demand.eventId).eq("ingredientId", demand.ingredientId))
    .collect();
  const rows: DemandProvenanceRow[] = sourceRows
    .filter((row) => row.tenantId === auth.tenantId)
    .map((row) => ({
      id: String(row._id), quantity: row.quantity, unit: row.unit,
      deleted: row.deletedAt != null, sourceKey: row.sourceKey ?? null,
      supersededBySourceKey: row.supersededBySourceKey ?? null,
      dishId: String(row.dishId), componentId: row.componentId ? String(row.componentId) : null,
      eventId: String(row.eventId),
      calculationSnapshot: row.calculationSnapshot && typeof row.calculationSnapshot === "object"
        ? row.calculationSnapshot as Record<string, unknown> : null,
      supersedeReason: row.supersedeReason ?? null,
    }));
  const history = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", String(demand._id)))
    .order("desc")
    .take(50);
  const changes: DemandProvenanceChange[] = history.flatMap((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (event.type === "IngredientDemandRecalculated") return [{
      at: event.createdAt, kind: "recalculated" as const,
      reason: typeof payload.reason === "string" ? payload.reason : null,
      previousQuantity: typeof payload.previousQuantity === "number" ? payload.previousQuantity : null,
      nextQuantity: typeof payload.requiredQuantity === "number" ? payload.requiredQuantity : null,
      changedInputs: [],
    }];
    return [];
  });
  for (const row of sourceRows.filter((item) => item.deletedAt != null && item.supersededBySourceKey)) {
    const before = rows.find((item) => item.id === String(row._id));
    const replacement = rows.find((item) => item.sourceKey === row.supersededBySourceKey);
    if (!before) continue;
    changes.push({ at: row.supersededAt ?? row.updatedAt ?? row._creationTime, kind: "superseded", reason: row.supersedeReason ?? null,
      previousQuantity: before.quantity, nextQuantity: replacement?.quantity ?? null,
      changedInputs: changedInputs(before.calculationSnapshot, replacement?.calculationSnapshot) });
  }
  changes.sort((a, b) => b.at - a.at);
  return {
    demand: { id: String(demand._id), eventId: String(demand.eventId), requiredQuantity: demand.requiredQuantity, unit: demand.unit },
    rows,
    changes,
    contributionTotal: reconcileTotal(rows, demand.unit),
  };
}
