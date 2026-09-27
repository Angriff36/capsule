/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 prep task comment author): the
 * staff profile a prep task comment records as its author comes from the
 * sign-in, never from the caller. PrepTaskComment post used to take an
 * optional authorPersonId from the browser, so any kitchen staff member could
 * post a blocker or note under another person's profile. Now a supplied
 * authorPersonId is refused, the comment records the signed-in person, and
 * an account with no staff profile cannot post. Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-prep-comment-author";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("runtime proof: prep task comments record the signed-in author (AC-210 / AC-372)", () => {
  it("refuses a supplied author and records who is signed in", async () => {
    const proof = harness();
    const workforce = proof.asRole({
      subject: "prep-comment-author-workforce",
      role: "workforce_manager",
      tenantId,
    });
    const hire = async (givenName: string, authSubjectId: string) => {
      const hired = (await proof.executeCommand(
        workforce,
        api.mutations.Person_createViaHire,
        {
          givenName,
          familyName: "Proof",
          email: `${authSubjectId}@proof.example`,
          role: "event_manager",
          employmentType: "full_time",
          authSubjectId,
        },
      )) as { docId: string };
      return hired.docId;
    };
    const authorPersonId = await hire("Avery", "prep-comment-author-linked");
    const otherPersonId = await hire("Blake", "prep-comment-author-other");

    const author = proof.asRole({
      subject: "prep-comment-author-linked",
      role: "event_manager",
      tenantId,
    });
    // The comment points at a real prep task on a real event.
    const task = await author.run(async (ctx) => {
      const clientId = await ctx.db.insert("clients", {
        tenantId,
        clientType: "company",
        companyName: "Prep Comment Proof Co",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
        version: 0,
      });
      const eventId = await ctx.db.insert("events", {
        tenantId,
        clientId,
        title: "Prep comment proof dinner",
        eventType: "proof",
        expectedHeadcount: 10,
        budgetAmount: 1000,
        quotedPrice: 1200,
        stage: "approved",
        version: 0,
      });
      const dishId = await ctx.db.insert("dishes", {
        tenantId,
        name: "Prep Comment Proof Dish",
        portionSize: 1,
        portionUnit: "portion",
        dietaryTags: [],
        status: "active",
        version: 0,
      });
      const eventDishId = await ctx.db.insert("eventDishes", {
        tenantId,
        eventId,
        dishId,
        quantityServings: 10,
        version: 0,
      });
      const prepTaskId = await ctx.db.insert("prepTasks", {
        tenantId,
        eventDishId,
        eventId,
        dishId,
        name: "Dice shallots",
        category: "mise",
        taskType: "prep",
        isGenerated: false,
        quantity: 1,
        unit: "each",
        status: "pending",
        version: 0,
      });
      return { prepTaskId, eventId };
    });

    // A caller can no longer post under another person's staff profile.
    expect(
      await refused(() =>
        author.mutation(api.mutations.PrepTaskComment_createViaPost, {
          ...task,
          body: "Posted as someone else",
          category: "blocker",
          authorPersonId: otherPersonId,
          authorName: "Blake Proof",
        } as never),
      ),
    ).toBe(true);

    // Without it (what the prep thread screen sends), the comment records the
    // signed-in person's profile, on the row and on the posted entry.
    const { docId } = (await author.mutation(
      api.mutations.PrepTaskComment_createViaPost,
      {
        ...task,
        body: "Out of shallots, using red onion",
        category: "substitution",
        authorName: "Avery Proof",
      } as never,
    )) as { docId: string };
    const row = (await author.run(async (ctx) =>
      ctx.db.get(docId as never),
    )) as { authorPersonId: string; authorAuthSubjectId: string };
    expect(row.authorPersonId).toBe(authorPersonId);
    expect(row.authorAuthSubjectId).toBe("prep-comment-author-linked");
    const posted = (await author.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (e) => e.type === "PrepTaskCommentPosted",
      ),
    )) as Array<{ payload: { authorPersonId: string } }>;
    expect(posted.map((e) => e.payload.authorPersonId)).toEqual([
      authorPersonId,
    ]);

    // An account with no staff profile cannot post a prep task comment.
    const unlinked = proof.asRole({
      subject: "prep-comment-author-unlinked",
      role: "event_manager",
      tenantId,
    });
    expect(
      await refused(() =>
        unlinked.mutation(api.mutations.PrepTaskComment_createViaPost, {
          ...task,
          body: "No profile",
          authorName: "Nobody",
        } as never),
      ),
    ).toBe(true);
  });
});
