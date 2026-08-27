/**
 * AUTHOR SEAM — set Person.employeeNumber after hire.
 *
 * Person.hire already accepts employeeNumber. There is no generated
 * Person.setEmployeeNumber mutation until the next `bun run manifest:regen`
 * (sibling Builder is not on this machine). Finance managers on
 * /finance/payroll cannot wait: a missing number blocks CSV download.
 *
 * Mirrors Person.setPayRate: tenant match, not deleted, version bump.
 * Finance + workforce managers may set it (payroll is the surface that
 * needs the number). Does not invent rates.
 *
 * Source of truth for the next regen: src/identity/person.manifest
 * command setEmployeeNumber.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

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
      throw new Error("Employee number is required.");
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
    await ctx.db.patch(args.docId, {
      employeeNumber,
      version: (stored.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "PersonEmployeeNumberSet",
      entity: "Person",
      entityId: String(args.docId),
      payload: {
        personId: String(args.docId),
        tenantId: auth.tenantId,
        employeeNumber,
      },
      createdAt: Date.now(),
    });
    return { employeeNumber };
  },
});
