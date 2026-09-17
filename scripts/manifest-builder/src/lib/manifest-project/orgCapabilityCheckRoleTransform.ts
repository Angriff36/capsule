/**
 * Capsule org-capability enforcement for generated checkRole helpers.
 *
 * Manifest emits checkRole(user.role, …). Capsule needs checkRole(user, …)
 * so disabledCapabilities from getAuthContext are honored. Applied to
 * generated mutations/queries candidates before ownership planning so stock
 * surfaces never need baselined:true to keep the patch.
 */

const CHECK_ROLE_STOCK =
  /function checkRole\(userRole: unknown, action: unknown, target\?: unknown\): boolean \{\r?\n\s*if \(typeof userRole !== "string" \|\| typeof action !== "string"\) return false;\r?\n\s*const perms = ROLE_PERMISSIONS\[userRole\];\r?\n\s*const requestedTarget = typeof target === "string" \? target : undefined;\r?\n\s*return perms \? perms\.some\(\(permission\) =>\r?\n\s*\(permission\.action === action \|\| permission\.action === "all"\) &&\r?\n\s*\(permission\.target === undefined \|\| permission\.target === requestedTarget\)\r?\n\s*\) : false;\r?\n\}/;

const CHECK_ROLE_CAPSULE = `function checkRole(userOrRole: unknown, action: unknown, target?: unknown): boolean {
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

const TARGET_PATHS = new Set(["convex/mutations.ts", "convex/queries.ts"]);

export function transformOrgCapabilityCheckRole(content: string): {
  content: string;
  applied: boolean;
} {
  if (content.includes("__orgCapabilityDeniesAction")) {
    return { content, applied: false };
  }
  if (!CHECK_ROLE_STOCK.test(content)) {
    return { content, applied: false };
  }
  let next = content.replace(CHECK_ROLE_STOCK, CHECK_ROLE_CAPSULE);
  next = next.replace(/checkRole\(user\.role,/g, "checkRole(user,");
  return { content: next, applied: next !== content };
}

/** Apply Capsule org-capability checkRole transform to generated file map. */
export function applyOrgCapabilityCheckRoleToGeneratedFiles(
  files: Map<string, { content: string }>,
): string[] {
  const touched: string[] = [];
  for (const path of TARGET_PATHS) {
    const file = files.get(path);
    if (!file) continue;
    const result = transformOrgCapabilityCheckRole(file.content);
    if (!result.applied) continue;
    files.set(path, { content: result.content });
    touched.push(path);
  }
  return touched;
}
