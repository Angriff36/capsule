/**
 * CI gate: proof registry must match installed versions and runtime test evidence.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  assertProofRegistryValid,
  type CapabilityCatalog,
  type ProofRegistry,
} from "@angriff36/manifest/proof-kit";

const root = process.cwd();
const require = createRequire(import.meta.url);

function loadJson<T>(rel: string): T {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    throw new Error(`Missing proof artifact ${rel} — run: bun run proof:emit`);
  }
  return JSON.parse(readFileSync(abs, "utf8")) as T;
}

export function checkProofRegistry(rootDir = root): void {
  const catalog = loadJson<CapabilityCatalog>(
    "generated/proof/capability-catalog.json",
  );
  const registry = loadJson<ProofRegistry>(
    "generated/proof/proof-registry.json",
  );
  const manifestPkg = require("@angriff36/manifest/package.json") as {
    version: string;
  };
  const appPkg = require(path.join(rootDir, "package.json")) as {
    manifestPreset?: { id: string; version: string };
  };

  assertProofRegistryValid(registry, {
    rootDir,
    catalog,
    installedManifestVersion: manifestPkg.version,
    installedPreset: appPkg.manifestPreset
      ? {
          id: appPkg.manifestPreset.id,
          version: appPkg.manifestPreset.version,
        }
      : undefined,
  });
}

if (import.meta.main) {
  try {
    checkProofRegistry();
    console.log("Proof registry validation passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
