/**
 * AUTHOR SEAM — Event Day briefing (issue #258).
 *
 * The generated per-entity read queries are capability-gated by domain
 * (kitchenAccess, logisticsAccess, workforceAccess, salesAccess…), so the
 * crew roles Event Day serves — drivers, kitchen staff, logistics staff —
 * cannot read the day-of slice of their own event and the night-map shows
 * them nothing. Per docs/architecture/domain-gating-restraint.md a crew
 * member going to an event needs the finalized day-of picture regardless
 * of department, so this read-only projection is granted to EVERY
 * authenticated member of the tenant with a real role.
 *
 * It is strictly narrower than the generated surface in what it ships:
 * no money (budgetAmount/quotedPrice stay behind eventRead), no HR data
 * (people project to id + name only; hourlyRate/email/phone never leave),
 * no ingredient costs (recipe lines hydrate only {name, allergens} so the
 * allergen derivation works), and no free-form notes fields that the
 * generated queries encrypt. Everything here is read-only.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";

/** Same envelope handling as the generated __decryptDoc, per field. */
async function decryptField(
  ctx: unknown,
  entity: string,
  property: string,
  raw: unknown,
): Promise<unknown> {
  if (typeof raw !== "string") return raw;
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope) ||
    !("kid" in envelope) ||
    !("ct" in envelope)
  ) {
    return raw;
  }
  if ((envelope as { v: unknown }).v !== 1) {
    throw new Error(
      `Unsupported encryption envelope for ${entity}.${property}`,
    );
  }
  return await decrypt(
    (envelope as { ct: string }).ct,
    (envelope as { kid: string }).kid,
    { ctx, entity, property },
  );
}

/** Any authenticated member of the tenant with a real role may read. */
async function briefingAuth(ctx: unknown) {
  const auth = await getAuthContext(ctx as never);
  if (!auth || auth.role === "anonymous" || !auth.tenantId) return null;
  return auth;
}

const live = (row: { deletedAt?: unknown }) => row.deletedAt == null;

/**
 * Hydrate a referenced doc ONLY when it belongs to this tenant and is not
 * soft-deleted. A foreign-key can hold another tenant's id (commands accept
 * arbitrary valid ids), and this seam must never project foreign data.
 */
async function tenantDoc(
  ctx: { db: any },
  tenantId: string,
  id: unknown,
): Promise<any | null> {
  if (id == null) return null;
  const doc = await ctx.db.get(id as any);
  if (!doc || doc.tenantId !== tenantId || doc.deletedAt != null) return null;
  return doc;
}

/** Tenant-checked but soft-deletion allowed — discontinued ingredients
 * still referenced by a live recipe line must keep their allergens. */
async function tenantDocAllowDeleted(
  ctx: { db: any },
  tenantId: string,
  id: unknown,
): Promise<any | null> {
  if (id == null) return null;
  const doc = await ctx.db.get(id as any);
  if (!doc || doc.tenantId !== tenantId) return null;
  return doc;
}

async function byEvent(
  ctx: { db: any },
  table: string,
  tenantId: string,
  eventId: string,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
  return rows.filter(
    (row: any) => row.tenantId === tenantId && live(row),
  ) as any[];
}

/** Minimal ingredient hydration — allergens and name, never cost. */
async function hydrateLine(ctx: { db: any }, tenantId: string, line: any) {
  const ingredient = await tenantDocAllowDeleted(
    ctx,
    tenantId,
    line.ingredientId,
  );
  return {
    _id: line._id,
    deletedAt: line.deletedAt ?? null,
    dishId: line.dishId ?? null,
    componentId: line.componentId ?? null,
    ingredientId: line.ingredientId ?? null,
    ingredient: ingredient
      ? { name: ingredient.name, allergens: ingredient.allergens ?? [] }
      : null,
  };
}

