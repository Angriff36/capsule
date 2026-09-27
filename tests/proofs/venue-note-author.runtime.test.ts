/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 venue note author): the staff
 * profile a venue note records as its author comes from the sign-in, never
 * from the caller. VenueNote post used to take authorPersonId from the
 * browser, so any event staff member could post a venue note under another
 * person's profile, and that person then saw the pin and remove buttons for
 * it. Now a supplied authorPersonId is refused, the note records the
 * signed-in person, and an account with no staff profile cannot post.
 * Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-venue-note-author";

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

describe("runtime proof: venue notes record the signed-in author (AC-210 / AC-372)", () => {
  it("refuses a supplied author and records who is signed in", async () => {
    const proof = harness();
    const workforce = proof.asRole({
      subject: "venue-note-author-workforce",
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
    const authorPersonId = await hire("Avery", "venue-note-author-linked");
    const otherPersonId = await hire("Blake", "venue-note-author-other");

    const owner = proof.asRole({
      subject: "venue-note-author-owner",
      role: "owner",
      tenantId,
    });
    const venue = (await proof.executeCommand(
      owner,
      api.mutations.Venue_createViaRegister,
      {
        name: "Lakeside Pavilion",
        venueType: "other",
        capacity: 80,
        addressLine1: "1 Shore Road",
      },
    )) as { docId: string };

    const author = proof.asRole({
      subject: "venue-note-author-linked",
      role: "event_manager",
      tenantId,
    });

    // A caller can no longer post under another person's staff profile.
    expect(
      await refused(() =>
        author.mutation(api.mutations.VenueNote_createViaPost, {
          venueId: venue.docId,
          authorPersonId: otherPersonId,
          authorName: "Blake Proof",
          category: "access",
          visibility: "internal",
          content: "Posted as someone else",
        } as never),
      ),
    ).toBe(true);

    // Without it (what the venue notes screen sends), the note records the
    // signed-in person's profile.
    const { docId } = (await author.mutation(
      api.mutations.VenueNote_createViaPost,
      {
        venueId: venue.docId,
        authorName: "Avery Proof",
        category: "access",
        visibility: "internal",
        content: "Load-in is at the back door",
      } as never,
    )) as { docId: string };
    const row = (await author.run(async (ctx) =>
      ctx.db.get(docId as never),
    )) as { authorPersonId: string; authorAuthSubjectId: string | null };
    expect(row.authorPersonId).toBe(authorPersonId);
    expect(row.authorAuthSubjectId).toBe("venue-note-author-linked");

    // An account with no staff profile cannot post a venue note.
    const unlinked = proof.asRole({
      subject: "venue-note-author-unlinked",
      role: "event_manager",
      tenantId,
    });
    expect(
      await refused(() =>
        unlinked.mutation(api.mutations.VenueNote_createViaPost, {
          venueId: venue.docId,
          authorName: "Nobody",
          category: "access",
          visibility: "internal",
          content: "No profile",
        } as never),
      ),
    ).toBe(true);
  });
});
