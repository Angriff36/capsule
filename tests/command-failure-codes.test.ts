/**
 * AC-639: the failure codes the generated runtime cannot raise in a quick
 * proof, read from the real messages the server sends today (quoted from
 * convex/mutations.ts and the authored seams).
 */
import { describe, expect, it } from "vitest";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";

function codeOf(message: string): string {
  return classifyCommandFailure(
    new Error(
      `[CONVEX M(mutations:Thing_do)] [Request ID: abc123] Server Error\nUncaught Error: ${message}\n    at handler (../convex/mutations.ts:1:1)`,
    ),
  ).code;
}

describe("stable failure codes from real server messages", () => {
  it.each([
    [
      "Not enough free stock: other events already hold some of it. Lower the amount, or turn off stock-level checks on the stock book.",
      "INSUFFICIENT_STOCK",
    ],
    [
      "TRUCK-1 is already out for Timing proof gala, 5 PM to 10 PM. Give this run other times.",
      "SCHEDULE_CONFLICT",
    ],
    ["SHOP-1 is in the shop for maintenance.", "SCHEDULE_CONFLICT"],
    [
      "This delivery's unit doesn't convert to the stock unit. Use a matching unit.",
      "UNIT_CONVERSION_UNRESOLVED",
    ],
    ["Rate limit exceeded (retry after 3000ms)", "PROVIDER_RETRYING"],
    [
      "CAPSULE_PUBLIC_APP_URL is missing on this deployment.",
      "PROVIDER_ACTION_REQUIRED",
    ],
    [
      "Reconcile dish editions and merges before reclassifying this dish",
      "RECONCILIATION_REQUIRED",
    ],
    [
      "The original coverage requirements are missing. Restore the staffing history before assigning.",
      "MISSING_REQUIRED_FACT",
    ],
    ["Invoice recipient email is missing.", "MISSING_REQUIRED_FACT"],
    [
      "Kitchen, inventory and managers may change unit mappings",
      "NOT_FOUND_OR_FORBIDDEN",
    ],
    [
      "Only an administrator may correct imported packing units",
      "NOT_FOUND_OR_FORBIDDEN",
    ],
    ["ImportConflict not found", "NOT_FOUND_OR_FORBIDDEN"],
    ["Guard 2 failed", "INVALID_STATE"],
    ["Give this person a first name.", "VALIDATION_FAILED"],
    [
      "Validator error: Expected `number`, got `2026-12-01`",
      "VALIDATION_FAILED",
    ],
    [
      "ConcurrencyConflict: VERSION_MISMATCH expected 1 actual 2",
      "STALE_VERSION",
    ],
    ["", "UNEXPECTED"],
  ])("%s -> %s", (message, code) => {
    expect(codeOf(message)).toBe(code);
  });

  it("a bulk run keeps the code of the step that stopped it", () => {
    const failure = Object.assign(new Error("bulk"), {
      name: "BulkRunFailure",
      cause: new Error("Uncaught Error: ConcurrencyConflict: VERSION_MISMATCH"),
      completed: 2,
      failed: 1,
      remaining: 3,
    });
    expect(classifyCommandFailure(failure).code).toBe("STALE_VERSION");
  });

  it("a form check before sending is VALIDATION_FAILED", () => {
    const zod = Object.assign(new Error("bad"), {
      name: "ZodError",
      issues: [],
    });
    expect(classifyCommandFailure(zod).code).toBe("VALIDATION_FAILED");
  });
});
