/**
 * AUTHOR SEAM - opening stock from a count sheet (spec PR04-01, PR04-02;
 * PL-OPENING-STOCK).
 *
 * Import stages one OpeningStockRecord per sheet row and never touches
 * on-hand stock. A person then fixes each open record (review), sets a
 * record aside, or uses a ready food record as the opening stock (apply) -
 * that choice is the cutover basis. The issue list always comes from
 * src/lib/openingStock.ts, so a gap never becomes zero, "each" or a guessed
 * conversion. Every write goes through the generated OpeningStockRecord and
 * InventoryItem commands, so their role and tenant checks still apply.
 */
import { ConvexError, v } from "convex/values";
import {
  internalQuery,
  mutation,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthContext, requireTenant } from "./lib/authContext";
import type { UnitCode } from "./lib/culinaryModel/units";
import {
  clashingKeys,
  draftFromRow,
  evaluateOpeningStock,
  issuesJson,
  parseIssues,
  readOpeningStockRow,
  withClash,
  type OpenRecordForClash,
  type OpeningStockCatalog,
  type OpeningStockCountState,
  type OpeningStockDraft,
  type OpeningStockKind,
} from "../src/lib/openingStock";

type Reader = QueryCtx | MutationCtx;

async function loadCatalog(
  ctx: Reader,
  tenantId: string,
): Promise<OpeningStockCatalog> {
  const live = <T extends { deletedAt?: number | null }>(rows: T[]) =>
    rows.filter((row) => row.deletedAt == null);
  const ingredients = live(
    await ctx.db
      .query("ingredients")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  );
  const components = live(
    await ctx.db
      .query("components")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  );
  const locations = live(
    await ctx.db
      .query("storageLocations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  );
  const mappings = live(
    await ctx.db
      .query("itemUnitMappings")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  );
  return {
    ingredients: ingredients.map((row) => ({
      id: row._id,
      name: row.name,
      unit: row.unit as UnitCode,
    })),
    components: components.map((row) => ({ id: row._id, name: row.name })),
    locations: locations.map((row) => ({ id: row._id, name: row.name })),
    mappings: mappings.map((row) => ({
      ingredientId: row.ingredientId ?? null,
      componentId: row.componentId ?? null,
      kind: row.kind,
      unit: row.unit as UnitCode,
      equalsQuantity: row.equalsQuantity,
      equalsUnit: row.equalsUnit as UnitCode,
      fromBasis: row.fromBasis ?? null,
      toBasis: row.toBasis ?? null,
    })),
  };
}

function draftFromDoc(doc: Doc<"openingStockRecords">): OpeningStockDraft {
  return {
    sourceRow: doc.sourceRow,
    itemName: doc.itemName,
    kind: doc.kind as OpeningStockKind,
    ingredientId: doc.ingredientId ?? null,
    componentId: doc.componentId ?? null,
    locationId: doc.locationId ?? null,
    locationName: doc.locationName,
    quantity: doc.quantity ?? null,
    sourceUnit: doc.sourceUnit,
    unit: (doc.unit ?? null) as UnitCode | null,
    asOfAt: doc.asOfAt ?? null,
    countState: doc.countState as OpeningStockCountState,
    note: doc.note ?? "",
  };
}

async function openRecords(
  ctx: Reader,
  tenantId: string,
): Promise<Doc<"openingStockRecords">[]> {
  return (
    await ctx.db
      .query("openingStockRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter(
    (row) =>
      row.deletedAt == null &&
      (row.status === "needs_review" || row.status === "ready"),
  );
}

const forClash = (doc: Doc<"openingStockRecords">): OpenRecordForClash => ({
  key: doc._id,
  draft: draftFromDoc(doc),
  catalogQuantity: doc.catalogQuantity ?? null,
});

/** Import-side reading: the catalog and the records still open for this company. */
export const stockImportContext = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args) => {
    const catalog = await loadCatalog(ctx, args.tenantId);
    const open = (await openRecords(ctx, args.tenantId)).map(forClash);
    return { catalog, open };
  },
});

/**
 * Bring every open record's clash flag up to date after one record changed.
 * A record's own issues are kept; only the clash issue moves.
 */
