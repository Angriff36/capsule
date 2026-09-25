/**
 * Keep `.builder/baselines` equal to what `.builder/ownership.json` names.
 *
 * Builder prunes unreferenced blobs inside its apply, but the post-regen
 * patches in scripts/manifest-regen.ts rewrite convex/mutations.ts AFTER that
 * apply and move its ledger digest to the patched bytes. Without this step the
 * store keeps the unpatched blob (unreferenced) and lacks the patched one.
 * Baselines piled up to ~970 files twice (Sep 11, Sep 24 2026); this step and
 * the check in scripts/manifest-regen-check.ts keep the store exact.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const STORE = join(".builder", "baselines");
const DIGEST = /^[a-f0-9]{64}$/;

function ledgerDigests(root: string): Map<string, string> {
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (!existsSync(ownershipPath)) return new Map();
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    files: Record<string, { sha256: string }>;
  };
  return new Map(
    Object.entries(ownership.files).map(([path, entry]) => [
      entry.sha256,
      path,
    ]),
  );
}

function storedDigests(root: string): string[] {
  const dir = join(root, STORE);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (name) => DIGEST.test(name) && statSync(join(dir, name)).isFile(),
  );
}

/** Blobs that differ from the ledger: extra ones on disk, and missing ones. */
export function baselineDrift(root: string): {
  unreferenced: string[];
  missing: string[];
} {
  const ledger = ledgerDigests(root);
  const stored = storedDigests(root);
  const storedSet = new Set(stored);
  return {
    unreferenced: stored.filter((digest) => !ledger.has(digest)),
    missing: [...ledger.keys()].filter((digest) => !storedSet.has(digest)),
  };
}

/** Write each missing blob from its current file, delete every unreferenced one. */
export function syncBuilderBaselines(root: string): {
  written: number;
  removed: number;
} {
  const ledger = ledgerDigests(root);
  const drift = baselineDrift(root);
  let written = 0;
  for (const digest of drift.missing) {
    const abs = join(root, ledger.get(digest)!);
    if (!existsSync(abs)) continue;
    const bytes = readFileSync(abs);
    if (createHash("sha256").update(bytes).digest("hex") !== digest) continue;
    mkdirSync(join(root, STORE), { recursive: true });
    writeFileSync(join(root, STORE, digest), bytes);
    written += 1;
  }
  for (const digest of drift.unreferenced) {
    rmSync(join(root, STORE, digest));
  }
  return { written, removed: drift.unreferenced.length };
}
