import type {
  BundleOrderLine,
  EventBundle,
} from "../lib/tppReports/eventBundle";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { toCapsuleMeasure, toCapsuleUnit } from "./CapsuleMeasureUnit";
import { normalizeName, type PlannedStep } from "./CapsuleEventBundleShared";

/**
 * The purchasing half of a TPP bundle: the order list becomes catalog
 * ingredients, vendors, and one vendor order per vendor with its lines.
 * Pure: decides calls, makes none.
 */

export interface SupplyPlanInput {
  bundle: EventBundle;
  invoice: string;
  context: CapsuleEventBundleContext;
}

export interface SupplyPlanResult {
  steps: PlannedStep[];
  warnings: string[];
  /** Ids that already exist, keyed by the ref the steps use. */
  seedIds: Record<string, string>;
  counts: {
    vendors: number;
    ingredients: number;
    orderLines: number;
    unassignedLines: number;
    inHouseLines: number;
  };
}

function cleanItemName(value: string): string {
  return value.replace(/\s*\*+\s*$/, "").trim();
}

/** TPP prints "Vendor Not Assigned" and the caterer's own name for stock. */
function vendorKind(
  vendor: string,
  organizationKeys: ReadonlySet<string>,
): "real" | "unassigned" | "inHouse" {
  const key = normalizeName(vendor);
  if (key.length === 0 || key.includes("notassigned")) return "unassigned";
  if (organizationKeys.has(key)) return "inHouse";
  return "real";
}