async function refreshClashes(ctx: MutationCtx, tenantId: string) {
  const open = await openRecords(ctx, tenantId);
  const clashing = clashingKeys(open.map(forClash));
  for (const doc of open) {
    const own = parseIssues(doc.issues).filter(
      (issue) => issue !== "conflicting_snapshot",
    );
    const next = issuesJson(withClash(own, clashing.has(doc._id)));
    if (next !== doc.issues) {
      await ctx.runMutation(api.mutations.OpeningStockRecord_refreshIssues, {
        docId: doc._id,
        issues: next,
        version: doc.version,
      });
    }
  }
}

/** Called by the import once the rows are staged, so older records see new clashes. */
export const refreshOpeningStockClashes = mutation({
  args: {},
  handler: async (ctx) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    await refreshClashes(ctx, tenantId);
  },
});

async function readRecord(
  ctx: MutationCtx,
  tenantId: string,
  recordId: Id<"openingStockRecords">,
) {
  const doc = await ctx.db.get(recordId);
  if (!doc || doc.tenantId !== tenantId || doc.deletedAt != null) {
    throw new ConvexError("This stock row was not found.");
  }
  return doc;
}

const kindValidator = v.union(
  v.literal("ingredient"),
  v.literal("equipment"),
  v.literal("disposable"),
  v.literal("component"),
  v.literal("instruction"),
  v.literal("unsorted"),
);
const countStateValidator = v.union(
  v.literal("counted"),
  v.literal("unverified"),
  v.literal("estimated"),
  v.literal("unknown"),
);

/**
 * A person fixes one record: what it is, which item, where, how much, in
 * what unit, when it was counted and whether it was counted by hand. The
 * sheet's own unit text stays on the record as the source.
 */
