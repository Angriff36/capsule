/**
 * Runtime proof (#269): undoing a hire is one step
 * (convex/candidateHireRevocation.ts revokeHire). The linked team profile is
 * switched off and the candidate goes back to a working stage with the link
 * cleared. A plain stage move off a hire with a profile is refused, so access
 * cannot be left behind. Terminating a profile is for admins; a workforce
 * manager deactivates.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-hire-revocation";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: revoke a hire in one step (#269)", () => {
  it("switches the profile off and reopens the candidate; a plain move is refused", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "hire-revocation-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const manager = proof.asRole({
      subject: "hire-revocation-manager",
      role: "workforce_manager",
      tenantId: TENANT,
    });
    const hire = async (givenName: string) =>
      (
        (await owner.mutation(api.mutations.Person_createViaHire, {
          givenName,
          familyName: "Hire",
          email: `${givenName.toLowerCase()}.hire@proof.example`,
          role: "event_staff",
          employmentType: "part_time",
        })) as { docId: Id<"people"> }
      ).docId;
    const hiredCandidate = async (fullName: string, personId: Id<"people">) =>
      owner.run((ctx) =>
        ctx.db.insert("candidates", {
          tenantId: TENANT,
          fullName,
          roleAppliedFor: "event_staff",
          stage: "hired",
          appliedAt: Date.UTC(2026, 8, 1),
          hiredPersonId: personId,
          version: 1,
        }),
      ) as Promise<Id<"candidates">>;

    const sam = await hire("Sam");
    const samCandidate = await hiredCandidate("Sam Hire", sam);

    // A plain stage move would leave Sam's profile live: refused.
    await expect(
      manager.mutation(api.mutations.Candidate_advance, {
        docId: samCandidate,
        toStage: "decision",
        version: 1,
      }),
    ).rejects.toThrow(/Use Revoke hire/);

    // A workforce manager may not terminate, only deactivate.
    await expect(
      manager.mutation(api.candidateHireRevocation.revokeHire, {
        candidateId: samCandidate,
        toStage: "decision",
        profileAction: "terminate",
      }),
    ).rejects.toThrow(/Only an admin can terminate/);

    const result = await manager.mutation(
      api.candidateHireRevocation.revokeHire,
      { candidateId: samCandidate, toStage: "decision" },
    );
    expect(result).toEqual({ toStage: "decision", profile: "deactivated" });
    const [candidate, person] = await owner.run(async (ctx) => [
      await ctx.db.get(samCandidate),
      await ctx.db.get(sam),
    ]);
    expect(candidate).toMatchObject({ stage: "decision" });
    expect(candidate!.hiredPersonId ?? null).toBeNull();
    expect(String(person!.status)).toBe("inactive");

    // An admin can end the profile for good in the same step.
    const lee = await hire("Lee");
    const leeCandidate = await hiredCandidate("Lee Hire", lee);
    const ended = await owner.mutation(api.candidateHireRevocation.revokeHire, {
      candidateId: leeCandidate,
      toStage: "screening",
      profileAction: "terminate",
      reason: "Hired by mistake",
    });
    expect(ended).toMatchObject({ profile: "terminated" });
    const leePerson = await owner.run((ctx) => ctx.db.get(lee));
    expect(String(leePerson!.status)).toBe("terminated");
  }, 60_000);
});
