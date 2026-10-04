/**
 * Runtime proof (review of batch-20261004, reason 1): the staffing agency box
 * offers the company's vendors to the people who keep the roster. The
 * generated vendor list hides vendors from a workforce manager, so the box
 * reads convex/vendorNames.ts: active vendor names only, own company only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-vendor-names";
const OTHER = "tenant-vendor-names-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: roster editors see vendor names", () => {
  it("gives active vendor names to a workforce manager, nothing more", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (subject: string, role: string, tenantId = TENANT) =>
      proof.asRole({ subject, role, tenantId });
    const workforce = as("vendor-names-workforce", "workforce_manager");
    const kitchen = as("vendor-names-kitchen", "kitchen_staff");
    const outsider = as("vendor-names-outsider", "owner", OTHER);

    await workforce.run(async (ctx) => {
      const vendor = async (
        tenantId: string,
        name: string,
        status: "active" | "suspended" | "terminated" = "active",
        deleted = false,
      ) =>
        ctx.db.insert("vendors", {
          tenantId,
          name,
          paymentTermsDays: 30,
          status,
          deletedAt: deleted ? 1 : null,
          version: 1,
        });
      await vendor(TENANT, "Party Pros Staffing");
      await vendor(TENANT, "Elite Staffing");
      await vendor(TENANT, "On hold", "suspended");
      await vendor(TENANT, "Gone", "terminated", true);
      await vendor(OTHER, "Their Agency");
    });

    // The generated list hides vendors from this role; the names read does not.
    expect(await workforce.query(api.queries.listVendor, {})).toEqual([]);
    expect(await workforce.query(api.vendorNames.active, {})).toEqual([
      "Elite Staffing",
      "Party Pros Staffing",
    ]);
    expect(await outsider.query(api.vendorNames.active, {})).toEqual([
      "Their Agency",
    ]);
    expect(await kitchen.query(api.vendorNames.active, {})).toEqual([]);
  });
});
