/**
 * Runtime proof (PL-DASHBOARDS): the owner's Avg Event Value Growth Strategy
 * tags each deal by how much it can grow with add-ons (high / moderate /
 * standard). Event.setUpsellPotential sets or clears the tag, and the
 * all-events report read (convex/eventLookup.ts reportPage) carries it to the
 * Average Event Value page.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-upsell-potential";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: a deal's add-on potential tag", () => {
  it("sets, changes and clears the tag, and the report read carries it", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "upsell-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const eventId = (await owner.run((ctx) =>
      ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Harbor wedding",
        eventType: "wedding",
        stage: "quote",
        quotedPrice: 12000,
        version: 1,
      }),
    )) as Id<"events">;
    const tag = async () =>
      (await owner.run((ctx) => ctx.db.get(eventId)))?.upsellPotential ?? null;

    await owner.mutation(api.mutations.Event_setUpsellPotential, {
      docId: eventId,
      version: 1,
      potential: "high",
    } as never);
    expect(await tag()).toBe("high");

    const page = (await owner.query(api.eventLookup.reportPage, {
      paginationOpts: { numItems: 10, cursor: null },
    })) as { page: Array<{ _id: string; upsellPotential: string | null }> };
    expect(page.page.find((row) => row._id === eventId)?.upsellPotential).toBe(
      "high",
    );

    await owner.mutation(api.mutations.Event_setUpsellPotential, {
      docId: eventId,
      version: 2,
      potential: "standard",
    } as never);
    expect(await tag()).toBe("standard");

    await owner.mutation(api.mutations.Event_setUpsellPotential, {
      docId: eventId,
      version: 3,
    } as never);
    expect(await tag()).toBeNull();
  });
});
