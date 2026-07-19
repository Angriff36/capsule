import { describe, expect, it } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import {
  AGENT_AC_CAPABILITY_IDS,
  mutationNameForCapability,
} from "../../src/agent/CapsuleCommandMutationMap";

describe("CapsuleCommandCatalog", () => {
  it("lists AC capabilities with Convex mutation names from wiring", () => {
    const catalog = new CapsuleCommandCatalog();
    const listed = catalog.list();
    expect(listed.map((c) => c.capabilityId).sort()).toEqual(
      [...AGENT_AC_CAPABILITY_IDS].sort(),
    );
    for (const item of listed) {
      expect(item.mutationName).toBe(
        mutationNameForCapability(item.capabilityId),
      );
      expect(item.route).toContain("/api/manifest/");
      expect(item.clientParameterNames.length).toBeGreaterThan(0);
    }
  });

  it("describes Recipe.draft client params", () => {
    const draft = new CapsuleCommandCatalog().get("Recipe.draft");
    expect(draft.mutationName).toBe("Recipe_createViaDraft");
    expect(draft.clientParameterNames).toContain("name");
    expect(draft.clientParameterNames).toContain("yieldQuantity");
  });
});
