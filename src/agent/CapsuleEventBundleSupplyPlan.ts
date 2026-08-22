import type {
  BundleOrderLine,
  EventBundle,
} from "../lib/tppReports/eventBundle";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { toCapsuleUnit } from "./CapsuleMeasureUnit";
import {
  normalizeName,
  wholeQuantity,
  type PlannedStep,
} from "./CapsuleEventBundleShared";

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
      `${lines.length} purchasing line(s) were read but not entered: the run had no tenant directory to match vendors and ingredients against.`,
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
    const unit = toCapsuleUnit(unitWord);
    if (unit === undefined && unitWord) unmappedUnits.add(unitWord);
    counts.ingredients += 1;
    steps.push({
      capabilityId: "Ingredient.introduce",
      ref,
      label: `Introduce ingredient ${name}`,
      idempotencySuffix: `ingredient:${key}`,
      args: {
        name,
        unit: unit ?? "each",
        costPerUnit: 0,
        category: "TPP order list",
      },
    });
  }
  if (unmappedUnits.size > 0) {
    warnings.push(
      `Purchasing unit(s) with no Capsule equivalent were entered as "each": ${[...unmappedUnits].join(", ")}.`,
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

  let roundedLines = 0;
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
    if (directory.vendorOrderNumbers.includes(orderNumber)) {
      warnings.push(
        `Vendor order ${orderNumber} already exists; its lines were left as they are.`,
      );
      continue;
    }
    const orderRef = `order:${key}`;
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
    group.lines.forEach((line, index) => {
      const ingredientKey = normalizeName(cleanItemName(line.inventoryItem));
      const ingredientRef = ingredientRefs.get(ingredientKey);
      if (ingredientRef === undefined) return;
      const rawQuantity = line.purchaseQuantity ?? line.orderQuantity;
      const { quantity, rounded } = wholeQuantity(rawQuantity);
      if (rounded) roundedLines += 1;
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
          orderedQuantity: quantity,
          unit:
            toCapsuleUnit(line.purchaseUnit ?? line.orderUnit) ??
            toCapsuleUnit(line.orderUnit) ??
            "each",
          unitCost: 0,
        },
      });
    });
  }
  if (roundedLines > 0) {
    warnings.push(
      `${roundedLines} order line(s) under one unit were rounded up to 1, the smallest quantity a vendor order accepts.`,
    );
  }

  return { steps, warnings, seedIds, counts };
}
