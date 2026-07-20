/**
 * Emit Manifest DX proof-kit artifacts for Capsule (catalog, registry, guards).
 * Derived from compiled IR — not hand-maintained inventories.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { IR } from "@angriff36/manifest/ir";
import {
  emitCapabilityCatalog,
  emitIntegrationGuardConfig,
  emitProofRegistry,
  formatCapabilityCatalogMarkdown,
  reactionProofId,
} from "@angriff36/manifest/proof-kit";

const root = process.cwd();
const outDir = path.join(root, "generated", "proof");
const irPath = path.join(root, "generated", "ir", "merged.ir.json");
const require = createRequire(import.meta.url);

const SUPPLY_ENTITIES = ["IngredientDemand", "PurchaseNeed"] as const;
const PRODUCTION_ENTITIES = ["PrepTask", "QualityCheck"] as const;
const WORKFORCE_ENTITIES = [
  "EventAssignment",
  "Shift",
  "AvailabilityWindow",
  "TimeRecord",
  "Qualification",
] as const;
const LOGISTICS_ENTITIES = ["PackList", "PackListItem", "Delivery"] as const;
const COMMERCIAL_ENTITIES = ["Invoice", "Payment"] as const;
const CLOSEOUT_ENTITIES = ["EventCloseout"] as const;
const CULINARY_ENTITIES = [
  "Ingredient",
  "Recipe",
  "RecipeIngredient",
  "Dish",
  "Menu",
] as const;
const CATALOG_ENTITIES = [
  ...SUPPLY_ENTITIES,
  ...PRODUCTION_ENTITIES,
  ...WORKFORCE_ENTITIES,
  ...LOGISTICS_ENTITIES,
  ...COMMERCIAL_ENTITIES,
  ...CLOSEOUT_ENTITIES,
  ...CULINARY_ENTITIES,
] as const;

const DEMAND_RUNTIME_TEST =
  "tests/proofs/ingredient-demand-confirm.runtime.test.ts";
const QUALITY_RUNTIME_TEST =
  "tests/proofs/quality-check-fail-block.runtime.test.ts";
const SHIFT_RUNTIME_TEST = "tests/proofs/shift-lifecycle.runtime.test.ts";
const LOGISTICS_RUNTIME_TEST =
  "tests/proofs/pack-list-delivery-lifecycle.runtime.test.ts";
const COMMERCIAL_RUNTIME_TEST =
  "tests/proofs/invoice-payment-lifecycle.runtime.test.ts";
const CLOSEOUT_RUNTIME_TEST =
  "tests/proofs/event-closeout-lifecycle.runtime.test.ts";
const RECIPE_IMPORT_RUNTIME_TEST =
  "tests/proofs/recipe-import-finalize.runtime.test.ts";
const STRUCTURAL_TEST = "tests/event-reaction-projection.test.ts";
const SHIFT_RUNTIME_PROOF_IDS = [
  "Shift.schedule",
  "Shift.start",
  "Shift.complete",
] as const;
const LOGISTICS_RUNTIME_PROOF_IDS = [
  "PackList.open",
  "PackList.startPacking",
  "PackList.markPacked",
  "Delivery.schedule",
  "Delivery.startTransit",
  "Delivery.confirmDelivery",
] as const;
const COMMERCIAL_RUNTIME_PROOF_IDS = [
  "Invoice.issue",
  "Invoice.send",
  "Payment.record",
  "Payment.settle",
] as const;
const CLOSEOUT_RUNTIME_PROOF_IDS = [
  "EventCloseout.capture",
  "EventCloseout.finalize",
] as const;
const RECIPE_IMPORT_PROOF_IDS = [
  "Recipe.draft",
  "Ingredient.introduce",
  "RecipeIngredient.add",
] as const;

function compileIr(): void {
  mkdirSync(path.dirname(irPath), { recursive: true });
  const result = spawnSync(
    "bunx",
    ["manifest", "compile", "-g", "src/**/*.manifest", "--merge", "-o", irPath],
    { cwd: root, encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("manifest compile (merge) failed");
  }
}

function loadIr(): IR {
  if (!existsSync(irPath)) compileIr();
  return JSON.parse(readFileSync(irPath, "utf8")) as IR;
}

function manifestVersion(ir: IR): string {
  try {
    const pkg = require("@angriff36/manifest/package.json") as {
      version: string;
    };
    return pkg.version;
  } catch {
    return ir.provenance?.compilerVersion ?? "0.0.0";
  }
}

function presetVersions(): { id: string; version: string } {
  const pkg = require(path.join(root, "package.json")) as {
    manifestPreset?: { id: string; version: string };
  };
  return {
    id: pkg.manifestPreset?.id ?? "convex-application",
    version: pkg.manifestPreset?.version ?? "0.0.0",
  };
}

