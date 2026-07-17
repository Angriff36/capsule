import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  validateProofRegistry,
  type CapabilityCatalog,
  type ProofRegistry,
} from "@angriff36/manifest/proof-kit";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;
}

describe("proof registry gate", () => {
  it("accepts emitted registry while runtime test exists", () => {
    expect(
      existsSync(path.join(root, "generated/proof/proof-registry.json")),
    ).toBe(true);
    const catalog = load<CapabilityCatalog>(
      "generated/proof/capability-catalog.json",
    );
    const registry = load<ProofRegistry>("generated/proof/proof-registry.json");
    const manifestPkg = require("@angriff36/manifest/package.json") as {
      version: string;
    };
    const appPkg = require(path.join(root, "package.json")) as {
      manifestPreset?: { id: string; version: string };
    };
    const issues = validateProofRegistry(registry, {
      rootDir: root,
      catalog,
      installedManifestVersion: manifestPkg.version,
      installedPreset: appPkg.manifestPreset,
    });
    expect(issues).toEqual([]);
    const demandReaction = registry.proofs.find((p) =>
      p.id.includes("IngredientDemandConfirmed"),
    );
    expect(demandReaction?.status).toBe("runtime_proven");
    expect(demandReaction?.runtimeTest).toBe(
      "tests/proofs/ingredient-demand-confirm.runtime.test.ts",
    );
    const qualityReaction = registry.proofs.find((p) =>
      p.id.includes("QualityCheckFailed"),
    );
    expect(qualityReaction?.status).toBe("runtime_proven");
    expect(qualityReaction?.runtimeTest).toBe(
      "tests/proofs/quality-check-fail-block.runtime.test.ts",
    );
    for (const id of ["Shift.schedule", "Shift.start", "Shift.complete"]) {
      const shiftProof = registry.proofs.find((p) => p.id === id);
      expect(shiftProof?.status).toBe("runtime_proven");
      expect(shiftProof?.runtimeTest).toBe(
        "tests/proofs/shift-lifecycle.runtime.test.ts",
      );
    }
    for (const id of [
      "Recipe.draft",
      "Ingredient.introduce",
      "RecipeIngredient.add",
    ]) {
      const importProof = registry.proofs.find((p) => p.id === id);
      expect(importProof?.status).toBe("runtime_proven");
      expect(importProof?.runtimeTest).toBe(
        "tests/proofs/recipe-import-finalize.runtime.test.ts",
      );
    }
  });

  it("fails when runtime test path is missing (negative proof)", () => {
    const catalog = load<CapabilityCatalog>(
      "generated/proof/capability-catalog.json",
    );
    const registry = load<ProofRegistry>("generated/proof/proof-registry.json");
    const manifestPkg = require("@angriff36/manifest/package.json") as {
      version: string;
    };
    const issues = validateProofRegistry(registry, {
      rootDir: root,
      catalog,
      installedManifestVersion: manifestPkg.version,
      fileExists: (abs) =>
        !abs
          .replace(/\\/g, "/")
          .includes("ingredient-demand-confirm.runtime.test.ts") &&
        existsSync(abs),
    });
    expect(issues.some((i) => i.code === "RUNTIME_PROOF_MISSING_TEST")).toBe(
      true,
    );
  });

  it("rejects handwritten runtime_proven without runtimeTest", () => {
    const catalog = load<CapabilityCatalog>(
      "generated/proof/capability-catalog.json",
    );
    const registry = load<ProofRegistry>("generated/proof/proof-registry.json");
    const forged: ProofRegistry = {
      ...registry,
      proofs: registry.proofs.map((p) =>
        p.id.includes("IngredientDemandConfirmed")
          ? { ...p, status: "runtime_proven", runtimeTest: undefined }
          : p,
      ),
    };
    const manifestPkg = require("@angriff36/manifest/package.json") as {
      version: string;
    };
    const issues = validateProofRegistry(forged, {
      rootDir: root,
      catalog,
      installedManifestVersion: manifestPkg.version,
    });
    expect(issues.some((i) => i.code === "HANDWRITTEN_RUNTIME_CLAIM")).toBe(
      true,
    );
  });
});
