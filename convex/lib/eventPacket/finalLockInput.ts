import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { decrypt } from "../encryption";
import { overlappingReservationQuantity } from "../equipmentReservationAvailability";
import { eventRows, readCurrentPacket } from "./reconcileNative";
import type { FinalLockInput } from "../../../src/lib/eventPacket/finalLock/types";
import type {
  PrintedAnswers,
  StoredOverride,
} from "../../../src/lib/eventPacket/finalLock/evaluate";

type Ctx = QueryCtx | MutationCtx;

/** Event text answers the Final Lock rules read (day sheet, setup, tasks). */
const TEXT_FIELDS = [
  "barService",
  "cocktailHourFood",
  "dessertService",
  "bussing",
  "placeSettings",
  "passedApps",
  "stationaryApps",
  "beveragesOnMenu",
  "tablesideWater",
  "mangiaDisposables",
  "eventRentals",
  "scullery",
  "buffetColdPlates",
  "buffetHotPlates",
  "linenColorTables",
  "linenColorBaskets",
  "servingwareKit",
  "decorKit",
  "rainPlan",
  "setupDiagram",
  "venueSurface",
  "tentAndFlooring",
  "handwashing",
  "servingwareSource",
  "takeRentalsWithUs",
  "leaveRentalsOnsite",
  "guestTableSetup",
  "buffetTableSetup",
  "appetizerTableSetup",
  "beverageTableSetup",
  "beverageDispensers",
  "buffetService",
] as const;

async function own(ctx: Ctx, table: string, id: unknown, tenantId: string) {
  if (typeof id !== "string") return null;
  const normalized = ctx.db.normalizeId(table as any, id);
  if (!normalized) return null;
  const row: any = await ctx.db.get(normalized);
  return row && row.tenantId === tenantId && row.deletedAt == null ? row : null;
}

async function plain(ctx: Ctx, value: unknown, property: string) {
  if (typeof value !== "string") return null;
  try {
    const envelope = JSON.parse(value);
    if (envelope?.v === 1 && envelope.ct && envelope.kid)
      return (await decrypt(envelope.ct, envelope.kid, {
        ctx,
        entity: "Event",
        property,
      })) as string;
  } catch {}
  return value;
}

const num = (value: unknown) => (typeof value === "number" ? value : null);
const str = (value: unknown) => (typeof value === "string" ? value : null);
const version = (row: any) => num(row?.version);

/**
 * Reads every native record the Final Lock rules use for one event, plus
 * the packet state, recorded overrides and what the latest print showed.
 * Caller has already checked the manager role and the event's workspace.
 */
