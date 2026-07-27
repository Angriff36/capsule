import { describe, expect, it } from "vitest";
import {
  inspectCulinaryManifestIntegration,
  inspectCulinarySource,
} from "../scripts/check-culinary-manifest-integration";

describe("Culinary Manifest integration guard", () => {
  it("keeps current authored Culinary integration on approved generated surfaces", () => {
    expect(inspectCulinaryManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { Component_draft } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectCulinarySource("src/features/kitchen/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-culinary-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to Culinary-owned documents", () => {
    const tables = [
      "ingredients",
      "components",
      "componentIngredients",
      "dishes",
      "menus",
      "eventDishes",
    ];
    for (const table of tables) {
      const violations = inspectCulinarySource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "generated-culinary-writes-only" }),
        ]),
      );
    }
  });

  it("does not exempt a local Culinary allocation seam", () => {
    const violations = inspectCulinarySource(
      "convex/lib/culinaryPlanning.ts",
      'async function allocate(ctx: any) { return ctx.db.insert("components", {}); }',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-culinary-writes-only" }),
      ]),
    );
  });

  it("rejects locally recreated Culinary lifecycle transition tables", () => {
    const violations = inspectCulinarySource(
      "src/features/kitchen/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "draft", to: "published" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-culinary-lifecycle" }),
      ]),
    );
  });
});
