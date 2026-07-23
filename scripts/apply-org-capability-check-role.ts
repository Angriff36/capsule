/**
 * After Manifest/Builder emit checkRole(user.role, …), rewrite Convex surfaces
 * so checkRole receives the auth object and honors disabledCapabilities from
 * getAuthContext (org capability toggles).
 *
 * Invoked from manifest-regen.ts so regen cannot wipe enforcement.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CHECK_ROLE_OLD =
  /function checkRole\(userRole: unknown, action: unknown, target\?: unknown\): boolean \{\r?\n\s*if \(typeof userRole !== "string" \|\| typeof action !== "string"\) return false;\r?\n\s*const perms = ROLE_PERMISSIONS\[userRole\];\r?\n\s*const requestedTarget = typeof target === "string" \? target : undefined;\r?\n\s*return perms \? perms\.some\(\(permission\) =>\r?\n\s*\(permission\.action === action \|\| permission\.action === "all"\) &&\r?\n\s*\(permission\.target === undefined \|\| permission\.target === requestedTarget\)\r?\n\s*\) : false;\r?\n\}/;

const CHECK_ROLE_NEW = `function checkRole(userOrRole: unknown, action: unknown, target?: unknown): boolean {
  let userRole: unknown;
  let disabledCapabilities: unknown;
  if (typeof userOrRole === "string") {
    userRole = userOrRole;
  } else if (userOrRole !== null && typeof userOrRole === "object") {
    const auth = userOrRole as { role?: unknown; disabledCapabilities?: unknown };
    userRole = auth.role;
    disabledCapabilities = auth.disabledCapabilities;
  } else {
    return false;
  }
  if (typeof userRole !== "string" || typeof action !== "string") return false;
  if (__orgCapabilityDeniesAction(action, disabledCapabilities)) return false;
  const perms = ROLE_PERMISSIONS[userRole];
  const requestedTarget = typeof target === "string" ? target : undefined;
  return perms ? perms.some((permission) =>
    (permission.action === action || permission.action === "all") &&
    (permission.target === undefined || permission.target === requestedTarget)
  ) : false;
}

function __orgCapabilityDeniesAction(action: string, disabled: unknown): boolean {
  if (!Array.isArray(disabled) || disabled.length === 0) return false;
  const capability = __orgCapabilityForAction(action);
  if (capability === null) return false;
  return disabled.some((entry) => entry === capability);
}

function __orgCapabilityForAction(action: string): string | null {
  if (action === "staffAccess" || action === "manageAccess" || action === "adminAccess") return null;
  if (action.startsWith("kitchen")) return "kitchen";
  if (action.startsWith("inventory")) return "inventory";
  if (action.startsWith("procurement")) return "procurement";
  if (action.startsWith("event")) return "events";
  if (action.startsWith("sales")) return "sales";
  if (action.startsWith("logistics")) return "logistics";
  if (action.startsWith("workforce")) return "workforce";
  if (action.startsWith("finance")) return "finance";
  return null;
}`;

const SURFACES = ["convex/mutations.ts", "convex/queries.ts"] as const;

export function applyOrgCapabilityCheckRole(root: string = ROOT): string[] {
  const touched: string[] = [];
  for (const rel of SURFACES) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      throw new Error(`apply-org-capability-check-role: missing ${rel}`);
    }
    let source = readFileSync(abs, "utf8");
    const before = source;
    if (!CHECK_ROLE_OLD.test(source)) {
      if (source.includes("__orgCapabilityDeniesAction")) {
        continue;
      }
      throw new Error(
        `apply-org-capability-check-role: checkRole helper not found in ${rel}`,
      );
    }
    source = source.replace(CHECK_ROLE_OLD, CHECK_ROLE_NEW);
    source = source.replaceAll("checkRole(user.role,", "checkRole(user,");
    if (source === before) {
      throw new Error(
        `apply-org-capability-check-role: ${rel} matched helper but no write occurred`,
      );
    }
    writeFileSync(abs, source, "utf8");
    touched.push(rel);
  }
  refreshOwnershipDigests(root, [...SURFACES]);
  return touched;
}

function refreshOwnershipDigests(root: string, relPaths: string[]): void {
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (!existsSync(ownershipPath)) return;
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    version: number;
    files: Record<string, { sha256: string }>;
  };
  for (const rel of relPaths) {
    if (!ownership.files[rel]) continue;
    const abs = join(root, rel);
    const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
    ownership.files[rel] = { sha256: hash };
  }
  writeFileSync(
    ownershipPath,
    `${JSON.stringify(ownership, null, 2)}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  const touched = applyOrgCapabilityCheckRole();
  console.log(
    touched.length === 0
      ? "org-capability checkRole: already applied"
      : `org-capability checkRole: patched ${touched.join(", ")}`,
  );
}
