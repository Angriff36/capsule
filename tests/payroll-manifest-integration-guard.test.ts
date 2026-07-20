import { describe, expect, it } from "vitest";
import {
  inspectPayrollManifestIntegration,
  inspectPayrollSource,
} from "../scripts/check-payroll-manifest-integration";

describe("Payroll Manifest integration guard", () => {
  it("keeps PayrollLifecyclePolicy on approved generated surfaces", () => {
    expect(inspectPayrollManifestIntegration()).toEqual([]);
  });

  it("rejects handwritten payroll lifecycle tables", () => {
    const violations = inspectPayrollSource(
      "src/features/finance/PayrollLocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "prepared", to: "finalized" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generated-payroll-lifecycle",
        }),
      ]),
    );
  });

  it("rejects direct authored writes to payrollInputs", () => {
    const violations = inspectPayrollSource(
      "convex/lib/rogue-payroll.ts",
      `async function bypass(ctx: any) { await ctx.db.insert("payrollInputs", {}); }`,
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generated-payroll-writes-only",
        }),
      ]),
    );
  });
});
