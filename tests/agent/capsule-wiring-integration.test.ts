import { describe, expect, it } from "vitest";
import { announcementStaffActions } from "../../src/agent/CapsuleStaffActionOffer";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import { CapsuleGeneratedReadCatalog } from "../../src/agent/CapsuleGeneratedReadCatalog";
import { CapsuleStaleReadRefresher } from "../../src/agent/CapsuleStaleReadRefresher";
import { CapsuleWiringDriftCheck } from "../../src/agent/CapsuleWiringDriftCheck";
import { ConvexSiteOrigin } from "../../src/agent/ConvexSiteOrigin";

/**
 * One pass over the landed wiring: commands, reads, refresh, actions, drift.
 * Uses the generated contract. Does not call the network.
 */
describe("generated wiring integration", () => {
  const catalog = new CapsuleCommandCatalog();
  const reads = new CapsuleGeneratedReadCatalog();

  it("covers parameterized, empty, instance, and trusted commands", () => {
    const post = catalog.get("Announcement.post");
    const remove = catalog.get("Announcement.remove");
    const sync = catalog.get("IngredientDemand.syncFromContributions");

    expect(post.clientParameterNames).toEqual([
      "title",
      "body",
      "category",
      "expiresAt",
    ]);
    expect(post.resultKind).toBe("allocation");
    expect(
      post.failures.some((failure) => failure.kind === "constraint_block"),
    ).toBe(true);
    expect(remove.clientParameterNames).toEqual([]);
    expect(remove.requiresDocumentId).toBe(true);
    expect(
      remove.failures.some((failure) => failure.kind === "not_found"),
    ).toBe(true);
    expect(sync.presentation.exposure).toBe("internal");
    expect(sync.clientParameterNames).not.toContain("tenantId");
    expect(
      catalog.offeredToPeople().map((item) => item.capabilityId),
    ).not.toContain("IngredientDemand.syncFromContributions");
    expect(catalog.has("IngredientDemand.syncFromContributions")).toBe(true);
    expect(ConvexSiteOrigin.from("https://example.convex.cloud")).toBe(
      "https://example.convex.site",
    );
  });

  it("reads list, detail, and indexed facts from the generated contract", () => {
    expect(reads.byExportName("listVendorOrder")).toMatchObject({
      kind: "list",
      clientCallable: false,
    });
    expect(
      reads.argumentsFor("getVendorOrder", { id: "vendor-order-1" }),
    ).toEqual({
      id: "vendor-order-1",
    });
    expect(
      reads.argumentsFor("listIngredientDemandByEventId", {
        eventId: "event-1",
        extra: true,
      }),
    ).toEqual({ eventId: "event-1" });
    expect(
      reads.byExportName("listEventDishComponentSeed").clientCallable,
    ).toBe(true);
  });

  it("refreshes the changed dish list and the related prep list after a save", async () => {
    const refetched: string[] = [];
    const refresher = new CapsuleStaleReadRefresher({
      refetch: async (exportName) => {
        refetched.push(exportName);
      },
    });
    const saved = await refresher.afterSuccess("EventDish.addToEvent", {
      eventDishId: "event-dish-1",
    });
    expect(saved).toEqual({ eventDishId: "event-dish-1" });
    expect(refetched).toContain("listEventDish");
    expect(refetched).toContain("listPrepTask");
  });

  it("offers human announcement actions and hides the internal sync", () => {
    const offers = announcementStaffActions();
    expect(offers.forPerson("Announcement.post")?.label).toBe("Post");
    expect(offers.forPerson("Announcement.remove")?.confirm).toBe(false);
    expect(offers.forPerson("IngredientDemand.syncFromContributions")).toBe(
      null,
    );
  });

  it("flags a stale compiler fixture and accepts the pinned contract", () => {
    const check = new CapsuleWiringDriftCheck();
    expect(
      check.contractProblems({
        pinnedCompilerVersion: "3.6.56",
        contractCompilerVersion: "3.6.47",
        copyCompilerVersion: "3.6.47",
        contractContentHash: "same",
        bindingsContractHash: "same",
        capabilityIds: new Set(["Announcement.post"]),
        readExportNames: new Set(["listVendorOrder"]),
        referencedCapabilityIds: ["Announcement.post"],
        referencedReadExports: ["listVendorOrder"],
      })[0],
    ).toMatch(/does not match pin/);
    expect(catalog.get("Announcement.post").capabilityId).toBe(
      "Announcement.post",
    );
  });
});