export const reviewOpeningStock = mutation({
  args: {
    recordId: v.id("openingStockRecords"),
    kind: kindValidator,
    ingredientId: v.optional(v.union(v.id("ingredients"), v.null())),
    componentId: v.optional(v.union(v.id("components"), v.null())),
    locationId: v.optional(v.union(v.id("storageLocations"), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
    unit: v.optional(v.union(v.string(), v.null())),
    asOfAt: v.optional(v.union(v.number(), v.null())),
    countState: countStateValidator,
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const doc = await readRecord(ctx, tenantId, args.recordId);
    const catalog = await loadCatalog(ctx, tenantId);
    const location = args.locationId
      ? catalog.locations.find((row) => row.id === args.locationId)
      : undefined;
    if (args.locationId && !location) {
      throw new ConvexError("That storage place was not found.");
    }
    if (args.quantity != null && !(args.quantity >= 0)) {
      throw new ConvexError("The counted amount can't be negative.");
    }
    const unit =
      args.unit && Object.prototype.hasOwnProperty.call(UNIT_LABELS, args.unit)
        ? (args.unit as UnitCode)
        : null;
    const draft: OpeningStockDraft = {
      ...draftFromDoc(doc),
      kind: args.kind,
      ingredientId:
        args.kind === "ingredient" ? (args.ingredientId ?? null) : null,
      componentId:
        args.kind === "component" ? (args.componentId ?? null) : null,
      locationId: location?.id ?? null,
      locationName: location?.name ?? doc.locationName,
      quantity: args.quantity ?? null,
      unit,
      asOfAt: args.asOfAt ?? null,
      countState: args.countState,
      note: args.note ?? "",
    };
    const own = evaluateOpeningStock(draft, catalog);
    const others = (await openRecords(ctx, tenantId))
      .filter((row) => row._id !== doc._id)
      .map(forClash);
    const clashing = clashingKeys([
      ...others,
      { key: doc._id, draft, catalogQuantity: own.catalogQuantity },
    ]);
    await ctx.runMutation(api.mutations.OpeningStockRecord_review, {
      docId: doc._id,
      version: doc.version,
      kind: draft.kind,
      ingredientId: draft.ingredientId ?? undefined,
      componentId: draft.componentId ?? undefined,
      locationId: draft.locationId ?? undefined,
      locationName: draft.locationName,
      quantity: draft.quantity ?? undefined,
      sourceUnit: doc.sourceUnit,
      unit: draft.unit ?? undefined,
      catalogQuantity: own.catalogQuantity ?? undefined,
      asOfAt: draft.asOfAt ?? undefined,
      countState: draft.countState,
      issues: issuesJson(withClash(own.issues, clashing.has(doc._id))),
      note: draft.note || undefined,
    });
    await refreshClashes(ctx, tenantId);
  },
});

/** Keep a record out of the opening stock, with the reason. */
export const setAsideOpeningStock = mutation({
  args: { recordId: v.id("openingStockRecords"), reason: v.string() },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const doc = await readRecord(ctx, tenantId, args.recordId);
    await ctx.runMutation(api.mutations.OpeningStockRecord_setAside, {
      docId: doc._id,
      version: doc.version,
      reason: args.reason,
    });
    await refreshClashes(ctx, tenantId);
  },
});

/**
 * Use a ready food record as the opening stock for its item and place: open
 * the stock line in the catalog unit, or set an existing line to this count.
 */
export const applyOpeningStock = mutation({
  args: { recordId: v.id("openingStockRecords") },
  handler: async (
    ctx,
    args,
  ): Promise<{ inventoryItemId: string; quantityOnHand: number }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const doc = await readRecord(ctx, tenantId, args.recordId);
    if (doc.status !== "ready" || parseIssues(doc.issues).length > 0) {
      throw new ConvexError("Fix the open issues on this row first.");
    }
    if (
      doc.kind !== "ingredient" ||
      !doc.ingredientId ||
      !doc.locationId ||
      doc.catalogQuantity == null
    ) {
      throw new ConvexError(
        "Only a food row with an item, a storage place and an amount can open stock.",
      );
    }
    const ingredient = await ctx.db.get(doc.ingredientId as Id<"ingredients">);
    if (
      !ingredient ||
      ingredient.tenantId !== tenantId ||
      ingredient.deletedAt != null
    ) {
      throw new ConvexError("This row's item is no longer in the catalog.");
    }
    const line = (
      await ctx.db
        .query("inventoryItems")
        .withIndex("by_ingredientId", (q) =>
          q.eq("ingredientId", ingredient._id),
        )
        .collect()
    ).find(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.locationId === doc.locationId,
    );
    let inventoryItemId: string;
    if (!line) {
      const created = (await ctx.runMutation(
        api.mutations.InventoryItem_createViaOpen,
        {
          ingredientId: ingredient._id,
          locationId: doc.locationId,
          unit: ingredient.unit,
          quantityOnHand: doc.catalogQuantity,
          idempotencyKey: `opening-stock:${doc._id}`,
        },
      )) as { docId: string };
      inventoryItemId = created.docId;
    } else if (line.stockedAt == null) {
      await ctx.runMutation(api.mutations.InventoryItem_open, {
        docId: line._id,
        version: line.version,
        ingredientId: ingredient._id,
        locationId: doc.locationId,
        unit: ingredient.unit,
        quantityOnHand: doc.catalogQuantity,
      });
      inventoryItemId = line._id;
    } else {
      await ctx.runMutation(api.mutations.InventoryItem_recount, {
        docId: line._id,
        version: line.version,
        actualQuantity: doc.catalogQuantity,
      });
      inventoryItemId = line._id;
    }
    const fresh = await readRecord(ctx, tenantId, args.recordId);
    await ctx.runMutation(api.mutations.OpeningStockRecord_markApplied, {
      docId: fresh._id,
      version: fresh.version,
      inventoryItemId,
    });
    return { inventoryItemId, quantityOnHand: doc.catalogQuantity };
  },
});

// Units a person may pick on the review screen (the catalog vocabulary).
const UNIT_LABELS: Record<UnitCode, true> = {
  each: true,
  gram: true,
  kilogram: true,
  ounce: true,
  pound: true,
  milliliter: true,
  liter: true,
  teaspoon: true,
  tablespoon: true,
  cup: true,
  pint: true,
  quart: true,
  gallon: true,
  portion: true,
  serving: true,
  batch: true,
  melon: true,
  bottle: true,
  fluid_ounce: true,
  piece: true,
  slice: true,
  pizza: true,
  package: true,
  case: true,
  can: true,
  tub: true,
};

export type StockCommitCounts = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
  stoppedEarly: boolean;
};

/**
 * The import's stock branch (convex/importCommit.ts): read every row, sort
 * and check it, and stage one record per row. Rows already staged by an
 * earlier import are skipped by their link. On-hand stock is never written.
 */
