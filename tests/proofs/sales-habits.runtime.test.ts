/**
 * Runtime proof: the sales habits the owner's May 2026 sales audit tracks.
 *
 * - A lead records its first reply once, with who and when; a second reply
 *   does not move the first reply time.
 * - A proposal records the client's price pushback on a sent, opened or
 *   declined proposal, once; a draft takes none.
 */
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-sales-habits";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
});

async function setup() {
  const t = convexTest(schema, modules);
  const sales = t.withIdentity({
    subject: "sales-habits",
    org_id: TENANT,
    role: "admin",
  });
  const client = (await sales.mutation(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: "Garden Club",
    email: "events@garden.example",
  })) as { docId: string };
  const draft = async (title: string) =>
    (
      (await sales.mutation(api.mutations.Proposal_createViaDraft, {
        clientId: client.docId,
        title,
        subtotal: 1200,
        taxAmount: 100,
        discountAmount: 0,
        total: 1300,
      })) as { docId: string }
    ).docId as Id<"proposals">;
  return { t, sales, draft };
}

describe("sales habits", () => {
  it("records a lead's first reply once", async () => {
    const { t, sales } = await setup();
    const lead = (await sales.mutation(api.mutations.Lead_createViaCapture, {
      leadType: "person",
      source: "Website",
      estimatedValue: 2500,
      givenName: "Rosa",
      familyName: "Diaz",
    } as never)) as { docId: string };
    const leadId = lead.docId as Id<"leads">;
    const version = async () =>
      (await t.run((ctx) => ctx.db.get(leadId)))?.version;

    await sales.mutation(api.mutations.Lead_recordFirstReply, {
      docId: leadId,
      version: await version(),
    } as never);
    const replied = await t.run((ctx) => ctx.db.get(leadId));
    expect(replied).toMatchObject({ firstRepliedById: "sales-habits" });
    expect(typeof replied?.firstRepliedAt).toBe("number");

    await expect(
      sales.mutation(api.mutations.Lead_recordFirstReply, {
        docId: leadId,
        version: await version(),
      } as never),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(leadId)))?.firstRepliedAt).toBe(
      replied?.firstRepliedAt,
    );
  });

  it("records price pushback on a sent or declined proposal once, never on a draft", async () => {
    const { t, sales, draft } = await setup();
    const send = (docId: Id<"proposals">) =>
      sales.mutation(api.lib.proposalRevision.sendProposalWithRevisionCapture, {
        docId,
      });

    const sentId = await draft("Spring supper");
    await send(sentId);
    await sales.mutation(api.mutations.Proposal_recordPriceObjection, {
      docId: sentId,
    });
    const sent = await t.run((ctx) => ctx.db.get(sentId));
    expect(sent).toMatchObject({ priceObjectionById: "sales-habits" });
    expect(typeof sent?.priceObjectionAt).toBe("number");
    await expect(
      sales.mutation(api.mutations.Proposal_recordPriceObjection, {
        docId: sentId,
      }),
    ).rejects.toThrow();

    const declinedId = await draft("Fall supper");
    await send(declinedId);
    await sales.mutation(api.mutations.Proposal_decline, {
      docId: declinedId,
      reason: "Went with a cheaper caterer",
    });
    await sales.mutation(api.mutations.Proposal_recordPriceObjection, {
      docId: declinedId,
    });
    expect(
      typeof (await t.run((ctx) => ctx.db.get(declinedId)))?.priceObjectionAt,
    ).toBe("number");

    const draftId = await draft("Winter supper");
    await expect(
      sales.mutation(api.mutations.Proposal_recordPriceObjection, {
        docId: draftId,
      }),
    ).rejects.toThrow();
  });
});