export async function readFinalLockInput(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const packet = await readCurrentPacket(ctx, tenantId, eventId);
  const event: any = packet.event;
  const [style, clientRow, venueRow] = await Promise.all([
    own(ctx, "serviceStyles", event.serviceStyleId, tenantId),
    own(ctx, "clients", event.clientId, tenantId),
    own(ctx, "venues", event.venueId, tenantId),
  ]);

  const dishes = [];
  for (const line of await eventRows(ctx, "eventDishes", tenantId, eventId)) {
    if (line.removedAt != null) continue;
    const dish = await own(ctx, "dishes", line.dishId, tenantId);
    dishes.push({
      id: String(line._id),
      version: version(line),
      name: str(line.dishName) ?? str(dish?.name) ?? "",
      course: str(line.course),
      serviceStyle: str(line.serviceStyle),
      sortOrder: num(line.sortOrder),
      quantityServings: num(line.quantityServings),
      followsEventHeadcount:
        typeof line.followsEventHeadcount === "boolean"
          ? line.followsEventHeadcount
          : null,
      notes: str(line.specialInstructions),
    });
  }

  const timeline = (
    await eventRows(ctx, "eventTimelineActivities", tenantId, eventId)
  ).map((row) => ({
    id: String(row._id),
    version: version(row),
    name: String(row.name ?? ""),
    milestone: str(row.timingMilestone),
    startsAt: num(row.startsAt),
  }));

  const vehicles = [];
  for (const row of await eventRows(
    ctx,
    "eventVehicleAssignments",
    tenantId,
    eventId,
  )) {
    if (row.releasedAt != null) continue;
    const [vehicle, trailer] = await Promise.all([
      own(ctx, "vehicles", row.vehicleId, tenantId),
      own(ctx, "trailers", row.trailerId, tenantId),
    ]);
    const label = (v: any) =>
      v
        ? `${v.make ?? ""} ${v.model ?? ""}`.trim() || String(v.registration)
        : null;
    vehicles.push({
      id: String(row._id),
      version: version(row),
      vehicleId: str(row.vehicleId),
      vehicleName: label(vehicle),
      trailerId: str(row.trailerId),
      trailerName: label(trailer),
      driverId: str(row.driverId),
      outOfService: [vehicle, trailer].some(
        (v) =>
          v &&
          ["maintenance", "out_of_service", "retired"].includes(
            v.operationalStatus,
          ),
      ),
    });
  }

  const equipment = [];
  for (const row of await eventRows(
    ctx,
    "equipmentReservations",
    tenantId,
    eventId,
  )) {
    if (row.status !== "reserved" && row.status !== "checked_out") continue;
    const item = await own(ctx, "equipments", row.equipmentId, tenantId);
    let shortBy = item ? 0 : row.quantity;
    if (item && row.startsAt != null && row.endsAt != null) {
      const all = await ctx.db
        .query("equipmentReservations")
        .withIndex("by_equipmentId", (q) => q.eq("equipmentId", row.equipmentId))
        .collect();
      const booked = overlappingReservationQuantity(all as any, {
        tenantId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      });
      shortBy = Math.max(0, booked - item.quantity);
    }
    equipment.push({
      id: String(row._id),
      version: version(row),
      name: String(item?.name ?? "Equipment"),
      category: str(item?.category),
      rented: item?.ownership === "rented",
      quantity: row.quantity,
      status: row.status,
      shortBy,
    });
  }

  const packLists = [];
  const packItems = [];
  for (const row of await eventRows(ctx, "packLists", tenantId, eventId)) {
    if (row.status === "cancelled") continue;
    const items = (
      await ctx.db
        .query("packListItems")
        .withIndex("by_packListId", (q) => q.eq("packListId", row._id))
        .collect()
    ).filter((i) => i.tenantId === tenantId && i.deletedAt == null);
    for (const item of items)
      packItems.push({
        id: String(item._id),
        version: version(item),
        description: String(item.sentInstead ?? item.description),
      });
    packLists.push({
      id: String(row._id),
      version: version(row),
      status: row.status,
      itemCount: items.length,
      missingCount: items.filter((i) => i.status === "missing").length,
    });
  }

  const assignments = (
    await eventRows(ctx, "eventAssignments", tenantId, eventId)
  ).map((row) => ({
    id: String(row._id),
    version: version(row),
    status: String(row.status),
    confirmedAt: num(row.confirmedAt),
  }));

  const kitItems = style
    ? (
        await ctx.db
          .query("serviceStyleKitItems")
          .withIndex("by_serviceStyleId", (q) =>
            q.eq("serviceStyleId", style._id),
          )
          .collect()
      )
        .filter(
          (k) =>
            k.tenantId === tenantId && k.deletedAt == null && k.status === "active",
        )
        .map((k) => ({
          id: String(k._id),
          version: version(k),
          description: String(k.description),
        }))
    : [];

  // The accepted proposal is the agreed scope: its lines, extras and dishes.
  const accepted = (await eventRows(ctx, "proposals", tenantId, eventId))
    .filter((p) => p.status === "accepted")
    .sort((a, b) => (b.acceptedAt ?? 0) - (a.acceptedAt ?? 0))[0];
  let proposal: FinalLockInput["proposal"] = null;
  if (accepted) {
    const byProposal = (table: string) =>
      (ctx.db as any)
        .query(table)
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", accepted._id))
        .collect()
        .then((rows: any[]) =>
          rows.filter(
            (r) =>
              r.tenantId === tenantId && r.deletedAt == null && r.removedAt == null,
          ),
        );
    const [lineRows, extraRows, dishRows] = await Promise.all([
      byProposal("proposalLineItems"),
      byProposal("proposalEnhancements"),
      byProposal("proposalDishSelections"),
    ]);
    const lines = [];
    for (const r of lineRows)
      lines.push({
        id: String(r._id),
        version: version(r),
        table: "proposalLineItems",
        text: [r.description, r.notes].filter(Boolean).join(" - "),
      });
    for (const r of extraRows)
      lines.push({
        id: String(r._id),
        version: version(r),
        table: "proposalEnhancements",
        text: [r.name, r.description].filter(Boolean).join(" - "),
      });
    for (const r of dishRows) {
      const dish = await own(ctx, "dishes", r.dishId, tenantId);
      lines.push({
        id: String(r._id),
        version: version(r),
        table: "proposalDishSelections",
        text: [r.course, dish?.name].filter(Boolean).join(" - "),
      });
    }
    proposal = { id: String(accepted._id), version: version(accepted), lines };
  }

  const staffNeeds = (await eventRows(ctx, "eventStaffNeeds", tenantId, eventId))
    .filter((n) => n.status !== "cancelled")
    .map((n) => ({
      id: String(n._id),
      version: version(n),
      role: String(n.role),
      status: String(n.status),
    }));

  const channelRows = (
    await eventRows(ctx, "staffMessages", tenantId, eventId)
  )
    .filter((m) => m.recipientPersonId == null)
    .sort((a, b) => a._creationTime - b._creationTime);

  const verifications = packet.snapshot.checklistVerifications.filter(
    (v) => v.answer === "yes",
  );
  const resolvedChecks = new Set(
    packet.snapshot.issues
      .filter((i) => i.status === "resolved")
      .map((i) => i.key),
  );
  const revisions = packet.revisionRows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const latest = revisions.find((r) => !r.supersededBy) ?? revisions[0];

  const input: FinalLockInput = {
    event: {
      id: String(event._id),
      version: version(event),
      title: String(event.title ?? ""),
      eventNumber: str(event.eventNumber),
      stage: String(event.stage),
      serviceStyleId: str(event.serviceStyleId),
      serviceStyleName: str(event.serviceStyleName),
      expectedHeadcount: num(event.expectedHeadcount),
      venueId: str(event.venueId),
      venueName: str(event.venueName),
      venueAddress: str(event.venueAddress) ?? str(venueRow?.addressLine1),
      venueCapacity: num(event.venueCapacity),
      clientId: str(event.clientId),
      contactName: await plain(ctx, event.primaryContactName, "primaryContactName"),
      contactPhone: await plain(ctx, event.primaryContactPhone, "primaryContactPhone"),
      contactEmail: await plain(ctx, event.primaryContactEmail, "primaryContactEmail"),
      assignedToId: str(event.assignedToId),
      ownerName: str(event.ownerName),
      quotedPrice: num(event.quotedPrice),
      startsAt: num(event.startsAt),
      endsAt: num(event.endsAt),
      serviceStartsAt: num(event.serviceStartsAt),
      timing: {
        setup: num(event.timingSetupMinutes),
        load: num(event.timingLoadMinutes),
        outbound: num(event.timingOutboundTravelMinutes),
        cleanup: num(event.timingCleanupMinutes),
        returnTravel: num(event.timingReturnTravelMinutes),
        unload: num(event.timingUnloadMinutes),
      },
      salesLockedAt: num(event.salesLockedAt),
      operationalRequirements: str(event.operationalRequirements),
      text: Object.fromEntries(TEXT_FIELDS.map((f) => [f, str(event[f])])),
    },
    serviceStyle: style
      ? { id: String(style._id), version: version(style), name: String(style.name) }
      : null,
    client: clientRow
      ? {
          id: String(clientRow._id),
          version: version(clientRow),
          name:
            str(clientRow.companyName) ??
            [clientRow.givenName, clientRow.familyName].filter(Boolean).join(" "),
          status: String(clientRow.status ?? ""),
        }
      : null,
    venue: venueRow
      ? {
          id: String(venueRow._id),
          version: version(venueRow),
          name: String(venueRow.name),
          venueType: str(venueRow.venueType),
          loadInInstructions: str(venueRow.loadInInstructions),
        }
      : null,
    dishes,
    timeline,
    vehicles,
    equipment,
    packLists,
    packItems,
    kitItems,
    proposal,
    staffNeeds,
    assignments,
    channel: {
      messageCount: channelRows.length,
      attachmentCount: channelRows.reduce(
        (sum, m) => sum + (num(m.attachmentCount) ?? 0),
        0,
      ),
      lastMessageId: channelRows.length
        ? String(channelRows[channelRows.length - 1]!._id)
        : null,
    },
    packet: {
      latestRevisionId: latest ? String(latest._id) : null,
      latestRevisionStale: latest
        ? latest.snapshotFingerprint !== packet.currentFingerprint
        : false,
      signoffs: verifications
        .filter(
          (v) =>
            v.checkKey.startsWith("check.signature.") &&
            resolvedChecks.has(v.checkKey),
        )
        .map((v) => ({ key: v.checkKey, actor: v.actor, at: v.at })),
    },
    confirmations: Object.fromEntries(
      verifications
        .filter((v) => /^field\.[a-z-]+$/.test(v.checkKey))
        .map((v) => [v.checkKey, { actor: v.actor, at: v.at }]),
    ),
  };

  const resolutions = await eventRows(
    ctx,
    "eventPacketResolutions",
    tenantId,
    eventId,
  );
  const overrides: StoredOverride[] = resolutions
    .filter((r) => String(r.issueKey).startsWith("finallock."))
    .map((r) => JSON.parse(r.decisionJson))
    .filter((d) => d?.kind === "final_lock_override")
    .map((d) => ({
      questionKey: d.questionKey,
      basedOn: d.basedOn,
      value: d.value,
      reason: d.reason,
      actor: d.actor,
      at: d.at,
    }));
  const printed: PrintedAnswers | null = latest?.answersJson
    ? JSON.parse(latest.answersJson)
    : null;
  return { input, overrides, printed, packet };
}
