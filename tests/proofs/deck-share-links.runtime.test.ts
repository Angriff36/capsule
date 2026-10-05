/**
 * PL-DECK-SHARING (AC-253 deck leg, spec §4.6).
 *
 * A presentation deck is a file kept on a client. Its link:
 *   - serves exactly that file (a new upload is a new file and needs a new link)
 *   - records first view, last view and the viewer
 *   - shows nothing when switched off, past its end date, or the file removed
 *   - a "staff" link opens only for signed-in people of the same company
 */
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 2, 12);
const TENANT = "tenant-deck-links";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  vi.useFakeTimers({ toFake: ["Date"], now: START });
});
afterAll(() => {
  vi.useRealTimers();
});

function harness() {
  const anonymous = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => anonymous) as never,
      schema,
      modules,
    }),
    { anonymous },
  );
}
type Proof = ReturnType<typeof harness>;

async function person(
  proof: Proof,
  subject: string,
  tenantId: string,
  givenName: string,
) {
  const actor = proof.asRole({ subject, role: "owner", tenantId });
  await proof.seedEntity(actor, "people", {
    tenantId,
    givenName,
    familyName: "Seller",
    email: `${subject}@example.com`,
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: subject,
    version: 1,
  });
  return actor;
}

describe("runtime proof: presentation deck links", () => {
  it("serves the exact file, tracks views, and stops when switched off, ended or removed", async () => {
    const proof = harness();
    const seller = await person(proof, "deck-owner", TENANT, "Sam");
    const outsider = await person(proof, "deck-outsider", "other-co", "Oz");
    const client = (await proof.executeCommand(
      seller,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Deck client" },
    )) as { docId: string };

    async function upload(fileName: string) {
      const storageId = await proof.anonymous.run((ctx) =>
        ctx.storage.store(new Blob([fileName], { type: "application/pdf" })),
      );
      const file = (await proof.executeCommand(
        seller,
        api.mutations.Attachment_createViaAttach,
        {
          parentType: "client",
          parentId: client.docId,
          fileName,
          contentType: "application/pdf",
          fileSize: fileName.length,
          storageId,
        },
      )) as { docId: string };
      return file.docId;
    }
    async function share(
      attachmentId: string,
      audience: "anyone" | "staff",
      expiresAt?: number,
    ) {
      const link = (await proof.executeCommand(
        seller,
        api.mutations.DeckShareLink_create,
        { attachmentId, audience, ...(expiresAt ? { expiresAt } : {}) },
      )) as { _id?: string; docId?: string };
      return String(link._id ?? link.docId);
    }
    const open = (token: string) =>
      proof.anonymous.query(api.deckShareLinks.getSharedDeck, { token });
    const row = async (token: string) =>
      (await seller.run((ctx) => ctx.db.get(token as never))) as any;

    const spring = await upload("Spring weddings.pdf");
    const token = await share(spring, "anyone");
    const shared = await open(token);
    expect(shared).toMatchObject({
      fileName: "Spring weddings.pdf",
      contentType: "application/pdf",
      audience: "anyone",
    });
    // No end date given: 90 days from when the link was made.
    expect(Math.round(shared!.linkExpiresAt)).toBe(START + 90 * DAY);
    expect(shared?.url).toBeTruthy();

    // A newer deck is a new file: the old link still serves the old one.
    const newer = await upload("Spring weddings v2.pdf");
    expect((await open(token))?.fileName).toBe("Spring weddings.pdf");
    expect((await open(await share(newer, "anyone")))?.fileName).toBe(
      "Spring weddings v2.pdf",
    );

    // First view stays, last view moves, viewer kept.
    await proof.anonymous.mutation(api.deckShareLinks.recordDeckView, {
      token,
      viewerIdentity: "phone",
    });
    vi.setSystemTime(START + DAY);
    await proof.anonymous.mutation(api.deckShareLinks.recordDeckView, {
      token,
    });
    expect(await row(token)).toMatchObject({
      viewCount: 2,
      firstViewedAt: START,
      lastViewedAt: START + DAY,
      lastViewerIdentity: "phone",
    });

    // Switched off: nothing shown, no view counted.
    await proof.executeCommand(seller, api.mutations.DeckShareLink_revoke, {
      docId: token,
    });
    expect(await open(token)).toBeNull();
    await proof.anonymous.mutation(api.deckShareLinks.recordDeckView, {
      token,
    });
    expect((await row(token)).viewCount).toBe(2);

    // End date: works before, nothing after.
    const shortLived = await share(spring, "anyone", START + 3 * DAY);
    expect(await open(shortLived)).not.toBeNull();
    vi.setSystemTime(START + 4 * DAY);
    expect(await open(shortLived)).toBeNull();

    // Staff-only: not for the public, not for another company, yes for ours.
    const internal = await share(spring, "staff");
    expect(await open(internal)).toBeNull();
    expect(
      await outsider.query(api.deckShareLinks.getSharedDeck, {
        token: internal,
      }),
    ).toBeNull();
    expect(
      await seller.query(api.deckShareLinks.getSharedDeck, { token: internal }),
    ).toMatchObject({ fileName: "Spring weddings.pdf", audience: "staff" });
    await seller.mutation(api.deckShareLinks.recordDeckView, {
      token: internal,
      viewerIdentity: "made up",
    });
    expect((await row(internal)).lastViewerIdentity).toBe("Sam Seller");

    // The file removed: every link to it stops.
    const kept = await share(spring, "anyone");
    expect(await open(kept)).not.toBeNull();
    await proof.executeCommand(seller, api.mutations.Attachment_remove, {
      docId: spring,
    });
    expect(await open(kept)).toBeNull();

    // A made-up token shows nothing.
    expect(await open("not-a-real-token")).toBeNull();
  });
});
