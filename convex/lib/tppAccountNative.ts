/** Historical ingestion: no commands, notifications, payment requests or
 * operational reactions are replayed. Every write is linked atomically to
 * its original account + collection + identifier. */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { encryptField } from "./teamChatRead";
import { recipeUnitRatio } from "../../src/lib/recipeUnitConversion";
import type { InferredPackage } from "../../src/lib/tppPackagePatterns";

export type SourceRow = Record<string, any>;
export type NativeOutcome = {
  kind: "imported" | "preserved" | "needs_mapping" | "existing";
  detail?: string;
};
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown, fallback = 0): number =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : fallback;
const ref = (v: any): string => str(v && typeof v === "object" ? v.id : v);
const label = (v: any): string =>
  typeof v === "object" && v ? str(v.name ?? v.description) : str(v);
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
// Convex transports may reorder object keys. Source equality must compare
// content, preserving array order but ignoring object insertion order.
function sourceJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]]),
        )
      : entry,
  );
}
function currentSpan(spans: SourceRow[], now: number): SourceRow {
  return (
    [...spans]
      .filter((s) => !s.startDate || Date.parse(s.startDate) <= now)
      .sort(
        (a, b) =>
          Date.parse(b.startDate || "1900-01-01") -
          Date.parse(a.startDate || "1900-01-01"),
      )[0] ?? {}
  );
}
function portion(
  row: SourceRow | undefined,
  now: number,
): SourceRow | undefined {
  return currentSpan(row?.timespans ?? [], now).portionPrices?.[0]?.portionSize;
}
const units = new Set([
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
  "serving",
  "batch",
  "melon",
  "bottle",
  "fluid_ounce",
  "piece",
  "slice",
  "pizza",
  "package",
  "case",
  "can",
  "tub",
]);
function unit(v: unknown): Doc<"ingredients">["unit"] {
  const raw = label(v)
    .toLowerCase()
    .trim()
    .replace(/^x\s*-\s*do(?:nt| not) use\s*-\s*/, "")
    .replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    lb: "pound",
    lbs: "pound",
    oz: "ounce",
    g: "gram",
    kg: "kilogram",
    ml: "milliliter",
    l: "liter",
    tbsp: "tablespoon",
    tsp: "teaspoon",
    ea: "each",
    servings: "serving",
    portions: "portion",
    pieces: "piece",
    pounds: "pound",
    quarts: "quart",
    gallons: "gallon",
    cups: "cup",
  };
  Object.assign(aliases, {
    "oz_-_fld": "fluid_ounce",
    "oz_-_dry": "ounce",
    "cup_-_fld": "cup",
    "tblsp_-_dry": "tablespoon",
    "tblsp_-_fld": "tablespoon",
    "tsp_-_dry": "teaspoon",
    "tsp_-_fld": "teaspoon",
    bottles: "bottle",
    recipe: "batch",
    times_recipe: "batch",
    recipe_portion: "portion",
    unit: "each",
    item: "each",
    fluid_ounce: "fluid_ounce",
    "ounce_(dry)": "ounce",
    teaspoons: "teaspoon",
    bag: "package",
    box: "package",
    loave: "piece",
  });
  const result = aliases[raw] ?? raw;
  if (!units.has(result))
    throw new Error(`Unit needs mapping: ${label(v) || "missing"}`);
  return result as Doc<"ingredients">["unit"];
}
/** Interpret offset-free source dates in the import's fixed IANA time zone. */
export function tppDate(value: unknown, zone: string): number | undefined {
  if (value == null || value === "") return undefined;
  let text = str(value);
  const usDate =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      text,
    );
  if (usDate) {
    let hour = +(usDate[4] ?? 0);
    if (usDate[7])
      hour = (hour % 12) + (usDate[7].toUpperCase() === "PM" ? 12 : 0);
    text = `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}T${String(hour).padStart(2, "0")}:${usDate[5] ?? "00"}:${usDate[6] ?? "00"}`;
  }
  const dotNet = /^\/Date\((-?\d+)/.exec(text);
  if (dotNet) return Number(dotNet[1]);
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(text)) {
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : undefined;
  }
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?/.exec(
    text,
  );
  if (!m) return undefined;
  const target = Date.UTC(
    +m[1],
    +m[2] - 1,
    +m[3],
    +(m[4] ?? 0),
    +(m[5] ?? 0),
    +(m[6] ?? 0),
  );
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let result = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      format.formatToParts(result).map((x) => [x.type, x.value]),
    );
    const displayed = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    const correction = target - displayed;
    if (!correction) return result;
    result += correction;
  }
  throw new Error(`Source time does not exist in ${zone}: ${text}`);
}
export function tppSourceId(row: SourceRow): string {
  return ref(
    row.id ??
      row.mi_MenuItemSak ??
      row.pyhis_PaymentHistorySak ??
      row.cli_ClientLogItemSak ??
      row.upld_UploadSak,
  );
}
export function tppLinkKey(
  tenant: string,
  account: string,
  collection: string,
  id: string,
): string {
  return JSON.stringify(["tpp-account-v2", tenant, account, collection, id]);
}
async function seal<T extends Record<string, any>>(
  ctx: MutationCtx,
  entity: string,
  fields: string[],
  data: T,
): Promise<T> {
  const result = { ...data };
  for (const field of fields)
    if (result[field] != null)
      (result as Record<string, any>)[field] = await encryptField(
        ctx,
        entity,
        field,
        String(result[field]),
      );
  return result;
}
const ADDRESS = [
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
];
const address = (r: SourceRow) => ({
  addressLine1: str(r.address1),
  addressLine2: str(r.address2),
  city: str(r.city),
  region: str(r.state),
  postalCode: str(r.postalCode),
});

