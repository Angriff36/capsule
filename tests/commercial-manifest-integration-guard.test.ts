import { describe, expect, it } from "vitest";
import {
  inspectCommercialManifestIntegration,
  inspectCommercialSource,
} from "../scripts/check-commercial-manifest-integration";

describe("Commercial Manifest integration guard", () => {
  it("keeps current authored finance integration on approved generated surfaces", () => {
    expect(inspectCommercialManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { Invoice_issue } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectCommercialSource("src/features/finance/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-commercial-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to commercial documents", () => {
    for (const table of ["invoices", "payments"]) {
      const violations = inspectCommercialSource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: "generated-commercial-writes-only",
          }),
        ]),
      );
    }
  });

  it("rejects locally recreated commercial lifecycle tables", () => {
    const violations = inspectCommercialSource(
      "src/features/finance/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "draft", to: "sent" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generated-commercial-lifecycle",
        }),
      ]),
    );
  });
});
