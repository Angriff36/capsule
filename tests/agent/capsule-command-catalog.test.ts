import { describe, expect, it } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import {
  AGENT_AC_CAPABILITY_IDS,
  mutationNameForCapability,
} from "../../src/agent/CapsuleCommandMutationMap";
import { listWiringCapabilityIds } from "../../src/agent/CapsuleWiringCapabilityIds";

describe("CapsuleCommandCatalog", () => {
  it("lists every wiring capability with Convex mutation names", () => {
    const catalog = new CapsuleCommandCatalog();
    const listed = catalog.list();
    const listedIds = listed.map((c) => c.capabilityId).sort();
    const wiringIds = [...listWiringCapabilityIds()].sort();

    // Full Manifest surface — AC ids are a minimum proof set, not a ceiling.
    expect(listedIds).toEqual(wiringIds);
    for (const acId of AGENT_AC_CAPABILITY_IDS) {
      expect(listedIds).toContain(acId);
    }

    for (const item of listed) {
      expect(item.mutationName).toBe(
        mutationNameForCapability(item.capabilityId),
      );
      expect(item.route).toContain("/api/manifest/");
      expect(item.command).not.toBe("");
      expect(Array.isArray(item.emits)).toBe(true);
    }
  });

  it("describes Recipe.draft client params", () => {
    const draft = new CapsuleCommandCatalog().get("Recipe.draft");
    expect(draft.mutationName).toBe("Recipe_createViaDraft");
    expect(draft.clientParameterNames).toContain("name");
    expect(draft.clientParameterNames).toContain("yieldQuantity");
  });
});
