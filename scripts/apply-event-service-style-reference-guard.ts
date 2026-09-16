/**
 * Add the cross-entity target check that the current Convex projection cannot
 * lower from Manifest source. This runs after Builder regeneration, alongside
 * the existing org-capability transform, and refreshes the generated surface's
 * ownership digest through the caller.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";

const VALIDATION = `    const __targetServiceStyle = await ctx.db
      .query("serviceStyles")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", __auth.tenantId))
      .filter((q: any) => q.eq(q.field("_id"), serviceStyleId))
      .first();
    if (!__targetServiceStyle ||
        __targetServiceStyle.tenantId !== __auth.tenantId ||
        __targetServiceStyle.status !== "active" ||
        __targetServiceStyle.deletedAt != null) {
      throw new Error("Events must reference an active service style");
    }
`;

const LEGACY_VALIDATION = `    let __targetServiceStyle: Record<string, any> | null = null;
    try {
      __targetServiceStyle = await ctx.db.get(serviceStyleId as any) as Record<string, any> | null;
    } catch {
      __targetServiceStyle = null;
    }
    if (!__targetServiceStyle ||
        __targetServiceStyle.tenantId !== __auth.tenantId ||
        __targetServiceStyle.status !== "active" ||
        __targetServiceStyle.deletedAt != null) {
      throw new Error("Events must reference an active service style");
    }
`;

const ANCHOR =
  '    if ((__storedDoc as any).tenantId !== __auth.tenantId) throw new Error("Event not found");\n';

export function applyEventServiceStyleReferenceGuard(
  root: string = ROOT,
): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(
      `apply-event-service-style-reference-guard: missing ${TARGET}`,
    );
  }

  let source = readFileSync(abs, "utf8");
  if (source.includes("__targetServiceStyle")) {
    if (!source.includes('.query("serviceStyles")')) {
      const updated = source.replace(LEGACY_VALIDATION, VALIDATION);
      if (updated === source) {
        throw new Error(
          "apply-event-service-style-reference-guard: legacy validation block not found",
        );
      }
      writeFileSync(abs, updated, "utf8");
      refreshOwnershipDigest(root, abs);
      return [TARGET];
    }
    refreshOwnershipDigest(root, abs);
    return [];
  }
  if (!source.includes("async function __runEventChangeServiceStyle")) {
    throw new Error(
      "apply-event-service-style-reference-guard: Event.changeServiceStyle runner not found",
    );
  }
  if (!source.includes(ANCHOR)) {
    throw new Error(
      "apply-event-service-style-reference-guard: tenant guard anchor not found",
    );
  }

  const runnerStart = source.indexOf(
    "async function __runEventChangeServiceStyle",
  );
  const runnerEnd = source.indexOf(
    "\n}\n\nexport const Event_changeServiceStyle",
    runnerStart,
  );
  if (runnerEnd < 0) {
    throw new Error(
      "apply-event-service-style-reference-guard: Event.changeServiceStyle runner boundary not found",
    );
  }
  const localRunner = source.slice(runnerStart, runnerEnd);
  if (!localRunner.includes(ANCHOR)) {
    throw new Error(
      "apply-event-service-style-reference-guard: target runner tenant guard anchor not found",
    );
  }

  const updatedRunner = localRunner.replace(ANCHOR, `${ANCHOR}${VALIDATION}`);
  source = `${source.slice(0, runnerStart)}${updatedRunner}${source.slice(runnerStart + localRunner.length)}`;
  writeFileSync(abs, source, "utf8");
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
  const touched = applyEventServiceStyleReferenceGuard();
  console.log(
    touched.length === 0
      ? "event service-style reference guard: already applied"
      : `event service-style reference guard: patched ${touched.join(", ")}`,
  );
}