export async function commitStockRows(
  ctx: ActionCtx,
  args: {
    importRunId: Id<"importRuns">;
    tenantId: string;
    sourceSystem: string;
    rawRows: unknown[];
    maxRecords?: number;
  },
): Promise<StockCommitCounts> {
  const rows = args.rawRows
    .map((raw) => ({
      raw: raw as Record<string, unknown>,
      row: readOpeningStockRow((raw ?? {}) as Record<string, unknown>),
    }))
    .filter(
      (
        entry,
      ): entry is {
        raw: Record<string, unknown>;
        row: NonNullable<typeof entry.row>;
      } => entry.row != null,
    );
  const parseErrors = args.rawRows.length - rows.length;
  if (rows.length === 0) {
    throw new ConvexError(
      "No stock rows could be read. Each row needs an item name.",
    );
  }
  const { catalog, open } = (await ctx.runQuery(
    internal.openingStock.stockImportContext,
    { tenantId: args.tenantId },
  )) as { catalog: OpeningStockCatalog; open: OpenRecordForClash[] };

  const staged = rows.map(({ raw, row }) => {
    const draft = draftFromRow(row, catalog);
    const sourceFile = String(
      raw.SourceFile ?? raw.sourceFile ?? raw.File ?? "",
    ).trim();
    return {
      draft,
      evaluation: evaluateOpeningStock(draft, catalog),
      sourceFile,
    };
  });
  const clashing = clashingKeys([
    ...open,
    ...staged.map((entry) => ({
      key: `new:${entry.draft.sourceRow}`,
      draft: entry.draft,
      catalogQuantity: entry.evaluation.catalogQuantity,
    })),
  ]);

  let committed = 0;
  let skipped = 0;
  const pending = 0;
  for (const [index, entry] of staged.entries()) {
    if (
      args.maxRecords !== undefined &&
      committed + skipped >= args.maxRecords &&
      staged.length - index > 0
    ) {
      return { committed, skipped, pending, parseErrors, stoppedEarly: true };
    }
    const { draft, evaluation } = entry;
    const existing = await ctx.runQuery(internal.importCommit.findLink, {
      tenantId: args.tenantId,
      sourceSystem: args.sourceSystem,
      recordType: "opening_stock",
      externalId: draft.sourceRow,
    });
    if (existing && existing.capsuleId) {
      if (existing.sourceImportRunId !== args.importRunId) skipped += 1;
      continue;
    }
    const issues = withClash(
      evaluation.issues,
      clashing.has(`new:${draft.sourceRow}`),
    );
    const created = (await ctx.runMutation(
      api.mutations.OpeningStockRecord_createViaStage,
      {
        importRunId: args.importRunId,
        sourceSystem: args.sourceSystem,
        sourceFile: entry.sourceFile || `import ${args.importRunId}`,
        sourceRow: draft.sourceRow,
        itemName: draft.itemName,
        kind: draft.kind,
        ingredientId: draft.ingredientId ?? undefined,
        componentId: draft.componentId ?? undefined,
        locationId: draft.locationId ?? undefined,
        locationName: draft.locationName,
        quantity: draft.quantity ?? undefined,
        sourceUnit: draft.sourceUnit,
        unit: draft.unit ?? undefined,
        catalogQuantity: evaluation.catalogQuantity ?? undefined,
        asOfAt: draft.asOfAt ?? undefined,
        countState: draft.countState,
        issues: issuesJson(issues),
        note: draft.note || undefined,
        idempotencyKey: `import:${args.importRunId}:opening_stock:${draft.sourceRow}`,
      },
    )) as { docId: string };
    await ctx.runMutation(internal.importCommit.upsertLink, {
      tenantId: args.tenantId,
      sourceSystem: args.sourceSystem,
      recordType: "opening_stock",
      externalId: draft.sourceRow,
      capsuleEntity: "stock",
      capsuleId: created.docId,
      sourceImportRunId: args.importRunId,
      rawSourceData: JSON.stringify(entry.draft),
      conflictStatus: "resolved",
    });
    committed += 1;
  }
  await ctx.runMutation(api.openingStock.refreshOpeningStockClashes, {});
  return { committed, skipped, pending, parseErrors, stoppedEarly: false };
}
