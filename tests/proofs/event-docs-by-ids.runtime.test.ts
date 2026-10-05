/**
 * Runtime proof (#430): convex/eventLookup.ts `docsByIds` gives the
 * proposals list the whole record of an event outside its date window, keeps
 * to the caller's company, and leaves out the import draft and contact
 * fields the same way `rangeDocs` does.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-event-docs-by-ids";
const OTHER = "tenant-event-docs-by-ids-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: older linked events by id (#430)", () => {
  it("returns whole records of this company only, without contact fields", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "docs-by-ids-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const { old, theirs } = await owner.run(async (ctx) => ({
      old: await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Gala three years ago",
        eventType: "dinner",
        stage: "completed",
        startsAt: Date.UTC(2023, 5, 1),
        venueName: "Harbor Hall",
        primaryContactName: "Pat Client",
        version: 1,
      }),
      theirs: await ctx.db.insert("events", {
        tenantId: OTHER,
        title: "Other company event",
        eventType: "dinner",
        stage: "planning",
        version: 1,
      }),
    }));

    const rows = (await owner.query(api.eventLookup.docsByIds, {
      ids: [old, theirs, "not-an-id"],
    })) as Doc<"events">[] | null;
    expect(rows!.map((row) => row.title)).toEqual(["Gala three years ago"]);
    expect(rows![0]!.venueName).toBe("Harbor Hall");
    expect(rows![0]!.primaryContactName).toBeNull();
    expect(rows![0]!.importDraftJson).toBeNull();
  }, 60_000);
});
