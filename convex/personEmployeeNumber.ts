/**
 * AUTHOR SEAM — set Person.employeeNumber after hire.
 *
 * ~~Person.hire already accepts employeeNumber. There is no generated
 * Person.setEmployeeNumber mutation until the next `bun run manifest:regen`
 * (sibling Builder is not on this machine).~~
 * Corrected 2026-09-29: the generated Person_setEmployeeNumber exists and
 * this seam now writes only through it (it emits PersonEmployeeNumberSet).
 *
 * Finance managers on /finance/payroll cannot wait: a missing number blocks
 * CSV download. Finance + workforce managers may set it (payroll is the
 * surface that needs the number). The generated command takes the Person
 * default policies (workforceManageAccess) and Manifest has no per-command
 * policy, so a finance manager — admitted by the role check below — runs the
 * command as the tenant system identity. Everyone else runs it with their
 * own auth. Does not invent rates.
 *
 * Source of truth: src/identity/person.manifest command setEmployeeNumber.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

function canSetEmployeeNumber(role: string): boolean {
  return (
    role === "finance_manager" ||
    role === "workforce_manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

export const setEmployeeNumber = mutation({
  args: {
    docId: v.id("people"),
    employeeNumber: v.string(),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!canSetEmployeeNumber(auth.role)) {
      throw new Error("You cannot set an employee number.");
    }
    const employeeNumber = args.employeeNumber.trim();
    if (!employeeNumber) {
      throw new Error("Enter an employee number.");
    }
    const stored = await ctx.db.get(args.docId);
    if (!stored || String(stored.tenantId) !== auth.tenantId) {
      throw new Error("Person not found.");
    }
    if (stored.deletedAt != null) {
      throw new Error("This person is no longer on the roster.");
    }
    if (
      args.version !== undefined &&
      stored.version !== undefined &&
      stored.version !== args.version
    ) {
      throw new Error(
        `ConcurrencyConflict: VERSION_MISMATCH expected ${args.version} actual ${stored.version}`,
      );
    }
    // Finance managers hold financeManageAccess, not workforceManageAccess:
    // this seam is their authority, so the command runs as the system.
    const runner =
      auth.role === "finance_manager"
        ? TenantSystemCommandRunner.forTenant(ctx, auth.tenantId).context
        : ctx;
    await runner.runMutation(api.mutations.Person_setEmployeeNumber, {
      docId: args.docId,
      employeeNumber,
      version: stored.version,
    });
    return { employeeNumber };
  },
});
