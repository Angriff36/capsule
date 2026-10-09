/**
 * Runtime proof: follow-ups on a sent proposal with no answer (the owner's
 * May 2026 sales audit: day 3 note, day 10 check-in, day 21 "close the file").
 *
 * - A sent proposal records the follow-up step done, when, and who.
 * - A step outside 1-3 is refused; a draft or an accepted proposal takes none.
 */
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-proposal-follow-up";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
});

async function setup() {
  const t = convexTest(schema, modules);
  const sales = t.withIdentity({
    subject: "sales-follow-up",
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

describe("proposal follow-ups", () => {
  it("records each follow-up on a sent proposal, refuses a wrong step, a draft and an answered proposal", async () => {
    const { t, sales, draft } = await setup();
    const sentId = await draft("Spring supper");
    await sales.mutation(
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: sentId },
    );

    await sales.mutation(api.mutations.Proposal_recordFollowUp, {
      docId: sentId,
      step: 1,
    });
    await sales.mutation(api.mutations.Proposal_markViewed, { docId: sentId });
    await sales.mutation(api.mutations.Proposal_recordFollowUp, {
      docId: sentId,
      step: 2,
    });
    const sent = await t.run((ctx) => ctx.db.get(sentId));
    expect(sent).toMatchObject({
      status: "viewed",
      followUpStep: 2,
      followUpById: "sales-follow-up",
    });
    expect(typeof sent?.followUpAt).toBe("number");

    await expect(
      sales.mutation(api.mutations.Proposal_recordFollowUp, {
        docId: sentId,
        step: 4,
      }),
    ).rejects.toThrow();

    const draftId = await draft("Fall supper");
    await expect(
      sales.mutation(api.mutations.Proposal_recordFollowUp, {
        docId: draftId,
        step: 1,
      }),
    ).rejects.toThrow();

    await sales.mutation(api.mutations.Proposal_accept, { docId: sentId });
    await expect(
      sales.mutation(api.mutations.Proposal_recordFollowUp, {
        docId: sentId,
        step: 3,
      }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(sentId)))?.followUpStep).toBe(2);
  });
});
