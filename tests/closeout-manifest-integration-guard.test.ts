import { describe, expect, it } from "vitest";
import {
  inspectManifestIntegration,
  inspectManifestSource,
} from "../scripts/check-manifest-integration";

const inspectCloseoutManifestIntegration = () =>
  inspectManifestIntegration("closeout");
const inspectCloseoutSource = (file: string, source: string) =>
  inspectManifestSource("closeout", file, source);

describe("Closeout Manifest integration guard", () => {
  it("keeps CloseoutLifecyclePolicy on approved generated surfaces", () => {
    expect(inspectCloseoutManifestIntegration()).toEqual([]);
  });

  it("rejects handwritten closeout lifecycle tables", () => {
    const violations = inspectCloseoutSource(
      "src/features/finance/CloseoutLocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "draft", to: "finalized" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generated-closeout-lifecycle",
        }),
      ]),
    );
  });

  it("rejects direct authored writes to eventCloseouts", () => {
    const violations = inspectCloseoutSource(
      "convex/lib/rogue-closeout.ts",
      `async function bypass(ctx: any) { await ctx.db.insert("eventCloseouts", {}); }`,
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generated-closeout-writes-only",
        }),
      ]),
    );
  });
});