export function planSupplySteps(input: SupplyPlanInput): SupplyPlanResult {
  const { bundle, invoice, context } = input;
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
  const seedIds: Record<string, string> = {};
  const counts = {
    vendors: 0,
    ingredients: 0,
    orderLines: 0,
    unassignedLines: 0,
    inHouseLines: 0,
  };
  const lines = bundle.orderLines;
  if (lines.length === 0) return { steps, warnings, seedIds, counts };

  const directory = context.directory;
  if (!directory) {
    warnings.push(
      `${lines.length} purchasing line(s) were read but not entered: Capsule could not look up your vendors and ingredients to match them.`,
    );
    return { steps, warnings, seedIds, counts };
  }

  // --- Ingredients: one catalog entry per distinct item.
  const knownIngredients = new Map(
    directory.ingredients.map((row) => [normalizeName(row.name), row.id]),
  );
  const ingredientRefs = new Map<string, string>();
  const unmappedUnits = new Set<string>();
  for (const line of lines) {
    const name = cleanItemName(line.inventoryItem);
    const key = normalizeName(name);
    if (key.length === 0 || ingredientRefs.has(key)) continue;
    const ref = `ingredient:${key}`;
    ingredientRefs.set(key, ref);
    const existingId = knownIngredients.get(key);
    if (existingId !== undefined) {
      seedIds[ref] = existingId;
      continue;
    }
    const unitWord = line.orderUnit ?? line.purchaseUnit;
    const unit = toCapsuleUnit(unitWord) ?? toCapsuleUnit(line.purchaseUnit);
    if (unit === undefined) {
      unmappedUnits.add(unitWord ?? "(none)");
      ingredientRefs.delete(key);
      continue;
    }
    counts.ingredients += 1;
    steps.push({
      capabilityId: "Ingredient.introduce",
      ref,
      label: `Introduce ingredient ${name}`,
      idempotencySuffix: `ingredient:${key}`,
      args: {
        name,
        unit,
        costPerUnit: 0,
        category: "TPP order list",
      },
    });
  }
  if (unmappedUnits.size > 0) {
    warnings.push(
      `These ingredients were not added because their purchase units were not understood: ${[...unmappedUnits].join(", ")}.`,
    );
  }

  // --- Vendors and one order per vendor.
  const knownVendors = new Map(
    directory.vendors.map((row) => [normalizeName(row.name), row.id]),
  );
  const organizationKeys = new Set(
    directory.organizationNames.map(normalizeName),
  );
  const byVendor = new Map<
    string,
    { name: string; lines: BundleOrderLine[] }
  >();
  for (const line of lines) {
    const kind = vendorKind(line.vendor, organizationKeys);
    if (kind === "inHouse") {
      counts.inHouseLines += 1;
      continue;
    }
    if (kind === "unassigned") {
      counts.unassignedLines += 1;
      continue;
    }
    const measure = toCapsuleMeasure(
      line.purchaseQuantity ?? line.orderQuantity,
      line.purchaseQuantity != null
        ? (line.purchaseUnit ?? line.orderUnit)
        : (line.orderUnit ?? line.purchaseUnit),
    );
    if (!measure) {
      warnings.push(
        `Purchasing item "${line.inventoryItem}" was not ordered: its amount was not understood.`,
      );
      continue;
    }
    if (measure.quantity === 0) continue;
    const key = normalizeName(line.vendor);
    const group = byVendor.get(key) ?? { name: line.vendor.trim(), lines: [] };
    group.lines.push(line);
    byVendor.set(key, group);
  }
  if (counts.unassignedLines > 0) {
    warnings.push(
      `${counts.unassignedLines} purchasing line(s) have no vendor in TPP. Their ingredients are in the catalog; pick a vendor in Purchasing to order them.`,
    );
  }
  if (counts.inHouseLines > 0) {
    warnings.push(
      `${counts.inHouseLines} purchasing line(s) are made in house (TPP lists the caterer as the vendor). Their ingredients are in the catalog; no vendor order was opened.`,
    );
  }

  for (const [key, group] of byVendor) {
    const vendorRef = `vendor:${key}`;
    const existingVendor = knownVendors.get(key);
    if (existingVendor !== undefined) {
      seedIds[vendorRef] = existingVendor;
    } else {
      counts.vendors += 1;
      steps.push({
        capabilityId: "Vendor.onboard",
        ref: vendorRef,
        label: `Onboard vendor ${group.name}`,
        idempotencySuffix: `vendor:${key}`,
        args: { name: group.name, notes: "Imported from a TPP order list." },
      });
    }

    const orderNumber = `TPP-${invoice}-${key}`;
    const orderRef = `order:${key}`;
    // An order a prior run opened resumes: only lines it never got to are
    // added. Without line detail from the loader there is nothing to compare.
    let orderedIngredientIds: ReadonlySet<string> | undefined;
    if (directory.vendorOrderNumbers.includes(orderNumber)) {
      const known = directory.vendorOrders?.find(
        (row) => row.orderNumber === orderNumber,
      );
      if (!known) {
        warnings.push(
          `Vendor order ${orderNumber} already exists; its lines were left as they are.`,
        );
        continue;
      }
      if (known.status !== "draft") {
        warnings.push(
          `Vendor order ${orderNumber} is ${known.status}; its ${group.lines.length} line(s) from the reports were not entered because lines can only be added while the order is a draft.`,
        );
        continue;
      }
      seedIds[orderRef] = known.id;
      orderedIngredientIds = new Set(known.lineIngredientIds);
    } else {
      steps.push({
        capabilityId: "VendorOrder.open",
        ref: orderRef,
        label: `Open a vendor order with ${group.name}`,
        idempotencySuffix: `order:${invoice}:${key}`,
        resolveRefs: ["vendorId", "eventId"],
        args: {
          vendorId: vendorRef,
          eventId: "event",
          orderNumber,
          notes: `TPP order list for invoice ${invoice}.`,
        },
      });
    }
    group.lines.forEach((line, index) => {
      const ingredientKey = normalizeName(cleanItemName(line.inventoryItem));
      const ingredientRef = ingredientRefs.get(ingredientKey);
      if (ingredientRef === undefined) return;
      const ingredientId = seedIds[ingredientRef];
      if (
        orderedIngredientIds !== undefined &&
        ingredientId !== undefined &&
        orderedIngredientIds.has(ingredientId)
      ) {
        return;
      }
      const measure = toCapsuleMeasure(
        line.purchaseQuantity ?? line.orderQuantity,
        line.purchaseQuantity != null
          ? (line.purchaseUnit ?? line.orderUnit)
          : (line.orderUnit ?? line.purchaseUnit),
      );
      if (!measure || measure.quantity === 0) return;
      counts.orderLines += 1;
      steps.push({
        capabilityId: "VendorOrderLine.addLine",
        ref: `order-line:${key}:${index}`,
        label: `Order ${cleanItemName(line.inventoryItem)} from ${group.name}`,
        idempotencySuffix: `order-line:${invoice}:${key}:${ingredientKey}:${index}`,
        resolveRefs: ["vendorOrderId", "ingredientId"],
        args: {
          vendorOrderId: orderRef,
          ingredientId: ingredientRef,
          orderedQuantity: measure.quantity,
          unit: measure.unit,
          unitCost: 0,
        },
      });
    });
  }

  return { steps, warnings, seedIds, counts };
}
