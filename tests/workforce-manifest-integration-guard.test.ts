import { describe, expect, it } from "vitest";
import {
  inspectWorkforceManifestIntegration,
  inspectWorkforceSource,
} from "../scripts/check-workforce-manifest-integration";

describe("Workforce Manifest integration guard", () => {
  it("keeps current authored workforce integration on approved generated surfaces", () => {
    expect(inspectWorkforceManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { Shift_start } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectWorkforceSource("src/features/workforce/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-workforce-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to workforce documents", () => {
    const tables = [
      "eventAssignments",
      "shifts",
      "availabilityWindows",
      "timeRecords",
      "qualifications",
    ];
    for (const table of tables) {
      const violations = inspectWorkforceSource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: "generated-workforce-writes-only",
          }),
        ]),
      );
    }
  });

  it("rejects locally recreated workforce lifecycle tables", () => {
    const violations = inspectWorkforceSource(
      "src/features/workforce/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "scheduled", to: "started" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-workforce-lifecycle" }),
      ]),
    );
  });
});
