/**
 * PL-AUTH (AC-151): make every public generated mutation refuse record ids of
 * another workspace (see convex/lib/ownWorkspaceLinks.ts). The Convex
 * projection stores caller-sent link ids without looking them up, so this
 * runs after Builder regeneration, alongside the other generated runtime
 * patches, and refreshes the generated surface's ownership digest.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";

const IMPORT_ANCHOR = 'import { getAuthContext } from "./lib/authContext";\n';
const IMPORT =
  'import { assertOwnWorkspaceLinks as __assertOwnWorkspaceLinks } from "./lib/ownWorkspaceLinks";\n';
const HANDLER = /^ {2}handler: async \(ctx, args(?:: any)?\) => \{\n/gm;
const CALL = "    await __assertOwnWorkspaceLinks(ctx, args);\n";

export function applyOwnWorkspaceLinks(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(`apply-own-workspace-links: missing ${TARGET}`);
  }
  const source = readFileSync(abs, "utf8");
  if (source.includes(IMPORT)) {
    refreshOwnershipDigest(root, abs);
    return [];
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error("apply-own-workspace-links: auth import anchor not found");
  }
  const mutations = source.match(/= mutation\(\{/g)?.length ?? 0;
  const handlers = source.match(HANDLER)?.length ?? 0;
  if (handlers !== mutations) {
    throw new Error(
      `apply-own-workspace-links: ${String(handlers)} handlers for ${String(mutations)} mutations`,
    );
  }
  const updated = source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${IMPORT}`)
    .replace(HANDLER, (line) => `${line}${CALL}`);
  writeFileSync(abs, updated, "utf8");
  refreshOwnershipDigest(root, abs);
  return [TARGET];
}

function refreshOwnershipDigest(root: string, abs: string): void {
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (!existsSync(ownershipPath)) return;
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    files: Record<string, { sha256: string; baselined?: boolean }>;
  };
  const entry = ownership.files[TARGET];
  if (!entry) return;
  ownership.files[TARGET] = {
    sha256: createHash("sha256").update(readFileSync(abs)).digest("hex"),
  };
  writeFileSync(
    ownershipPath,
    `${JSON.stringify(ownership, null, 2)}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  const touched = applyOwnWorkspaceLinks();
  console.log(
    touched.length === 0
      ? "own-workspace links: already applied"
      : `own-workspace links: patched ${touched.join(", ")}`,
  );
}
