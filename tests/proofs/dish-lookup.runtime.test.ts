/**
 * Runtime proof (PL-SCALE, AC-172): dishes by id (convex/dishLookup.ts) come
 * one by one, live ones only, never from another company, under the same
 * read rule as the generated dish list. The event page and its tabs read
 * these in place of the company's whole dish list.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-dish-lookup";
const OTHER = "tenant-dish-lookup-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Row = { _id: string; name: string; isActive: boolean; isRetired: boolean };

describe("runtime proof: dishes by id stay in the company (AC-172)", () => {
  it("returns the asked live dishes only, to people who may read dishes", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "dish-lookup-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const driver = proof.asRole({
      subject: "dish-lookup-driver",
      role: "driver",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "dish-lookup-outsider",
      role: "owner",
      tenantId: OTHER,
    });

    const ids = await owner.run(async (ctx) => {
      const dish = async (
        tenantId: string,
        name: string,
        status: "active" | "retired" = "active",
        deleted = false,
      ) =>
        (await ctx.db.insert("dishes", {
          tenantId,
          name,
          portionSize: 1,
          portionUnit: "each",
          status,
          deletedAt: deleted ? 1 : null,
          version: 1,
        })) as Id<"dishes">;
      return {
        salmon: await dish(TENANT, "Salmon"),
        oldSoup: await dish(TENANT, "Old soup", "retired"),
        gone: await dish(TENANT, "Deleted dish", "active", true),
        notAsked: await dish(TENANT, "Not asked for"),
        theirs: await dish(OTHER, "Their dish"),
      };
    });

    const rows = (await owner.query(api.dishLookup.byIds, {
      ids: [ids.salmon, ids.oldSoup, ids.salmon, ids.gone, "not-an-id"],
    })) as Row[];
    expect(rows.map((r) => r.name).sort()).toEqual(["Old soup", "Salmon"]);
    // Same derived fields as the generated dish list.
    const soup = rows.find((r) => r.name === "Old soup")!;
    expect([soup.isActive, soup.isRetired]).toEqual([false, true]);

    // Another company's dish is never returned; ours never reach them.
    expect(
      await owner.query(api.dishLookup.byIds, { ids: [ids.theirs] }),
    ).toEqual([]);
    expect(
      await outsider.query(api.dishLookup.byIds, { ids: [ids.salmon] }),
    ).toEqual([]);
    // A role the dish list hides (driver) gets nothing.
    expect(
      await driver.query(api.dishLookup.byIds, { ids: [ids.salmon] }),
    ).toBeNull();
    expect(await driver.query(api.queries.listDish, {})).toEqual([]);
  });
});