function requireReaction(
  ir: IR,
  event: string,
  targetEntity: string,
  targetCommand: string,
) {
  const reaction = (ir.reactions ?? []).find(
    (r) =>
      r.event === event &&
      r.targetEntity === targetEntity &&
      r.targetCommand === targetCommand,
  );
  if (!reaction) {
    throw new Error(
      `Expected ${event} → ${targetEntity}.${targetCommand} reaction in IR`,
    );
  }
  return reaction;
}

export function emitCapsuleProofKit(options?: { skipCompile?: boolean }): void {
  if (!options?.skipCompile) compileIr();
  const ir = loadIr();
  const versions = {
    manifestVersion: manifestVersion(ir),
    projection: "convex",
    preset: presetVersions(),
  };

  const demandReaction = requireReaction(
    ir,
    "IngredientDemandConfirmed",
    "PurchaseNeed",
    "create",
  );
  const qualityReaction = requireReaction(
    ir,
    "QualityCheckFailed",
    "PrepTask",
    "markBlocked",
  );
  const paymentReaction = requireReaction(
    ir,
    "PaymentSettled",
    "Invoice",
    "applyPayment",
  );
  const demandReactionId = reactionProofId(demandReaction);
  const qualityReactionId = reactionProofId(qualityReaction);
  const paymentReactionId = reactionProofId(paymentReaction);
  const runtimeProofIds = new Set<string>([
    demandReactionId,
    qualityReactionId,
    paymentReactionId,
    ...SHIFT_RUNTIME_PROOF_IDS,
    ...LOGISTICS_RUNTIME_PROOF_IDS,
    ...COMMERCIAL_RUNTIME_PROOF_IDS,
    ...CLOSEOUT_RUNTIME_PROOF_IDS,
    ...RECIPE_IMPORT_PROOF_IDS,
  ]);
  const structuralProofIds = new Set([
    demandReactionId,
    qualityReactionId,
    paymentReactionId,
  ]);

  const catalog = emitCapabilityCatalog(ir, {
    entityFilter: CATALOG_ENTITIES,
    versions,
    runtimeProofIds,
    structuralProofIds,
  });

  const registry = emitProofRegistry(ir, {
    entityFilter: CATALOG_ENTITIES,
    versions,
    testBindings: [
      {
        proofId: demandReactionId,
        structuralTest: STRUCTURAL_TEST,
        runtimeTest: DEMAND_RUNTIME_TEST,
      },
      {
        proofId: qualityReactionId,
        structuralTest: STRUCTURAL_TEST,
        runtimeTest: QUALITY_RUNTIME_TEST,
      },
      {
        proofId: paymentReactionId,
        structuralTest: STRUCTURAL_TEST,
        runtimeTest: COMMERCIAL_RUNTIME_TEST,
      },
      ...SHIFT_RUNTIME_PROOF_IDS.map((proofId) => ({
        proofId,
        runtimeTest: SHIFT_RUNTIME_TEST,
      })),
      ...LOGISTICS_RUNTIME_PROOF_IDS.map((proofId) => ({
        proofId,
        runtimeTest: LOGISTICS_RUNTIME_TEST,
      })),
      ...COMMERCIAL_RUNTIME_PROOF_IDS.map((proofId) => ({
        proofId,
        runtimeTest: COMMERCIAL_RUNTIME_TEST,
      })),
      ...CLOSEOUT_RUNTIME_PROOF_IDS.map((proofId) => ({
        proofId,
        runtimeTest: CLOSEOUT_RUNTIME_TEST,
      })),
      ...RECIPE_IMPORT_PROOF_IDS.map((proofId) => ({
        proofId,
        runtimeTest: RECIPE_IMPORT_RUNTIME_TEST,
      })),
    ],
  });

  const supplyCatalog = emitCapabilityCatalog(ir, {
    entityFilter: SUPPLY_ENTITIES,
    versions,
    runtimeProofIds: new Set([demandReactionId]),
    structuralProofIds: new Set([demandReactionId]),
  });
  const productionCatalog = emitCapabilityCatalog(ir, {
    entityFilter: PRODUCTION_ENTITIES,
    versions,
    runtimeProofIds: new Set([qualityReactionId]),
    structuralProofIds: new Set([qualityReactionId]),
  });

  const supplyLifecycleStates = [
    "pending",
    "calculated",
    "confirmed",
    "fulfilled",
    "superseded",
    "active",
    "released",
    "consumed",
    "open",
    "ordered",
    "cancelled",
    "draft",
    "submitted",
    "partially_received",
    "received",
  ];
  const productionLifecycleStates = [
    "pending",
    "claimed",
    "in_progress",
    "blocked",
    "completed",
    "cancelled",
    "passed",
    "failed",
  ];

  const supplyGuard = emitIntegrationGuardConfig(supplyCatalog, {
    featureRoots: ["src/features/inventory"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${supplyLifecycleStates.join("|")})["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/SupplyLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: [
          "IngredientDemandConfirmLifecycle",
          "VendorOrderSubmitLifecycle",
        ],
      },
    ],
    extraOwnedTables: [
      "storageLocations",
      "inventoryItems",
      "inventoryReservations",
      "vendors",
      "vendorOrders",
      "vendorOrderLines",
    ],
  });

  const workforceCatalog = emitCapabilityCatalog(ir, {
    entityFilter: WORKFORCE_ENTITIES,
    versions,
    runtimeProofIds: new Set(SHIFT_RUNTIME_PROOF_IDS),
    structuralProofIds: new Set(),
  });
  // Workforce has no cross-entity reactions in the IR; runtime evidence is the
  // governed createVia + command lifecycle in SHIFT_RUNTIME_TEST.
  const workforceLifecycleStates = [
    "assigned",
    "confirmed",
    "checked_in",
    "checked_out",
    "no_show",
    "unassigned",
    "scheduled",
    "started",
    "completed",
    "cancelled",
    "active",
    "withdrawn",
    "open",
    "closed",
    "corrected",
    "expired",
    "revoked",
  ];
  const workforceGuard = emitIntegrationGuardConfig(workforceCatalog, {
    featureRoots: ["src/features/workforce"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${workforceLifecycleStates.join("|")})["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/WorkforceLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: [
          "ShiftStartLifecycle",
          "EventAssignmentCheckInLifecycle",
        ],
      },
    ],
    extraOwnedTables: ["payrollInputs"],
  });

  const productionGuard = emitIntegrationGuardConfig(productionCatalog, {
    featureRoots: ["src/features/production"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${productionLifecycleStates.join("|")})["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/ProductionLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: [
          "PrepTaskClaimLifecycle",
          "QualityCheckFailLifecycle",
        ],
      },
    ],
    extraOwnedTables: ["productionBatches", "incidents", "eventAllergenChecks"],
  });

  const logisticsCatalog = emitCapabilityCatalog(ir, {
    entityFilter: LOGISTICS_ENTITIES,
    versions,
    runtimeProofIds: new Set(LOGISTICS_RUNTIME_PROOF_IDS),
    structuralProofIds: new Set(),
  });
  const logisticsLifecycleStates = [
    "draft",
    "packing",
    "packed",
    "loaded",
    "dispatched",
    "cancelled",
    "pending",
    "listed",
    "missing",
    "scheduled",
    "in_transit",
    "delivered",
    "failed",
  ];
  const logisticsGuard = emitIntegrationGuardConfig(logisticsCatalog, {
    featureRoots: ["src/features/logistics"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${logisticsLifecycleStates.join("|")})["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/LogisticsLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: [
          "PackListStartPackingLifecycle",
          "DeliveryConfirmDeliveryLifecycle",
        ],
      },
    ],
  });

  const commercialCatalog = emitCapabilityCatalog(ir, {
    entityFilter: COMMERCIAL_ENTITIES,
    versions,
    runtimeProofIds: new Set([
      paymentReactionId,
      ...COMMERCIAL_RUNTIME_PROOF_IDS,
    ]),
    structuralProofIds: new Set([paymentReactionId]),
  });
  const commercialLifecycleStates = [
    "draft",
    "sent",
    "viewed",
    "overdue",
    "partial",
    "paid",
    "voided",
    "written_off",
    "pending",
    "processing",
    "completed",
    "failed",
    "refunded",
  ];
  const commercialGuard = emitIntegrationGuardConfig(commercialCatalog, {
    featureRoots: ["src/features/finance"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${commercialLifecycleStates.join("|")})["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/CommercialLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: ["InvoiceSendLifecycle", "PaymentSettleLifecycle"],
      },
      {
        pathSuffix: "/CloseoutLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: ["EventCloseoutFinalizeLifecycle"],
      },
    ],
  });

  const closeoutCatalog = emitCapabilityCatalog(ir, {
    entityFilter: CLOSEOUT_ENTITIES,
    versions,
    runtimeProofIds: new Set(CLOSEOUT_RUNTIME_PROOF_IDS),
    structuralProofIds: new Set(),
  });
  const closeoutGuard = emitIntegrationGuardConfig(closeoutCatalog, {
    featureRoots: ["src/features/finance"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:draft|finalized)["']`,
    lifecyclePolicies: [
      {
        pathSuffix: "/CloseoutLifecyclePolicy.ts",
        bindingsImport: '../../generated/manifest-wiring-bindings"',
        requiredSymbols: ["EventCloseoutFinalizeLifecycle"],
      },
    ],
  });

  mkdirSync(outDir, { recursive: true });
  const write = (name: string, value: unknown) => {
    const text =
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(path.join(outDir, name), text, "utf8");
  };

  write("capability-catalog.json", catalog);
  write("proof-registry.json", registry);
  write("guard.supply.json", supplyGuard);
  write("guard.production.json", productionGuard);
  write("guard.workforce.json", workforceGuard);
  write("guard.logistics.json", logisticsGuard);
  write("guard.commercial.json", commercialGuard);
  write("guard.closeout.json", closeoutGuard);
  write("capability-catalog.md", formatCapabilityCatalogMarkdown(catalog));

  console.log(`Emitted proof-kit artifacts to ${outDir}`);
}

if (import.meta.main) {
  emitCapsuleProofKit();
}
