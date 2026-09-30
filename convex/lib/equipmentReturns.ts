/**
 * PL-RETURNS (spec §13.3, PR10-06): what a return check, a vendor return and
 * a truck leaving mean for equipment, run from the ledger events in the same
 * transaction as the command (convex/lib/operationalEvents.ts), so the form,
 * the command API and any other caller get the same result.
 *
 * - A return check with broken, dirty or missing units opens one
 *   EquipmentIssue per kind. Broken and dirty units stay out of use until the
 *   issue is sorted out; missing units already left the count
 *   (Equipment.writeOffMissing).
 * - A vendor return that is short opens a vendor_return issue for what the
 *   rental company will bill.
 * - A dispatched pack list checks out the held equipment on its packed pull
 *   lines, so the return check can be recorded against what really left.
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type IssueKind = Doc<"equipmentIssues">["kind"];

async function issuesForEvent(ctx: MutationCtx, eventId: string) {
  return ctx.db
    .query("equipmentIssues")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId as Id<"events">))
    .collect();
}

function amountOf(quantity: number, unitPrice: number | null | undefined) {
  return unitPrice != null && unitPrice > 0
    ? Math.round(quantity * unitPrice * 100) / 100
    : undefined;
}

export async function raiseReturnIssues(
  ctx: MutationCtx,
  reservationId: Id<"equipmentReservations">,
): Promise<void> {
  const hold = await ctx.db.get(reservationId);
  if (!hold || hold.deletedAt != null || hold.status !== "returned") return;
  const equipment = await ctx.db.get(hold.equipmentId as Id<"equipments">);
  if (!equipment || equipment.tenantId !== hold.tenantId) return;
  const raised = new Set(
    (await issuesForEvent(ctx, hold.eventId))
      .filter(
        (issue) =>
          issue.tenantId === hold.tenantId &&
          issue.equipmentReservationId === String(hold._id),
      )
      .map((issue) => issue.kind),
  );
  const plan: Array<{
    kind: IssueKind;
    quantity: number;
    holdsUnits: boolean;
    severity: "low" | "medium";
    description: string;
    chargeAmount?: number;
  }> = [
    {
      kind: "damaged",
      quantity: Number(hold.damagedQuantity ?? 0),
      holdsUnits: true,
      severity: "medium",
      description: `came back broken`,
    },
    {
      kind: "cleaning",
      quantity: Number(hold.cleaningQuantity ?? 0),
      holdsUnits: true,
      severity: "low",
      description: `came back needing cleaning`,
    },
    {
      kind: "missing",
      quantity: Number(hold.missingQuantity ?? 0),
      holdsUnits: false,
      severity: "medium",
      description: `did not come back`,
      chargeAmount: amountOf(
        Number(hold.missingQuantity ?? 0),
        equipment.replacementCost,
      ),
    },
  ];
  for (const row of plan) {
    if (row.quantity <= 0 || raised.has(row.kind)) continue;
    await ctx.runMutation(api.mutations.EquipmentIssue_createViaRaise, {
      kind: row.kind,
      description: `${row.quantity} ${equipment.name} ${row.description}`,
      equipmentId: String(equipment._id),
      eventId: hold.eventId,
      equipmentReservationId: String(hold._id),
      quantity: row.quantity,
      severity: row.severity,
      holdsUnits: row.holdsUnits,
      ...(hold.returnNote ? { notes: hold.returnNote } : {}),
      ...(row.chargeAmount != null ? { chargeAmount: row.chargeAmount } : {}),
    });
  }
}

export async function raiseVendorReturnIssue(
  ctx: MutationCtx,
  rentalOrderLineId: Id<"rentalOrderLines">,
): Promise<void> {
  const line = await ctx.db.get(rentalOrderLineId);
  if (!line || line.deletedAt != null || line.status !== "returned") return;
  const short =
    Number(line.deliveredQuantity ?? 0) - Number(line.returnedQuantity ?? 0);
  if (short <= 0) return;
  const already = (await issuesForEvent(ctx, String(line.eventId))).some(
    (issue) =>
      issue.tenantId === line.tenantId &&
      issue.rentalOrderLineId === String(line._id),
  );
  if (already) return;
  const equipment = line.equipmentId
    ? await ctx.db.get(line.equipmentId as Id<"equipments">)
    : null;
  const ownEquipment =
    equipment && equipment.tenantId === line.tenantId ? equipment : null;
  const cost = amountOf(short, ownEquipment?.replacementCost);
  await ctx.runMutation(api.mutations.EquipmentIssue_createViaRaise, {
    kind: "vendor_return",
    description: `${short} ${line.description} not sent back to the rental company`,
    ...(ownEquipment ? { equipmentId: String(ownEquipment._id) } : {}),
    eventId: String(line.eventId),
    rentalOrderLineId: String(line._id),
    quantity: short,
    vendorId: String(line.vendorId),
    ...(cost != null ? { cost } : {}),
    ...(line.returnNote ? { notes: line.returnNote } : {}),
  });
}

export type EquipmentProblemMoney = {
  status: string;
  payer: string;
  cost: number | null;
  chargeAmount: number | null;
};

/**
 * AC-551 closeout money: what to bill the client, what to claim from a vendor,
 * what the company absorbs (repair or replacement cost), and how many
 * problems still wait for someone to say who pays.
 */