export async function importTppRecord(
  ctx: MutationCtx,
  job: Doc<"tppUploads">,
  collection: string,
  row: SourceRow,
  sourceId: string,
): Promise<NativeOutcome> {
  const { tenantId, sourceAccount } = job;
  const key = tppLinkKey(tenantId, sourceAccount, collection, sourceId);
  const existing = await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_linkKey", (q) => q.eq("linkKey", key))
    .first();
  if (existing) {
    if (
      sourceJson({
        ...JSON.parse(existing.rawSourceData ?? "{}"),
        storageId: undefined,
      }) !== sourceJson({ ...row, storageId: undefined })
    )
      return {
        kind: "needs_mapping",
        detail:
          "This TPP record changed since its previous import. The existing Capsule record was preserved.",
      };
    return { kind: "existing" };
  }
  const now = Date.now();
  const base = {
    tenantId,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const date = (v: unknown) => tppDate(v, job.timeZone);
  const lookup = async <
    T extends
      | "clients"
      | "venues"
      | "events"
      | "dishes"
      | "components"
      | "ingredients"
      | "menus"
      | "people"
      | "invoices"
      | "packLists"
      | "serviceStyles"
      | "occasions"
      | "referralSources"
      | "storageLocations"
      | "equipments",
  >(
    source: string,
    value: unknown,
    table: T,
  ): Promise<Id<T> | undefined> => {
    const id = ref(value);
    if (!id || id === "0") return undefined;
    const link = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_linkKey", (q) =>
        q.eq("linkKey", tppLinkKey(tenantId, sourceAccount, source, id)),
      )
      .first();
    if (!link?.capsuleId || link.deletedAt != null) return undefined;
    const nativeId = ctx.db.normalizeId(table, link.capsuleId);
    if (!nativeId) return undefined;
    const record = await ctx.db.get(nativeId);
    return record?.tenantId === tenantId && record.deletedAt == null
      ? nativeId
      : undefined;
  };
  const required = <T>(value: T | undefined, description: string): T => {
    if (value === undefined) throw new Error(`Missing ${description}`);
    return value;
  };
  const source = async (
    c: string,
    value: unknown,
  ): Promise<SourceRow | undefined> => {
    const id = ref(value);
    if (!id) return undefined;
    const link = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_linkKey", (q) =>
        q.eq("linkKey", tppLinkKey(tenantId, sourceAccount, c, id)),
      )
      .first();
    return link?.rawSourceData ? JSON.parse(link.rawSourceData) : undefined;
  };
  const sourceUnit = async (value: unknown) =>
    unit(
      typeof value === "number"
        ? await source("unitOfMeasurements", value)
        : value,
    );
  let capsuleId = "",
    capsuleEntity: Doc<"externalRecordLinks">["capsuleEntity"] =
      "source_record";
  let outcome: NativeOutcome = { kind: "imported" };
  const saveLink = async (
    c: string,
    id: string,
    target: string,
    entity: Doc<"externalRecordLinks">["capsuleEntity"],
    raw: SourceRow = {},
  ) => {
    await ctx.db.insert("externalRecordLinks", {
      ...base,
      sourceSystem: "tpp_legacy",
      sourceAccount,
      recordType: c,
      externalId: id,
      capsuleEntity: entity,
      capsuleId: target,
      linkKey: tppLinkKey(tenantId, sourceAccount, c, id),
      rawSourceData: JSON.stringify(raw),
      verified: false,
      conflictStatus: "resolved",
      decision: "approved",
      role: null,
      ordinal: 0,
    });
  };
  if (collection === "__packages_v1") {
    const pkg = row as InferredPackage;
    if (
      !pkg.name ||
      !Array.isArray(pkg.candidates) ||
      !["EP", "BP"].includes(pkg.type)
    )
      throw new Error("Invalid inferred package.");
    const contents = pkg.candidates.filter(
      (c) => c.classification !== "insufficient_evidence",
    );
    const descriptions = contents.map((c) => {
      const q = c.quantityRule;
      const amount = q
        ? `${q.quantity} ${q.scale === "fixed" ? "per event" : `per ${q.perUnits} ${q.scale}`}`
        : "quantity varies by event";
      return `${c.classification === "optional" ? "Optional" : "Included"}: ${c.name} — ${amount} (${c.support}/${c.events} recent events).`;
    });
    const dishId = await ctx.db.insert("dishes", {
      ...base,
      name: pkg.name,
      kind: "package",
      status: "active",
      portionSize: 1,
      portionUnit: "package",
      description: [
        "Contents inferred automatically from TPP event history. Historical event equipment is preserved as recorded.",
        ...descriptions,
      ].join("\n"),
    });
    for (const member of contents) {
      // Optional/variable contents remain legible on the package, without
      // inventing an amount or forcing someone through an approval queue.
      if (member.classification !== "proposed_core" || !member.quantityRule)
        continue;
      const equipmentId = await lookup(
        "inventoryItems",
        member.id,
        "equipments",
      );
      if (!equipmentId) continue;
      const equipment = (await ctx.db.get(equipmentId))!;
      const q = member.quantityRule;
      if (
        !Number.isInteger(q.quantity) ||
        q.quantity < 1 ||
        !Number.isInteger(q.perUnits) ||
        q.perUnits < 1 ||
        q.agreement < 0.9
      )
        throw new Error("Invalid inferred quantity rule.");
      await ctx.db.insert("packRules", {
        ...base,
        trigger: "dish",
        dishId,
        description: equipment.name,
        category: "other",
        unit: "each",
        baseQuantity: q.scale === "fixed" ? q.quantity : 0,
        scaleBy:
          q.scale === "fixed"
            ? "fixed"
            : q.scale === "packages"
              ? "servings"
              : "guests",
        perUnits: q.scale === "fixed" ? undefined : q.perUnits,
        quantityPerUnit: q.scale === "fixed" ? undefined : q.quantity,
        aggregateDishQuantity: true,
        sparePercent: 0,
        ownership: "owned",
        returnRequired: true,
        requiredCapability: false,
        ruleVersion: 1,
        status: "active",
        definedAt: now,
        note: `Inferred from TPP package ${pkg.id}, equipment ${member.id}. Present in ${member.support}/${member.events} recent events; quantity agreement ${Math.round(q.agreement * 100)}%. Source events: ${member.evidenceEventIds.join(", ")}.`,
      });
    }
    capsuleId = dishId;
    capsuleEntity = "dish";
  } else if (collection === "contacts") {
    capsuleEntity = "client";
    if (num(row.businessId) > 0 && str(row.businessName).trim()) {
      const businessId = ref(row.businessId);
      let companyId = await lookup("companies", businessId, "clients");
      const isFirstContact = !companyId;
      if (!companyId) {
        companyId = await ctx.db.insert("clients", {
          ...base,
          clientType: "company",
          companyName: str(row.businessName),
          taxExempt: !!row.taxExemptNumber,
          paymentTermsDays: 30,
          status: row.isInactive ? "archived" : "active",
        });
        await saveLink("companies", businessId, companyId, "client", {
          id: businessId,
          name: row.businessName,
        });
      } else if (!row.isInactive) {
        await ctx.db.patch(companyId, { status: "active" });
      }
      const contactId = await ctx.db.insert(
        "clientContacts",
        await seal(ctx, "ClientContact", ["email", "phone", "mobile"], {
          ...base,
          clientId: companyId,
          givenName: str(row.firstName),
          familyName: str(row.lastName),
          title: str(row.title),
          email: str(row.email),
          phone: str(row.workPhoneNumber || row.homePhoneNumber),
          mobile: str(row.cellPhoneNumber),
          isPrimary: isFirstContact,
          isBillingContact: false,
          status: row.isInactive ? ("removed" as const) : ("active" as const),
          notes: [row.generalNotes, row.dietaryNotes]
            .filter(Boolean)
            .join("\n"),
          addedAt: date(row.addedDate),
        }),
      );
      await saveLink("clientContacts", sourceId, contactId, "contact", row);
      await saveLink(collection, sourceId, companyId, "client", row);
      return { kind: "imported" };
    }
    capsuleId = await ctx.db.insert(
      "clients",
      await seal(ctx, "Client", [...ADDRESS, "email", "phone", "taxId"], {
        ...base,
        clientType:
          row.firstName || row.lastName
            ? ("person" as const)
            : ("company" as const),
        companyName: str(row.businessName),
        givenName: str(row.firstName),
        familyName: str(row.lastName),
        email: str(row.email),
        phone: str(
          row.cellPhoneNumber || row.workPhoneNumber || row.homePhoneNumber,
        ),
        ...address(row),
        website: str(row.websiteAddress),
        taxId: str(row.taxExemptNumber),
        taxExempt: !!row.taxExemptNumber,
        paymentTermsDays: num(
          job.metadata
            ? JSON.parse(job.metadata).account.defaultNetDueDays
            : 30,
          30,
        ),
        notes: [row.generalNotes, row.dietaryNotes].filter(Boolean).join("\n"),
        status: row.isInactive ? ("archived" as const) : ("active" as const),
        registeredAt: date(row.addedDate),
      }),
    );
  } else if (collection === "venues") {
    capsuleEntity = "venue";
    capsuleId = await ctx.db.insert(
      "venues",
      await seal(
        ctx,
        "Venue",
        [...ADDRESS, "contactName", "contactEmail", "contactPhone"],
        {
          ...base,
          name: str(row.name),
          venueType: "other" as const,
          ...address(row),
          contactName: str(row.contactName),
          contactEmail: str(row.email),
          contactPhone: str(row.contactPhoneNumber || row.phoneNumber),
          cateringNotes: str(row.notes),
          accessNotes: str(row.directions),
          capacity: 0,
          onPremise: !!row.isOnPremise,
          timeZone: job.timeZone,
          status: row.isInactive ? ("inactive" as const) : ("active" as const),
        },
      ),
    );
  } else if (collection === "storageLocations") {
    capsuleEntity = "location";
    capsuleId = await ctx.db.insert("storageLocations", {
      ...base,
      name: label(row),
      status: row.isInactive ? "inactive" : "active",
    });
  } else if (collection === "vendors") {
    capsuleEntity = "vendor";
    capsuleId = await ctx.db.insert(
      "vendors",
      await seal(ctx, "Vendor", [...ADDRESS, "email", "phone"], {
        ...base,
        name: label(row),
        email: str(row.email),
        phone: str(row.phoneNumber),
        addressLine1: str(row.address1),
        city: str(row.city),
        region: str(row.state),
        postalCode: str(row.postalCode),
        paymentTermsDays: 30,
        status: "active" as const,
        notes: str(row.notes),
      }),
    );
  } else if (["serviceStyles", "occasions", "referrals"].includes(collection)) {
    const data = {
      ...base,
      name: label(row),
      code: `tpp-${sourceAccount}-${sourceId}`,
      sortOrder: 0,
      status:
        row.isInactive || row.inactive
          ? ("inactive" as const)
          : ("active" as const),
    };
    capsuleId =
      collection === "serviceStyles"
        ? await ctx.db.insert("serviceStyles", data)
        : collection === "occasions"
          ? await ctx.db.insert("occasions", data)
          : await ctx.db.insert("referralSources", data);
    capsuleEntity =
      collection === "serviceStyles"
        ? "service_style"
        : collection === "occasions"
          ? "occasion"
          : "referral_source";
  } else if (collection === "staff") {
    capsuleEntity = "person";
    capsuleId = await ctx.db.insert(
      "people",
      await seal(ctx, "Person", [...ADDRESS, "email", "phone"], {
        ...base,
        givenName: str(row.firstName),
        familyName: str(row.lastName),
        email: str(row.email),
        phone: str(row.cellPhoneNumber || row.workPhoneNumber),
        ...address(row),
        role: "staff" as const,
        employmentType: "full_time" as const,
        status: row.isInActive ? ("inactive" as const) : ("active" as const),
        hireDate: date(row.hiredDate),
      }),
    );
  } else if (
    collection === "inventoryItems" ||
    collection === "miscellaneousItems"
  ) {
    const spans = Array.isArray(row.timeSpans) ? row.timeSpans : [];
    const span = currentSpan(spans, now);
    if (row.classification === "F" || row.classification === "B") {
      const u = await sourceUnit(span.shelfUnitOfMeasurement);
      const shelfAmount = num(span.shelfAmt, 1);
      if (shelfAmount <= 0)
        throw new Error(
          "Inventory purchase-to-shelf conversion is missing or zero.",
        );
      const cost = num(span.purchaseCost) / shelfAmount;
      const purchaseAmount = num(span.purchaseAmt, 1);
      if (row.instockUnitType === "P" && purchaseAmount <= 0)
        throw new Error("Inventory purchase quantity is missing or zero.");
      capsuleId = await ctx.db.insert("ingredients", {
        ...base,
        name: str(row.name),
        unit: u,
        costPerUnit: cost,
        category: label(row.category),
        status: row.isInActive ? "discontinued" : "active",
      });
      capsuleEntity = "ingredient";
      const locationId = await lookup(
        "storageLocations",
        row.storageLocation,
        "storageLocations",
      );
      if (!locationId && num(row.inStockAmt) !== 0)
        outcome = {
          kind: "needs_mapping",
          detail:
            "Ingredient imported; source stock quantity has no mapped storage location and was not assigned to an invented location.",
        };
      if (locationId && row.inStockAmt != null)
        await ctx.db.insert("inventoryItems", {
          ...base,
          ingredientId: capsuleId as Id<"ingredients">,
          locationId,
          quantityOnHand:
            num(row.inStockAmt) *
            (row.instockUnitType === "P" ? shelfAmount / purchaseAmount : 1),
          unit: u,
          parLevel: 0,
          reorderThreshold: 0,
          unitCost: cost,
          stockedAt: now,
        });
    } else if (row.classification === "E") {
      capsuleId = await ctx.db.insert("equipments", {
        ...base,
        name: str(row.name),
        assetTag: `TPP-${sourceAccount}-${sourceId}`,
        category: label(row.category),
        ownership: "owned",
        quantity: num(row.inStockAmt),
        purchaseValue: num(span.purchaseCost),
        condition: "good",
        status: row.isInActive ? "retired" : "active",
        description: str(row.description),
        customerPrice: num(span.salePrice),
        trackingMode: "bulk",
      });
      capsuleEntity = "equipment";
    } else {
      capsuleId = await ctx.db.insert("dishes", {
        ...base,
        name: str(row.name),
        description: str(row.description),
        category: label(row.category),
        portionSize: 1,
        portionUnit: "each",
        status: row.isInActive ? "retired" : "active",
        kind: row.classification === "M" ? "service" : "supply",
      });
      capsuleEntity = "dish";
    }
  } else if (collection === "menuItems") {
    capsuleEntity = "dish";
    const sourcePortion = portion(row, now);
    let portionUnit: Doc<"dishes">["portionUnit"] = "portion";
    if (sourcePortion?.unitOfMeasurement) {
      try {
        portionUnit = unit(sourcePortion.unitOfMeasurement);
      } catch {
        outcome = {
          kind: "needs_mapping",
          detail: `Dish imported; portion unit needs mapping: ${label(sourcePortion.unitOfMeasurement)}.`,
        };
      }
    }
    capsuleId = await ctx.db.insert("dishes", {
      ...base,
      name: str(row.name),
      description: str(row.description),
      category: label(row.menuItemCategory),
      portionSize: num(sourcePortion?.size, 1),
      portionUnit,
      recipeSourceYield:
        `${str(row.recipeYieldAmount)} ${label(row.recipeYieldUnitOfMeasurement)}`.trim(),
      status: row.discontinued ? "retired" : "active",
      kind: "food",
    });
    if (row.canUseAsSubRecipe && num(row.recipeYieldAmount) > 0) {
      let yieldUnit: Doc<"components">["yieldUnit"] | undefined;
      try {
        yieldUnit = unit(row.recipeYieldUnitOfMeasurement);
      } catch {
        outcome = {
          kind: "needs_mapping",
          detail: `Dish imported; subrecipe yield unit needs mapping: ${label(row.recipeYieldUnitOfMeasurement)}`,
        };
      }
      if (yieldUnit) {
        const componentId = await ctx.db.insert("components", {
          ...base,
          name: str(row.name),
          description: str(row.description),
          category: label(row.menuItemCategory),
          versionNumber: 1,
          yieldQuantity: num(row.recipeYieldAmount),
          yieldUnit,
          status: row.discontinued ? "retired" : "published",
        });
        await saveLink("subRecipes", sourceId, componentId, "component");
      }
    }
  } else if (collection === "menuItemDetails") {
    const dishId = required(
      await lookup("menuItems", sourceId, "dishes"),
      "dish",
    );
    await ctx.db.patch(dishId, {
      recipeInstructions: str(row.mi_PreporatoryNotes),
      serviceInstructions: str(row.mi_HeatingServing),
      recipeSourceText: JSON.stringify(row.Recipe ?? []),
      recipeSourceFingerprint: `tpp:${sourceAccount}:${sourceId}`,
    });
    const componentId = await lookup("subRecipes", sourceId, "components");
    if (componentId)
      await ctx.db.patch(componentId, {
        instructions: str(row.mi_PreporatoryNotes),
        recipeSourceText: JSON.stringify(row.Recipe ?? []),
      });
    const recipe = Array.isArray(row.Recipe) ? row.Recipe : [];
    const rootLevel = recipe.length
      ? Math.min(...recipe.map((r: SourceRow) => num(r.Level)))
      : 0;
    const catalog = await source("menuItems", sourceId);
    const yieldQuantity = num(catalog?.recipeYieldAmount);
    const yieldUnit = label(
      catalog?.recipeYieldUnitOfMeasurement,
    ).toLowerCase();
    const sourcePortion = portion(catalog, now);
    // TPP stores the recipe fraction consumed by one priced portion here
    // (e.g. 1/12 for one slice from a 12-serving cake).
    const portionFraction = num(sourcePortion?.portionsPerYield);
    const perServing =
      portionFraction > 0
        ? 1 / portionFraction
        : ["serving", "portion"].includes(yieldUnit) && yieldQuantity > 0
          ? yieldQuantity
          : undefined;
    const notes: string[] = [];
    for (const [sortOrder, line] of recipe.entries()) {
      if (num(line.Level) !== rootLevel) continue;
      const ingredientId = await lookup(
        "inventoryItems",
        line.recp_InventorySak,
        "ingredients",
      );
      const childComponentId = await lookup(
        "subRecipes",
        line.recp_SubMenuItemSak,
        "components",
      );
      if (!ingredientId && !childComponentId) {
        notes.push("Recipe ingredient or subrecipe could not be linked.");
        continue;
      }
      for (const amount of [
        { quantity: num(line.recphis_MajorAmt), unit: line.MajorUnit },
        { quantity: num(line.recphis_MinorAmt), unit: line.MinorUnit },
      ].filter((a) => a.quantity !== 0)) {
        let u: Doc<"ingredients">["unit"];
        try {
          u = unit(amount.unit);
        } catch {
          notes.push(`Recipe unit needs mapping: ${label(amount.unit)}`);
          continue;
        }
        const child = childComponentId
          ? await ctx.db.get(childComponentId)
          : null;
        const childRatio = child
          ? u === "batch"
            ? child.yieldQuantity
            : recipeUnitRatio(u, child.yieldUnit)
          : null;
        if (componentId && ingredientId)
          await ctx.db.insert("componentIngredients", {
            ...base,
            componentId,
            ingredientId,
            quantity: amount.quantity,
            unit: u,
            sortOrder,
          });
        else if (
          componentId &&
          childComponentId &&
          componentId !== childComponentId &&
          child &&
          childRatio != null
        )
          await ctx.db.insert("componentComponents", {
            ...base,
            componentId,
            childComponentId,
            quantity: amount.quantity * childRatio,
            unit: child.yieldUnit,
            sortOrder,
          });
        if (perServing && ingredientId)
          await ctx.db.insert("dishIngredients", {
            ...base,
            dishId,
            ingredientId,
            quantity: amount.quantity / perServing,
            unit: u,
            sortOrder,
          });
        else if (perServing && childComponentId) {
          if (child && childRatio != null && child.yieldQuantity > 0)
            await ctx.db.insert("dishComponents", {
              ...base,
              dishId,
              componentId: childComponentId,
              sortOrder,
              yieldQuantity: (amount.quantity * childRatio) / perServing,
              batchMultiplier:
                (amount.quantity * childRatio) /
                perServing /
                child.yieldQuantity,
            });
          else
            notes.push(
              "Subrecipe units need conversion before per-serving quantities can be applied.",
            );
        } else if (!componentId && !perServing)
          notes.push(
            "Recipe has no explicit per-serving yield; instructions and source quantities preserved.",
          );
      }
    }
    capsuleId = dishId;
    capsuleEntity = "dish";
    if (notes.length)
      outcome = {
        kind: "needs_mapping",
        detail: [...new Set(notes)].join(" "),
      };
  } else if (collection === "menuPackages") {
    capsuleEntity = "menu";
    capsuleId = await ctx.db.insert("menus", {
      ...base,
      name: str(row.name),
      description: str(row.description),
      category: label(row.category),
      isTemplate: true,
      basePrice: 0,
      pricePerPerson: num(row.perServingPrice),
      minGuests: 0,
      maxGuests: 0,
      status: row.inActive ? "archived" : "published",
    });
  } else if (collection === "menuPackageItems") {
    if (row.isHeader)
      outcome = {
        kind: "preserved",
        detail: "Menu heading retained in source.",
      };
    else {
      const menuId = required(
        await lookup("menuPackages", row.menuPackageId, "menus"),
        "menu package",
      );
      const dishId = required(
        await lookup("menuItems", row.menuItem, "dishes"),
        "package dish",
      );
      capsuleId = await ctx.db.insert("menuDishes", {
        ...base,
        menuId,
        dishId,
        sortOrder: num(row.orderSequence),
      });
      capsuleEntity = "menu_dish";
    }
  } else if (collection === "events") {
    const contact = row.primaryContactModel ?? {};
    const clientId = await lookup(
      "contacts",
      row.primaryContact ?? contact.id,
      "clients",
    );
    if (!clientId)
      outcome = {
        kind: "needs_mapping",
        detail: "Event imported; its source contact could not be linked.",
      };
    const startsAt = date(
      row.startTime && /^\d\d:/.test(row.startTime)
        ? `${str(row.date).slice(0, 10)}T${row.startTime}`
        : row.startTime || row.date,
    );
    const endsAt = date(
      row.endTime && /^\d\d:/.test(row.endTime)
        ? `${str(row.date).slice(0, 10)}T${row.endTime}`
        : row.endTime || row.date,
    );
    const status = row.statusModel ?? {};
    const stage =
      status.isCancelled ||
      /\b(lost|cancelled|canceled)\b/i.test(str(status.name))
        ? "cancelled"
        : status.isClosed || (status.isConfirmed && (endsAt ?? Infinity) < now)
          ? "completed"
          : status.isProposal
            ? "quote"
            : "planning";
    capsuleEntity = "event_record";
    capsuleId = await ctx.db.insert(
      "events",
      await seal(
        ctx,
        "Event",
        ["primaryContactName", "primaryContactEmail", "primaryContactPhone"],
        {
          ...base,
          title: str(row.title),
          eventType:
            label(await source("eventTypes", row.type)) || label(row.type),
          eventNumber: str(row.invoiceNumber || row.beoNumber),
          clientId,
          clientName: str(
            contact.displayName || contact.fullName || contact.businessName,
          ),
          venueId: await lookup("venues", row.venue, "venues"),
          venueName: str(row.venueModel?.name),
          serviceStyleId: await lookup(
            "serviceStyles",
            row.serviceStyle,
            "serviceStyles",
          ),
          serviceStyleName: label(row.serviceStyleModel),
          occasionId: await lookup("occasions", row.occasion, "occasions"),
          occasionName: str(row.occasionName),
          referralSourceId: await lookup(
            "referrals",
            row.referral,
            "referralSources",
          ),
          startsAt,
          endsAt,
          expectedHeadcount: num(row.guestCount),
          stage: stage as Doc<"events">["stage"],
          primaryContactName: str(contact.fullName),
          primaryContactEmail: str(contact.email),
          primaryContactPhone: str(
            contact.cellPhoneNumber || contact.workPhoneNumber,
          ),
          importSourceKey: key,
        },
      ),
    );
  } else if (collection === "legacyLeads" || collection === "opportunities") {
    const existingEvent =
      collection === "opportunities"
        ? await lookup("events", row.eventId, "events")
        : undefined;
    if (existingEvent) {
      await saveLink(collection, sourceId, existingEvent, "event_record", row);
      return { kind: "existing" };
    }
    const contact = row.primaryContact ?? row;
    const sourceStage = label(row.status);
    const historicallyClosed =
      /^(booked|cancelled|canceled|lost|won|closed)$/i.test(sourceStage);
    capsuleEntity = "lead";
    capsuleId = await ctx.db.insert(
      "leads",
      await seal(ctx, "Lead", ["email", "phone"], {
        ...base,
        leadType: contact.businessName
          ? ("company" as const)
          : ("person" as const),
        companyName: str(contact.businessName),
        givenName: str(contact.firstName),
        familyName: str(contact.lastName),
        email: str(contact.email),
        phone: str(contact.cellPhoneNumber || contact.workPhoneNumber),
        source: "TPP",
        estimatedValue: num(row.budget),
        stage: "new" as const,
        probability: /^(booked|won)$/i.test(sourceStage) ? 100 : 0,
        sourceStage,
        closedAt: historicallyClosed ? now : undefined,
        notes: [
          row.notes || row.generalNotes,
          historicallyClosed
            ? "Closed in TPP. Original close date was not supplied; the closure timestamp records this import."
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        eventDate: date(row.date),
        capturedAt: date(row.createdOn),
      }),
    );
  } else if (collection === "eventPayments") {
    const type = str(row.pyhis_PaymentType);
    if (["SD", "SP"].includes(type))
      outcome = {
        kind: "preserved",
        detail: "Scheduled payment; no money was recorded.",
      };
    else if (!["P", "D", "R", "RT"].includes(type))
      outcome = {
        kind: "needs_mapping",
        detail: `Payment type ${type} retained without treating it as invoice payment.`,
      };
    else {
      const eventId = required(
        await lookup("events", row.eventId, "events"),
        "payment event",
      );
      const invoiceId = required(
        await lookup("eventInvoices", row.eventId, "invoices"),
        "payment invoice",
      );
      const invoice = required(
        (await ctx.db.get(invoiceId)) ?? undefined,
        "invoice",
      );
      const method = str(row.pyhis_PaymentMethod).toLowerCase();
      const amount = num(row.pyhis_PaymentAmount),
        refund = type === "R" || type === "RT" || amount < 0;
      capsuleId = await ctx.db.insert("payments", {
        ...base,
        eventId,
        invoiceId,
        clientId: invoice.clientId,
        amount: Math.abs(amount),
        method: /ach|checking|savings/.test(method)
          ? "ach"
          : /check/.test(method)
            ? "check"
            : method === "cash"
              ? "cash"
              : /card|visa|discover|americanexpress/.test(method)
                ? "card"
                : "other",
        status: !row.pyhis_IsPaid
          ? "pending"
          : refund
            ? type === "RT"
              ? "returned"
              : "refunded"
            : "completed",
        reconciliationStatus: "unreconciled",
        externalSource: "tpp_legacy",
        externalPaymentId: `${sourceAccount}:${sourceId}`,
        providerAccount: sourceAccount,
        notes: str(row.pyhis_PaymentNote),
        recordedAt: date(row.pyhis_RecAddDate),
        occurredAt: date(row.pyhis_PaymentDate),
        effectiveAt: date(row.pyhis_PaymentDate),
        appliedAmount: row.pyhis_IsPaid ? amount : 0,
        feeAmount: num(row.pyhis_FeeCalculated),
        gratuityAmount: num(row.pyhis_GratuityCalculated),
        refundedAmount: refund && type !== "RT" ? Math.abs(amount) : undefined,
        returnedAmount: type === "RT" ? Math.abs(amount) : undefined,
      });
      capsuleEntity = "payment";
    }
  } else if (collection === "eventFinancials") {
    const eventId = required(
      await lookup("events", row.event, "events"),
      "financial event",
    );
    const event = required((await ctx.db.get(eventId)) ?? undefined, "event");
    const clientId = required(event.clientId ?? undefined, "invoice client");
    const total = num(row.total),
      paid = num(row.paymentTotal);
    if (total < 0 || paid < 0) {
      await saveLink(collection, sourceId, "", "source_record", row);
      return {
        kind: "needs_mapping",
        detail:
          "Historical credit or negative payment balance retained for credit-memo mapping; no negative sales invoice was created.",
      };
    }
    const taxAmount = money(
      num(row.tax1Total) + num(row.tax2Total) + num(row.tax3Total),
    );
    const discountAmount = Math.abs(num(row.discountTotal));
    const subtotal = money(total - taxAmount + discountAmount);
    const categories = [
      ["Food", "foodTotal", "food"],
      ["Beverages", "beverageTotal", "food"],
      ["Equipment / rentals", "rentalTotal", "rental"],
      ["Miscellaneous services", "miscellaneousTotal", "service"],
      ["Staff", "staffTotal", "service"],
      ["Rooms", "roomTotal", "rental"],
      ["Other inventory", "otherInventoryTotal", "service"],
      ["Service charge", "serviceChargeTotal", "service"],
      ["Gratuity", "gratuityTotal", "service"],
      ["Other fees", "otherFeeTotal", "service"],
    ];
    const lineItems = categories
      .filter(([, field]) => num(row[field]) !== 0)
      .map(([description, field, category]) => ({
        description: `TPP: ${description}`,
        category,
        quantity: 1,
        unitPrice: money(num(row[field])),
        subtotal: money(num(row[field])),
        taxAmount: 0,
        total: money(num(row[field])),
        appliedTaxRates: [],
      }));
    const adjustment = money(
      subtotal - lineItems.reduce((sum, line) => sum + line.subtotal, 0),
    );
    if (adjustment !== 0)
      lineItems.push({
        description: lineItems.length
          ? "TPP source subtotal reconciliation"
          : "TPP event charges",
        category: "service",
        quantity: 1,
        unitPrice: adjustment,
        subtotal: adjustment,
        taxAmount: 0,
        total: adjustment,
        appliedTaxRates: [],
      });
    if (lineItems.length > 1 && Math.abs(adjustment) > 0.02)
      outcome = {
        kind: "needs_mapping",
        detail:
          "Invoice totals preserved; category breakdown needs reconciliation. See the explicit source subtotal reconciliation line.",
      };
    const sourceEvent = await source("events", row.event);
    if (event.eventNumber) {
      const duplicate = await ctx.db
        .query("invoices")
        .withIndex("by_tenantId_and_invoiceNumber", (q) =>
          q.eq("tenantId", tenantId).eq("invoiceNumber", event.eventNumber),
        )
        .first();
      if (duplicate)
        throw new Error(
          "Invoice number already exists; source financials retained for matching.",
        );
    }
    capsuleEntity = "invoice";
    capsuleId = await ctx.db.insert("invoices", {
      ...base,
      eventId,
      clientId,
      invoiceNumber: event.eventNumber || undefined,
      subtotal,
      taxAmount,
      discountAmount,
      lineItems,
      total,
      amountPaid: paid,
      amountDue: money(total - paid),
      paymentTermsDays: num(sourceEvent?.netDueDays, 30),
      status:
        event.stage === "cancelled" && paid === 0
          ? "voided"
          : event.stage === "quote"
            ? "draft"
            : paid >= total
              ? "paid"
              : paid > 0
                ? "partial"
                : "sent",
      dueDate: date(row.netDueDate),
      notes:
        "Imported historical TPP invoice. Source financial breakdown retained.",
    });
    await saveLink("eventInvoices", ref(row.event), capsuleId, "invoice");
    await ctx.db.patch(eventId, { quotedPrice: total });
  } else if (collection === "eventMenus") {
    const eventId = required(
      await lookup("events", row.event, "events"),
      "menu event",
    );
    for (const item of row.items ?? []) {
      if (item.isHeader) continue;
      const dishId = await lookup("menuItems", item.menuItem, "dishes");
      if (!dishId) {
        outcome = {
          kind: "needs_mapping",
          detail:
            "Available menu dishes imported; some source dishes could not be linked.",
        };
        continue;
      }
      const catalog = await source("menuItems", item.menuItem);
      const defaultFraction = num(portion(catalog, now)?.portionsPerYield);
      const eventFraction = num(item.portionSize?.portionsPerYield);
      const quantity =
        num(item.kitchenQuantity) *
        (defaultFraction > 0 && eventFraction > 0
          ? eventFraction / defaultFraction
          : 1);
      await ctx.db.insert("eventDishes", {
        ...base,
        eventId,
        dishId,
        dishName: str(item.displayName),
        quantityServings: quantity,
        sortOrder: num(item.itemPosition),
        specialInstructions: [item.kitchenNote, item.beoServiceNotes]
          .filter(Boolean)
          .join("\n"),
        serviceStyle: label(item.beoServiceStyle),
      });
    }
    capsuleId = eventId;
    capsuleEntity = "event_record";
  } else if (collection === "eventInventoryItems") {
    if (row.isHeader) {
      outcome = {
        kind: "preserved",
        detail: "Inventory section heading retained in source.",
      };
    } else {
      const eventId = required(
        await lookup("events", row.event, "events"),
        "inventory event",
      );
      const event = required((await ctx.db.get(eventId)) ?? undefined, "event");
      const item = row.inventoryItem;
      const classification = str(item?.classification);
      if (classification === "E") {
        const equipmentId = required(
          await lookup("inventoryItems", item, "equipments"),
          "equipment catalog item",
        );
        const quantity = num(row.quantity);
        if (!Number.isInteger(quantity) || quantity < 0)
          throw new Error(
            "Equipment quantity needs mapping; fractional or negative assets were not reserved.",
          );
        capsuleId = await ctx.db.insert("equipmentReservations", {
          ...base,
          equipmentId,
          eventId,
          quantity,
          startsAt: event.startsAt ?? null,
          endsAt: event.endsAt ?? null,
          status: ["completed", "cancelled", "closed_out"].includes(event.stage)
            ? "cancelled"
            : "reserved",
          cancellationReason: ["completed", "cancelled", "closed_out"].includes(
            event.stage,
          )
            ? "Historical TPP reservation; no current hold or unverified return asserted."
            : undefined,
        });
        capsuleEntity = "equipment_reservation";
      } else if (["EP", "BP"].includes(classification)) {
        const dishId = required(
          await lookup("__packages_v1", item, "dishes"),
          "inferred package",
        );
        const quantity = num(row.quantity);
        if (!Number.isInteger(quantity) || quantity < 0)
          throw new Error(
            "Package quantity must be a nonnegative whole number.",
          );
        capsuleId = await ctx.db.insert("eventDishes", {
          ...base,
          eventId,
          dishId,
          dishName: label(item),
          quantityServings: quantity,
          followsEventHeadcount: false,
          packingAlreadyRecorded: true,
          sortOrder: num(row.itemPosition),
          specialInstructions: [row.kitchenNote, row.beoServiceNotes]
            .filter(Boolean)
            .join("\n"),
        });
        capsuleEntity = "event_dish";
      } else if (["M", "O", "F", "B"].includes(classification)) {
        let dishId = await lookup(
          classification === "M" ? "miscellaneousItems" : "inventoryItems",
          item,
          "dishes",
        );
        if (!dishId && ["F", "B"].includes(classification)) {
          const saleUnit = unit(row.unit);
          const saleId = `${ref(item)}:${saleUnit}`;
          dishId = await lookup("inventorySaleItems", saleId, "dishes");
          if (!dishId) {
            const ingredientId = required(
              await lookup("inventoryItems", item, "ingredients"),
              "sale ingredient",
            );
            dishId = await ctx.db.insert("dishes", {
              ...base,
              name: label(item),
              description: str(item.description),
              category: label(item.category),
              course: classification === "B" ? "beverage" : undefined,
              portionSize: 1,
              portionUnit: saleUnit,
              kind: "food",
              status: item.isInActive ? "retired" : "active",
            });
            await ctx.db.insert("dishIngredients", {
              ...base,
              dishId,
              ingredientId,
              quantity: 1,
              unit: saleUnit,
              sortOrder: 0,
            });
            await saveLink("inventorySaleItems", saleId, dishId, "dish", item);
          }
        }
        dishId = required(dishId, "inventory sale item");
        capsuleId = await ctx.db.insert("eventDishes", {
          ...base,
          eventId,
          dishId,
          dishName: label(item),
          quantityServings: num(row.quantity),
          sortOrder: num(row.itemPosition),
          specialInstructions: [row.kitchenNote, row.beoServiceNotes]
            .filter(Boolean)
            .join("\n"),
        });
        capsuleEntity = "event_dish";
      } else {
        outcome = {
          kind: "needs_mapping",
          detail: `Event inventory ${classification || "unlinked charge"} retained; package contents must be mapped before treating it as physical equipment or food.`,
        };
      }
    }
  } else if (collection === "eventTimes") {
    const eventId = required(
      await lookup("events", row.event, "events"),
      "timeline event",
    );
    capsuleId = await ctx.db.insert("eventTimelineActivities", {
      ...base,
      eventId,
      name: label(row.name),
      startsAt: date(row.time),
      notes: str(row.notes),
      siteNotes: str(row.kitchenNotes),
    });
    capsuleEntity = "event_timeline_activity";
  } else if (collection === "eventStaff") {
    const eventId = required(
      await lookup("events", row.eventId, "events"),
      "staffing event",
    );
    const personId = await lookup("staff", row.staff, "people");
    if (personId) {
      capsuleId = await ctx.db.insert("eventAssignments", {
        ...base,
        eventId,
        personId,
        role: label(row.jobTitle),
        startsAt: date(row.scheduleArrivalTime),
        endsAt: date(row.scheduleDepartTime),
        notes: str(row.notes),
        status: row.actualDepartTime
          ? "checked_out"
          : row.actualArrivalTime
            ? "checked_in"
            : row.isConfirmed
              ? "confirmed"
              : "assigned",
        checkedInAt: date(row.actualArrivalTime),
        checkedOutAt: date(row.actualDepartTime),
      });
    } else {
      const event = await ctx.db.get(eventId);
      for (let i = 0; i < Math.max(1, num(row.quantity, 1)); i++)
        capsuleId = await ctx.db.insert("eventStaffNeeds", {
          ...base,
          eventId,
          role: label(row.jobTitle),
          startsAt: date(row.scheduleArrivalTime),
          endsAt: date(row.scheduleDepartTime),
          notes: str(row.notes),
          status: ["completed", "cancelled", "closed_out"].includes(
            event?.stage ?? "",
          )
            ? "cancelled"
            : "open",
        });
    }
    capsuleEntity = personId ? "event_assignment" : "event_staff_need";
  } else if (collection === "eventPackListItems") {
    const eventId = required(
      await lookup("events", row.eventId, "events"),
      "pack-list event",
    );
    let packListId = await lookup("eventPackLists", row.eventId, "packLists");
    if (!packListId) {
      const event = await ctx.db.get(eventId);
      packListId = await ctx.db.insert("packLists", {
        ...base,
        eventId,
        name: "TPP pack list",
        status: ["completed", "cancelled", "closed_out"].includes(
          event?.stage ?? "",
        )
          ? "cancelled"
          : "draft",
      });
      await saveLink(
        "eventPackLists",
        ref(row.eventId),
        packListId,
        "pack_list",
      );
    }
    capsuleId = await ctx.db.insert("packListItems", {
      ...base,
      packListId,
      description: label(row.packedItem),
      requiredQuantity: num(row.packAmount),
      packedQuantity: row.isPacked ? num(row.packAmount) : 0,
      unit: unit(row.unitOfMeasurement),
      status: row.isPacked ? "packed" : "listed",
      note: [row.notes, `TPP unit: ${label(row.unitOfMeasurement)}`]
        .filter(Boolean)
        .join("\n"),
      associationSource: JSON.stringify({
        source: "tpp",
        association: row.associatedItem,
        serviceArea: row.serviceArea,
        packlistArea: row.packlistArea,
      }),
      excludedAt: row.doNotPack ? now : undefined,
      exclusionReason: row.doNotPack ? "Excluded in TPP" : undefined,
    });
    capsuleEntity = "pack_list_item";
  } else if (["tasks", "contactNotes", "eventNotes"].includes(collection)) {
    if (collection === "contactNotes") {
      const task = await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_linkKey", (q) =>
          q.eq(
            "linkKey",
            tppLinkKey(tenantId, sourceAccount, "tasks", sourceId),
          ),
        )
        .first();
      if (task?.capsuleId) {
        await saveLink(
          collection,
          sourceId,
          task.capsuleId,
          task.capsuleEntity,
          row,
        );
        return { kind: "existing" };
      }
    }
    const eventId = await lookup(
      "events",
      row.event ?? row.cli_PartySak,
      "events",
    );
    const clientId = await lookup("contacts", row.cli_ClientSak, "clients");
    const summary = str(
      row.note ||
        row.cli_Description ||
        row.cliext_EmailBody ||
        row.cli_Subject,
    );
    if (!summary.trim()) {
      await saveLink(collection, sourceId, "", "source_record", row);
      return {
        kind: "preserved",
        detail: "Empty source note retained without creating blank history.",
      };
    }
    if (!eventId && !clientId) {
      await saveLink(collection, sourceId, "", "source_record", row);
      return {
        kind: "needs_mapping",
        detail:
          "History preserved; its source event or contact could not be linked.",
      };
    }
    const taskEvent =
      collection === "tasks" && eventId ? await ctx.db.get(eventId) : null;
    if (
      collection === "tasks" &&
      eventId &&
      taskEvent &&
      !["completed", "cancelled", "closed_out"].includes(taskEvent.stage) &&
      (taskEvent.endsAt ?? taskEvent.startsAt ?? 0) >= now &&
      !(row.Complete || row.cli_Complete)
    ) {
      capsuleId = await ctx.db.insert("eventTasks", {
        ...base,
        eventId,
        title: str(row.cli_Subject) || "Imported TPP task",
        details: summary,
        priority: "medium",
        status: "open",
        dueAt: date(row.cli_LogItemDate),
      });
      capsuleEntity = "task";
    } else {
      const { deletedAt: _deletedAt, ...historyBase } = base;
      capsuleId = await ctx.db.insert("clientCommunications", {
        ...historyBase,
        eventId,
        clientId,
        summary,
        medium: row.cliext_EmailBody
          ? "email"
          : collection === "tasks"
            ? "task"
            : "note",
        authorName:
          [row.AddedByFirstName, row.AddedByLastName]
            .filter(Boolean)
            .join(" ") || "TPP (author not recorded)",
        occurredAt: date(row.cli_LogItemDate),
        recordedAt: now,
        importedFrom: "tpp_legacy",
        taskDone: !!(row.Complete || row.cli_Complete),
      });
      capsuleEntity = "client_communication";
    }
  } else if (collection.endsWith("Files") && row.storageId) {
    const eventId = await lookup("events", row.eventId, "events");
    if (eventId) {
      capsuleId = await ctx.db.insert("attachments", {
        ...base,
        parentType: "eventRecord",
        parentId: eventId,
        fileName: str(row.fileName) || `TPP ${sourceId}`,
        contentType: str(row.contentType) || "application/octet-stream",
        fileSize: num(row.byteLength),
        storageId: str(row.storageId),
        uploadedById: job.actorId,
        uploadedAt: now,
      });
      capsuleEntity = "attachment";
    } else
      outcome = {
        kind: "preserved",
        detail:
          "File retained in the import archive; no event association supplied.",
      };
  } else {
    outcome = {
      kind: "preserved",
      detail:
        "Source record retained; native mapping not implemented for this collection.",
    };
  }
  await saveLink(collection, sourceId, capsuleId, capsuleEntity, row);
  return outcome;
}
