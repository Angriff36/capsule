/**
 * Emit Manifest DX proof-kit artifacts for Capsule (catalog, registry, guard).
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

const VERTICAL_ENTITIES = ["IngredientDemand", "PurchaseNeed"] as const;
const RUNTIME_TEST = "tests/proofs/ingredient-demand-confirm.runtime.test.ts";
const STRUCTURAL_TEST = "tests/event-reaction-projection.test.ts";

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

export function emitCapsuleProofKit(options?: { skipCompile?: boolean }): void {
  if (!options?.skipCompile) compileIr();
  const ir = loadIr();
  const versions = {
    manifestVersion: manifestVersion(ir),
    projection: "convex",
    preset: presetVersions(),
  };

  const reaction = (ir.reactions ?? []).find(
    (r) =>
      r.event === "IngredientDemandConfirmed" &&
      r.targetEntity === "PurchaseNeed" &&
      r.targetCommand === "create",
  );
  if (!reaction) {
    throw new Error(
      "Expected IngredientDemandConfirmed → PurchaseNeed.create reaction in IR",
    );
  }
  const reactionId = reactionProofId(reaction);

  const catalog = emitCapabilityCatalog(ir, {
    entityFilter: VERTICAL_ENTITIES,
    versions,
    runtimeProofIds: new Set([reactionId]),
    structuralProofIds: new Set([reactionId]),
  });

  const registry = emitProofRegistry(ir, {
    entityFilter: VERTICAL_ENTITIES,
    versions,
    testBindings: [
      {
        proofId: reactionId,
        structuralTest: STRUCTURAL_TEST,
        runtimeTest: RUNTIME_TEST,
      },
    ],
  });

  const lifecycleStates = [
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

  const guard = emitIntegrationGuardConfig(catalog, {
    featureRoots: ["src/features/inventory"],
    convexLibRoot: "convex/lib",
    versions,
    lifecycleLiteralPattern: `\\b(?:from|to)\\s*:\\s*["'](?:${lifecycleStates.join("|")})["']`,
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

  mkdirSync(outDir, { recursive: true });
  const write = (name: string, value: unknown) => {
    const text =
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(path.join(outDir, name), text, "utf8");
  };

  write("capability-catalog.json", catalog);
  write("proof-registry.json", registry);
  write("guard.supply.json", guard);
  write("capability-catalog.md", formatCapabilityCatalogMarkdown(catalog));

  console.log(`Emitted proof-kit artifacts to ${outDir}`);
}

if (import.meta.main) {
  emitCapsuleProofKit();
}