export const listEvents = query({
  args: {},
  handler: async (ctx) => {
    const auth = await briefingAuth(ctx);
    if (!auth) return null;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", auth.tenantId))
      .collect();
    return rows.filter(live).map((row: any) => ({
      _id: row._id,
      title: row.title ?? null,
      startsAt: row.startsAt ?? null,
      stage: row.stage ?? null,
      venueName: row.venueName ?? null,
      expectedHeadcount: row.expectedHeadcount ?? null,
    }));
  },
});

export const getBriefing = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const auth = await briefingAuth(ctx);
    if (!auth) return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (id == null) return null;
    const event: any = await ctx.db.get(id);
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return null;
    const tenantId = auth.tenantId;

    const [
      assignments,
      staffNeeds,
      activities,
      eventDishes,
      layoutSections,
      equipmentReservations,
      deliveries,
      packLists,
    ] = await Promise.all([
      byEvent(ctx, "eventAssignments", tenantId, id),
      byEvent(ctx, "eventStaffNeeds", tenantId, id),
      byEvent(ctx, "eventTimelineActivities", tenantId, id),
      byEvent(ctx, "eventDishes", tenantId, id),
      byEvent(ctx, "eventLayoutSections", tenantId, id),
      byEvent(ctx, "equipmentReservations", tenantId, id),
      byEvent(ctx, "deliveries", tenantId, id),
      byEvent(ctx, "packLists", tenantId, id),
    ]);

    const packListItems = (
      await Promise.all(
        packLists.map((list: any) =>
          ctx.db
            .query("packListItems")
            .withIndex("by_packListId", (q: any) =>
              q.eq("packListId", list._id),
            )
            .collect(),
        ),
      )
    )
      .flat()
      .filter((row: any) => row.tenantId === tenantId && live(row));

    const clientContacts =
      event.clientId != null
        ? (
            await ctx.db
              .query("clientContacts")
              .withIndex("by_clientId", (q: any) =>
                q.eq("clientId", event.clientId),
              )
              .collect()
          ).filter((row: any) => row.tenantId === tenantId && live(row))
        : [];

    const venueRaw: any = await tenantDoc(ctx, tenantId, event.venueId);

    // Dish catalog + recipe graph for the menu's dishes only.
    const dishIds = [
      ...new Set(eventDishes.map((row: any) => String(row.dishId))),
    ];
    const dishes = (
      await Promise.all(
        eventDishes
          .filter(
            (row: any, index: number) =>
              eventDishes.findIndex(
                (other: any) => String(other.dishId) === String(row.dishId),
              ) === index,
          )
          .map((row: any) => tenantDoc(ctx, tenantId, row.dishId)),
      )
    )
      .filter((dish: any) => dish != null)
      .map((dish: any) => ({
        _id: dish._id,
        deletedAt: dish.deletedAt ?? null,
        name: dish.name ?? null,
        allergenSummary: dish.allergenSummary ?? [],
      }));

    const dishLineRows = (
      await Promise.all(
        dishIds.map((dishId) =>
          ctx.db
            .query("dishIngredients")
            .withIndex("by_dishId", (q: any) => q.eq("dishId", dishId))
            .collect(),
        ),
      )
    )
      .flat()
      .filter((row: any) => row.tenantId === tenantId && live(row));
    const dishComponentRows = (
      await Promise.all(
        dishIds.map((dishId) =>
          ctx.db
            .query("dishComponents")
            .withIndex("by_dishId", (q: any) => q.eq("dishId", dishId))
            .collect(),
        ),
      )
    )
      .flat()
      .filter((row: any) => row.tenantId === tenantId && live(row));
    const componentIds = [
      ...new Set(dishComponentRows.map((row: any) => String(row.componentId))),
    ];
    const componentLineRows = (
      await Promise.all(
        componentIds.map((componentId) =>
          ctx.db
            .query("componentIngredients")
            .withIndex("by_componentId", (q: any) =>
              q.eq("componentId", componentId),
            )
            .collect(),
        ),
      )
    )
      .flat()
      .filter((row: any) => row.tenantId === tenantId && live(row));

    const dishIngredients = await Promise.all(
      dishLineRows.map((line: any) => hydrateLine(ctx, tenantId, line)),
    );
    const componentIngredients = await Promise.all(
      componentLineRows.map((line: any) => hydrateLine(ctx, tenantId, line)),
    );

    // Name lookups: people (id + name ONLY), vehicles, equipment.
    const personIds = new Set<string>();
    for (const row of assignments as any[])
      if (row.personId != null) personIds.add(String(row.personId));
    for (const row of deliveries as any[])
      if (row.driverId != null) personIds.add(String(row.driverId));
    for (const row of activities as any[])
      for (const pid of row.assigneePersonIds ?? [])
        if (pid != null) personIds.add(String(pid));
    const people = (
      await Promise.all(
        [...personIds].map((pid) => tenantDoc(ctx, tenantId, pid)),
      )
    )
      .filter((person: any) => person != null)
      .map((person: any) => ({
        _id: person._id,
        givenName: person.givenName ?? null,
        familyName: person.familyName ?? null,
      }));

    const vehicleIds = [
      ...new Set(
        (deliveries as any[])
          .filter((row) => row.vehicleId != null)
          .map((row) => String(row.vehicleId)),
      ),
    ];
    const vehicles = (
      await Promise.all(vehicleIds.map((vid) => tenantDoc(ctx, tenantId, vid)))
    )
      .filter((vehicle: any) => vehicle != null)
      .map((vehicle: any) => ({
        _id: vehicle._id,
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
      }));

    const equipmentIds = [
      ...new Set(
        (equipmentReservations as any[])
          .filter((row) => row.equipmentId != null)
          .map((row) => String(row.equipmentId)),
      ),
    ];
    const equipments = (
      await Promise.all(
        equipmentIds.map((eid) => tenantDoc(ctx, tenantId, eid)),
      )
    )
      .filter((item: any) => item != null)
      .map((item: any) => ({ _id: item._id, name: item.name ?? null }));

    return {
      event: {
        _id: event._id,
        deletedAt: event.deletedAt ?? null,
        title: event.title ?? null,
        eventType: event.eventType ?? null,
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
        stage: event.stage ?? null,
        expectedHeadcount: event.expectedHeadcount ?? null,
        venueId: event.venueId ?? null,
        venueName: event.venueName ?? null,
        venueAddress: event.venueAddress ?? null,
        clientId: event.clientId ?? null,
        primaryContactName: await decryptField(
          ctx,
          "Event",
          "primaryContactName",
          event.primaryContactName,
        ),
        primaryContactEmail: await decryptField(
          ctx,
          "Event",
          "primaryContactEmail",
          event.primaryContactEmail,
        ),
        primaryContactPhone: await decryptField(
          ctx,
          "Event",
          "primaryContactPhone",
          event.primaryContactPhone,
        ),
      },
      venue:
        venueRaw == null
          ? null
          : {
              _id: venueRaw._id,
              name: venueRaw.name ?? null,
              capacity: venueRaw.capacity ?? null,
              addressLine1: await decryptField(
                ctx,
                "Venue",
                "addressLine1",
                venueRaw.addressLine1,
              ),
              addressLine2: await decryptField(
                ctx,
                "Venue",
                "addressLine2",
                venueRaw.addressLine2,
              ),
              city: await decryptField(ctx, "Venue", "city", venueRaw.city),
              region: await decryptField(
                ctx,
                "Venue",
                "region",
                venueRaw.region,
              ),
              postalCode: await decryptField(
                ctx,
                "Venue",
                "postalCode",
                venueRaw.postalCode,
              ),
              parkingAvailable: venueRaw.parkingAvailable ?? null,
              kitchenAccess: venueRaw.kitchenAccess ?? null,
              powerAvailable: venueRaw.powerAvailable ?? null,
              waterAccess: venueRaw.waterAccess ?? null,
              hasFreightElevator: venueRaw.hasFreightElevator ?? null,
              hasStairs: venueRaw.hasStairs ?? null,
              storageAvailable: venueRaw.storageAvailable ?? null,
              loadInInstructions: venueRaw.loadInInstructions ?? null,
              accessNotes: venueRaw.accessNotes ?? null,
              cateringNotes: venueRaw.cateringNotes ?? null,
              restrictions: venueRaw.restrictions ?? null,
              contactName: await decryptField(
                ctx,
                "Venue",
                "contactName",
                venueRaw.contactName,
              ),
              contactPhone: await decryptField(
                ctx,
                "Venue",
                "contactPhone",
                venueRaw.contactPhone,
              ),
            },
      assignments: (assignments as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        status: row.status ?? null,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
        personId: row.personId ?? null,
        role: row.role ?? null,
      })),
      staffNeeds: (staffNeeds as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        status: row.status ?? null,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
        role: row.role ?? null,
        description: row.description ?? null,
      })),
      activities: (activities as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        scheduledAt: row.scheduledAt ?? null,
        startsAt: row.startsAt ?? null,
        sortOrder: row.sortOrder ?? null,
        name: row.name ?? null,
        siteNotes: row.siteNotes ?? null,
        assigneeTeams: row.assigneeTeams ?? [],
        assigneePersonIds: row.assigneePersonIds ?? [],
        responsibleParty: row.responsibleParty ?? null,
      })),
      eventDishes: (eventDishes as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        removedAt: row.removedAt ?? null,
        course: row.course ?? null,
        dishId: row.dishId ?? null,
        specialInstructions: row.specialInstructions ?? null,
        quantityServings: row.quantityServings ?? null,
      })),
      dishes,
      dishIngredients,
      dishComponents: dishComponentRows.map((row: any) => ({
        _id: row._id,
        deletedAt: row.deletedAt ?? null,
        dishId: row.dishId,
        componentId: row.componentId,
      })),
      componentIngredients,
      deliveries: (deliveries as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        status: row.status ?? null,
        vehicleId: row.vehicleId ?? null,
        driverId: row.driverId ?? null,
        windowStartsAt: row.windowStartsAt ?? null,
        windowEndsAt: row.windowEndsAt ?? null,
        destination: row.destination ?? null,
      })),
      vehicles,
      layoutSections: (layoutSections as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        addedAt: row.addedAt ?? null,
        sortOrder: row.sortOrder ?? null,
        type: row.type ?? null,
        instructions: row.instructions ?? null,
      })),
      equipmentReservations: (equipmentReservations as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        status: row.status ?? null,
        quantity: row.quantity ?? null,
        equipmentId: row.equipmentId ?? null,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
      })),
      equipments,
      clientContacts: await Promise.all(
        clientContacts.map(async (row: any) => ({
          _id: row._id,
          deletedAt: row.deletedAt ?? null,
          clientId: row.clientId,
          status: row.status ?? null,
          isPrimary: row.isPrimary ?? null,
          givenName: row.givenName ?? null,
          familyName: row.familyName ?? null,
          title: row.title ?? null,
          phone: await decryptField(ctx, "ClientContact", "phone", row.phone),
          mobile: await decryptField(
            ctx,
            "ClientContact",
            "mobile",
            row.mobile,
          ),
        })),
      ),
      packLists: (packLists as any[]).map((row) => ({
        _id: row._id,
        eventId: row.eventId,
        deletedAt: row.deletedAt ?? null,
        status: row.status ?? null,
        name: row.name ?? null,
      })),
      packListItems: (packListItems as any[]).map((row: any) => ({
        _id: row._id,
        deletedAt: row.deletedAt ?? null,
        packListId: row.packListId,
        status: row.status ?? null,
        description: row.description ?? null,
        requiredQuantity: row.requiredQuantity ?? null,
        unit: row.unit ?? null,
      })),
      people,
    };
  },
});
