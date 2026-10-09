/**
 * Issues #52 / #439: provider callbacks (Twilio delivery reports, signed
 * webhooks) need routes beside the generated router, and Convex allows one
 * router file. This runs after Builder regeneration and makes generated
 * convex/http.ts call registerAuthoredRoutes (convex/lib/httpRoutes.ts) before
 * its export, refreshing the generated surface's ownership digest.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/http.ts";
const IMPORT_ANCHOR = 'import { api } from "./_generated/api";\n';
const IMPORT = 'import { registerAuthoredRoutes } from "./lib/httpRoutes";\n';
const EXPORT_LINE = "export default http;";
const CALL = "registerAuthoredRoutes(http);\n\n";

export function applyAuthoredHttpRoutes(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(`apply-authored-http-routes: missing ${TARGET}`);
  }
  const source = readFileSync(abs, "utf8");
  let updated = source;
  if (!source.includes(IMPORT)) {
    if (!source.includes(IMPORT_ANCHOR) || !source.includes(EXPORT_LINE)) {
      throw new Error("apply-authored-http-routes: router anchors not found");
    }
    updated = source
      .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${IMPORT}`)
      .replace(EXPORT_LINE, `${CALL}${EXPORT_LINE}`);
    writeFileSync(abs, updated, "utf8");
  }
  refreshOwnershipDigest(root, abs);
  return updated === source ? [] : [TARGET];
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
  const touched = applyAuthoredHttpRoutes();
  console.log(
    touched.length === 0
      ? "authored http routes: already applied"
      : `authored http routes: patched ${touched.join(", ")}`,
  );
}
