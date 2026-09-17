import { describe, expect, it } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import { AGENT_AC_CAPABILITY_IDS } from "../../src/agent/CapsuleCommandMutationMap";
import { listWiringCapabilityIds } from "../../src/agent/CapsuleWiringCapabilityIds";

describe("CapsuleCommandCatalog", () => {
  it("lists the complete wiring capability inventory", () => {
    const catalog = new CapsuleCommandCatalog();
    const listed = catalog.list();
    const listedIds = listed.map((c) => c.capabilityId).sort();
    const wiringIds = [...listWiringCapabilityIds()].sort();

    // Full Manifest surface — AC ids are a minimum proof set, not a ceiling.
    expect(listedIds).toEqual(wiringIds);
    for (const acId of AGENT_AC_CAPABILITY_IDS) {
      expect(listedIds).toContain(acId);
    }
  });

  it("describes Component.draft client params", () => {
    const draft = new CapsuleCommandCatalog().get("Component.draft");
    expect(draft.mutationName).toBe("Component_createViaDraft");
    expect(draft.clientParameterNames).toContain("name");
    expect(draft.clientParameterNames).toContain("yieldQuantity");
  });
});