export function summarizeEquipmentProblems(rows: EquipmentProblemMoney[]) {
  const cents = (value: number | null) => Math.round(Number(value ?? 0) * 100);
  let chargeClient = 0;
  let chargeVendor = 0;
  let companyCost = 0;
  let payerUndecided = 0;
  let open = 0;
  for (const row of rows) {
    if (row.status === "open") open += 1;
    if (row.payer === "undecided") payerUndecided += 1;
    if (row.payer === "client") chargeClient += cents(row.chargeAmount);
    if (row.payer === "vendor") chargeVendor += cents(row.chargeAmount);
    companyCost += cents(row.cost);
  }
  return {
    open,
    payerUndecided,
    chargeClient: chargeClient / 100,
    chargeVendor: chargeVendor / 100,
    companyCost: companyCost / 100,
  };
}

type PackSourceRef = { sourceType?: string; sourceId?: string };

function heldReservationIds(sourcesJson: string | null | undefined): string[] {
  if (!sourcesJson) return [];
  try {
    const sources = JSON.parse(sourcesJson) as PackSourceRef[];
    return Array.isArray(sources)
      ? sources
          .filter((row) => row?.sourceType === "rental" && row.sourceId)
          .map((row) => String(row.sourceId))
      : [];
  } catch {
    return [];
  }
}

/** The truck left: held equipment on a packed pull line is now out. */
export async function checkOutDispatchedEquipment(
  ctx: MutationCtx,
  packListId: Id<"packLists">,
): Promise<void> {
  const pack = await ctx.db.get(packListId);
  if (!pack || pack.deletedAt != null || pack.status !== "dispatched") return;
  const items = await ctx.db
    .query("packListItems")
    .withIndex("by_packListId", (q) => q.eq("packListId", packListId))
    .collect();
  for (const item of items) {
    if (
      item.tenantId !== pack.tenantId ||
      item.deletedAt != null ||
      item.excludedAt != null ||
      Number(item.packedQuantity) <= 0
    )
      continue;
    for (const reservationId of heldReservationIds(item.sourcesJson)) {
      const hold = await ctx.db.get(
        reservationId as Id<"equipmentReservations">,
      );
      if (
        !hold ||
        hold.tenantId !== pack.tenantId ||
        hold.deletedAt != null ||
        hold.status !== "reserved"
      )
        continue;
      const equipment = await ctx.db.get(hold.equipmentId as Id<"equipments">);
      if (!equipment || equipment.tenantId !== pack.tenantId) continue;
      // Out-of-service gear without a manager's override stays reserved; Final
      // Lock and the pull sheet already name it.
      if (equipment.condition === "out_of_service" && !hold.overrideReason)
        continue;
      await ctx.runMutation(api.mutations.EquipmentReservation_checkOut, {
        docId: hold._id,
        version: hold.version,
        condition: equipment.condition,
        note: `Went out with ${pack.name}`,
      });
    }
  }
}
