/**
 * Governed writes for people, sign-in linking and hiring: every write these
 * seams make goes through a generated Manifest command, so the command emits
 * the event (and runs __handleManifestEvent) — never a hand-written row.
 *
 * Seams covered: convex/personEmployeeNumber.ts, convex/authProvision.ts,
 * convex/authLink.ts, convex/candidateToTeam.ts, convex/hiringPipeline.ts.
 *
 * Each block proves: the command path runs, the event comes from it,
 * authorization is unchanged (allowed caller succeeds, refused caller is
 * refused), and retries are idempotent.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

function harness() {
  const root = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => root) as never,
      schema,
      modules,
    }),
    { raw: root },
  );
}

type Proof = ReturnType<typeof harness>;

function actor(proof: Proof, role: string, tenantId = "tenant-a") {
  return proof.asRole({
    subject: `${role}-${tenantId}`,
    role,
    tenantId,
  });
}

async function hire(
  proof: Proof,
  tenantId: string,
  person: { givenName: string; email: string; role?: string },
): Promise<string> {
  const manager = actor(proof, "workforce_manager", tenantId);
  const result = (await manager.mutation(api.mutations.Person_createViaHire, {
    givenName: person.givenName,
    familyName: "Tester",
    email: person.email,
    role: person.role ?? "staff",
  })) as { docId: string };
  return result.docId;
}

async function events(proof: Proof, type: string) {
  return proof.raw.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === type,
    ),
  );
}

async function person(proof: Proof, id: string) {
  return proof.raw.run(async (ctx) => ctx.db.get(id as Id<"people">));
}

describe("personEmployeeNumber.setEmployeeNumber → Person_setEmployeeNumber", () => {
  it("finance and workforce managers set it; the command emits the event", async () => {
    const proof = harness();
    const personId = await hire(proof, "tenant-a", {
      givenName: "Ada",
      email: "ada@example.invalid",
    });
    await actor(proof, "finance_manager").mutation(
      api.personEmployeeNumber.setEmployeeNumber,
      { docId: personId, employeeNumber: " EMP-1 " },
    );
    expect((await person(proof, personId))?.employeeNumber).toBe("EMP-1");
    await actor(proof, "workforce_manager").mutation(
      api.personEmployeeNumber.setEmployeeNumber,
      { docId: personId, employeeNumber: "EMP-2" },
    );
    expect((await person(proof, personId))?.employeeNumber).toBe("EMP-2");
    const emitted = await events(proof, "PersonEmployeeNumberSet");
    expect(emitted.map((row) => row.payload.employeeNumber)).toEqual([
      "EMP-1",
      "EMP-2",
    ]);
    expect(emitted[0]?.payload).toEqual({
      personId,
      tenantId: "tenant-a",
      employeeNumber: "EMP-1",
    });
  });

  it("other roles and other tenants are refused", async () => {
    const proof = harness();
    const personId = await hire(proof, "tenant-a", {
      givenName: "Bo",
      email: "bo@example.invalid",
    });
    for (const role of ["staff", "sales_manager", "finance_staff", "manager"]) {
      await expect(
        actor(proof, role).mutation(
          api.personEmployeeNumber.setEmployeeNumber,
          { docId: personId, employeeNumber: "X" },
        ),
      ).rejects.toThrow(/cannot set an employee number/);
    }
    await expect(
      actor(proof, "finance_manager", "tenant-b").mutation(
        api.personEmployeeNumber.setEmployeeNumber,
        { docId: personId, employeeNumber: "X" },
      ),
    ).rejects.toThrow(/Person not found/);
    // Finance managers still cannot run the generated command directly.
    await expect(
      actor(proof, "finance_manager").mutation(
        api.mutations.Person_setEmployeeNumber,
        { docId: personId, employeeNumber: "X" },
      ),
    ).rejects.toThrow(/Workforce managers may update people/);
    expect(await events(proof, "PersonEmployeeNumberSet")).toHaveLength(0);
  });
});

describe("authProvision.linkProvisionedSubject → Person_linkAccount", () => {
  it("links with the caller's auth, emits once, and a retry is a no-op", async () => {
    const proof = harness();
    const personId = await hire(proof, "tenant-a", {
      givenName: "Cy",
      email: "cy@example.invalid",
    });
    const manager = actor(proof, "workforce_manager");
    const args = { personId, authSubjectId: "clerk-cy" };
    await manager.mutation(internal.authProvision.linkProvisionedSubject, args);
    await manager.mutation(internal.authProvision.linkProvisionedSubject, args);
    expect((await person(proof, personId))?.authSubjectId).toBe("clerk-cy");
    const emitted = await events(proof, "PersonAccountLinked");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.payload).toEqual({
      personId,
      tenantId: "tenant-a",
      authSubjectId: "clerk-cy",
    });
    await expect(
      manager.mutation(internal.authProvision.linkProvisionedSubject, {
        personId,
        authSubjectId: "clerk-other",
      }),
    ).rejects.toThrow(/already has a different sign-in/);
  });

  it("keeps the subject-uniqueness, tenant and role checks", async () => {
    const proof = harness();
    const first = await hire(proof, "tenant-a", {
      givenName: "Di",
      email: "di@example.invalid",
    });
    const second = await hire(proof, "tenant-a", {
      givenName: "Ed",
      email: "ed@example.invalid",
    });
    const manager = actor(proof, "workforce_manager");
    await manager.mutation(internal.authProvision.linkProvisionedSubject, {
      personId: first,
      authSubjectId: "clerk-shared",
    });
    await expect(
      manager.mutation(internal.authProvision.linkProvisionedSubject, {
        personId: second,
        authSubjectId: "clerk-shared",
      }),
    ).rejects.toThrow(/already used by another team member/);
    await expect(
      actor(proof, "workforce_manager", "tenant-b").mutation(
        internal.authProvision.linkProvisionedSubject,
        { personId: second, authSubjectId: "clerk-ed" },
      ),
    ).rejects.toThrow(/Team member not found/);
    await expect(
      actor(proof, "sales_manager").mutation(
        internal.authProvision.linkProvisionedSubject,
        { personId: second, authSubjectId: "clerk-ed" },
      ),
    ).rejects.toThrow(/Only a manager can send a sign-in/);
    expect((await person(proof, second))?.authSubjectId).toBeUndefined();
  });

  it("an admin profile still needs an admin caller (the action's rule)", async () => {
    const proof = harness();
    const adminId = await hire(proof, "tenant-a", {
      givenName: "Flo",
      email: "flo@example.invalid",
      role: "admin",
    });
    await expect(
      actor(proof, "workforce_manager").mutation(
        internal.authProvision.linkProvisionedSubject,
        { personId: adminId, authSubjectId: "clerk-flo" },
      ),
    ).rejects.toThrow();
    await actor(proof, "admin").mutation(
      internal.authProvision.linkProvisionedSubject,
      { personId: adminId, authSubjectId: "clerk-flo" },
    );
    expect((await person(proof, adminId))?.authSubjectId).toBe("clerk-flo");
  });
});

describe("authLink.createAccountProfile → Person_linkAccount / Person_createViaHire", () => {
  it("creates the bootstrap profile through the hire command, empty last name included", async () => {
    const proof = harness();
    const member = proof.asRole({
      subject: "account-a",
      role: "org:admin",
      tenantId: "tenant-a",
    });
    const profile = {
      email: "new@example.invalid",
      givenName: "Angriff",
      familyName: "",
    };
    expect(
      await member.mutation(internal.authLink.createAccountProfile, profile),
    ).toEqual({ linked: true, reason: "matched" });
    expect(
      await member.mutation(internal.authLink.createAccountProfile, profile),
    ).toEqual({ linked: true, reason: "already" });
    const rows = await proof.raw.run(async (ctx) =>
      ctx.db.query("people").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: "tenant-a",
      authSubjectId: "account-a",
      givenName: "Angriff",
      familyName: "",
      role: "admin",
      status: "active",
      employmentType: "full_time",
    });
    // Encrypted at rest by the generated command.
    expect(String(rows[0]?.email)).not.toContain("new@example.invalid");
    const hired = await events(proof, "PersonHired");
    expect(hired).toHaveLength(1);
    expect(hired[0]?.payload.personId).toBe(rows[0]?._id);
  });

  it("links a manager-created hire with the same email, keeping its role", async () => {
    const proof = harness();
    const hiredId = await hire(proof, "tenant-a", {
      givenName: "Gil",
      email: "gil@example.invalid",
      role: "kitchen_manager",
    });
    const member = proof.asRole({
      subject: "account-gil",
      role: "org:member",
      tenantId: "tenant-a",
    });
    expect(
      await member.mutation(internal.authLink.createAccountProfile, {
        email: "gil@example.invalid",
        givenName: "Gil",
        familyName: "Tester",
      }),
    ).toEqual({ linked: true, reason: "matched" });
    expect(await person(proof, hiredId)).toMatchObject({
      authSubjectId: "account-gil",
      role: "kitchen_manager",
    });
    const linked = await events(proof, "PersonAccountLinked");
    expect(linked.map((row) => row.payload.personId)).toEqual([hiredId]);
  });

  it("anonymous callers are refused and the last-name escape stays system-only", async () => {
    const proof = harness();
    expect(
      await proof.raw.mutation(internal.authLink.createAccountProfile, {
        email: "anon@example.invalid",
        givenName: "Anon",
        familyName: "",
      }),
    ).toEqual({ linked: false, reason: "unauthenticated" });
    await expect(
      actor(proof, "admin").mutation(api.mutations.Person_createViaHire, {
        givenName: "No",
        familyName: " ",
        email: "no@example.invalid",
        authSubjectId: "account-no",
      }),
    ).rejects.toThrow(/Give this person a last name/);
    expect(
      await proof.raw.run(async (ctx) => ctx.db.query("people").collect()),
    ).toHaveLength(0);
  });
});

describe("authLink.linkBySubjectEmail → Person_clearAccountLink + Person_linkAccount", () => {
  it("clears the stale link on a removed row in another tenant, then links", async () => {
    const proof = harness();
    const stale = await proof.raw.run(async (ctx) =>
      ctx.db.insert("people", {
        tenantId: "tenant-old",
        givenName: "Hal",
        familyName: "Former",
        email: "hal-old@example.invalid",
        role: "staff",
        status: "terminated",
        employmentType: "full_time",
        deletedAt: 1,
        version: 4,
        authSubjectId: "account-hal",
      }),
    );
    const fresh = await hire(proof, "tenant-new", {
      givenName: "Hal",
      email: "hal@example.invalid",
    });
    const args = {
      subject: "account-hal",
      email: "hal@example.invalid",
      tenantId: "tenant-new",
    };
    expect(
      await proof.raw.mutation(internal.authLink.linkBySubjectEmail, args),
    ).toEqual({ linked: true, reason: "matched" });
    expect((await person(proof, stale))?.authSubjectId).toBeNull();
    expect((await person(proof, fresh))?.authSubjectId).toBe("account-hal");
    expect(
      (await events(proof, "PersonAccountUnlinked")).map((row) => row.payload),
    ).toEqual([{ personId: stale, tenantId: "tenant-old" }]);
    expect(
      (await events(proof, "PersonAccountLinked")).map((row) => row.payload),
    ).toEqual([
      { personId: fresh, tenantId: "tenant-new", authSubjectId: "account-hal" },
    ]);
    // Retry: already linked, nothing new written.
    expect(
      await proof.raw.mutation(internal.authLink.linkBySubjectEmail, args),
    ).toEqual({ linked: true, reason: "already" });
    expect(await events(proof, "PersonAccountLinked")).toHaveLength(1);
  });

  it("clearAccountLink keeps unlinkAccount's authority rules", async () => {
    const proof = harness();
    const adminId = await hire(proof, "tenant-a", {
      givenName: "Ivy",
      email: "ivy@example.invalid",
      role: "admin",
    });
    await actor(proof, "admin").mutation(api.mutations.Person_linkAccount, {
      docId: adminId,
      authSubjectId: "account-ivy",
    });
    await expect(
      actor(proof, "staff").mutation(api.mutations.Person_clearAccountLink, {
        docId: adminId,
      }),
    ).rejects.toThrow(/Workforce managers may update people/);
    await expect(
      actor(proof, "workforce_manager").mutation(
        api.mutations.Person_clearAccountLink,
        { docId: adminId },
      ),
    ).rejects.toThrow();
    expect((await person(proof, adminId))?.authSubjectId).toBe("account-ivy");
  });
});

describe("candidateToTeam.hireIntoTeam → Candidate_linkHiredPerson", () => {
  async function hiredWithoutProfile(proof: Proof) {
    const manager = actor(proof, "workforce_manager");
    const created = (await manager.mutation(
      api.mutations.Candidate_createViaApply,
      { fullName: "Jo Cook", email: "jo@example.invalid" },
    )) as { docId: string };
    await manager.mutation(api.mutations.Candidate_hire, {
      docId: created.docId,
    });
    return created.docId;
  }

  it("links the profile on an already-hired candidate through the command", async () => {
    const proof = harness();
    const candidateId = await hiredWithoutProfile(proof);
    const manager = actor(proof, "workforce_manager");
    const result = (await manager.mutation(api.candidateToTeam.hireIntoTeam, {
      candidateId,
    })) as { kind: string; personId: string };
    expect(result.kind).toBe("hired");
    const candidate = await proof.raw.run(async (ctx) =>
      ctx.db.get(candidateId as never),
    );
    expect(candidate).toMatchObject({
      stage: "hired",
      hiredPersonId: result.personId,
    });
    expect(
      (await events(proof, "CandidateHiredPersonLinked")).map(
        (row) => row.payload,
      ),
    ).toEqual([
      {
        candidateId,
        tenantId: "tenant-a",
        hiredPersonId: result.personId,
      },
    ]);
    // Retry resumes from the link; nothing new is written.
    const again = (await manager.mutation(api.candidateToTeam.hireIntoTeam, {
      candidateId,
    })) as { kind: string; personId: string };
    expect(again.personId).toBe(result.personId);
    expect(await events(proof, "CandidateHiredPersonLinked")).toHaveLength(1);
  });

  it("non-workforce callers are refused; the command refuses unhired candidates", async () => {
    const proof = harness();
    const candidateId = await hiredWithoutProfile(proof);
    await expect(
      actor(proof, "manager").mutation(api.candidateToTeam.hireIntoTeam, {
        candidateId,
      }),
    ).rejects.toThrow(/Only a workforce manager/);
    const manager = actor(proof, "workforce_manager");
    const open = (await manager.mutation(
      api.mutations.Candidate_createViaApply,
      { fullName: "Kim Open" },
    )) as { docId: string };
    const personId = await hire(proof, "tenant-a", {
      givenName: "Kim",
      email: "kim@example.invalid",
    });
    await expect(
      manager.mutation(api.mutations.Candidate_linkHiredPerson, {
        docId: open.docId,
        hiredPersonId: personId,
      }),
    ).rejects.toThrow();
    await expect(
      actor(proof, "manager").mutation(
        api.mutations.Candidate_linkHiredPerson,
        {
          docId: candidateId,
          hiredPersonId: personId,
        },
      ),
    ).rejects.toThrow(/Workforce managers may/);
  });
});

describe("hiringPipeline.ingestKmCandidates → refreshFromSource commands", () => {
  const exportV1 = JSON.stringify({
    Candidates: [
      {
        CandidateId: "km-1",
        FullName: "Lee Line",
        Email: "lee@example.invalid",
        Phone: "555-0100",
        Role: "line cook",
        Stage: "screening",
        Interviews: [
          {
            InterviewId: "iv-1",
            ScheduledAt: "2026-10-01T15:00:00Z",
            Notes: "first call",
            Outcome: "pending",
          },
        ],
      },
    ],
  });
  const exportV2 = JSON.stringify({
    Candidates: [
      {
        CandidateId: "km-1",
        FullName: "Lee Linecook",
        Role: "line cook",
        Stage: "screening",
        Interviews: [{ InterviewId: "iv-1", Outcome: "passed" }],
      },
    ],
  });

  it("re-import refreshes through the commands and keeps unsent contact data", async () => {
    const proof = harness();
    const manager = actor(proof, "workforce_manager");
    expect(
      await manager.mutation(api.hiringPipeline.ingestKmCandidates, {
        json: exportV1,
      }),
    ).toEqual({
      created: 1,
      updated: 0,
      interviewsCreated: 1,
      interviewsUpdated: 0,
    });
    for (let run = 0; run < 2; run += 1) {
      expect(
        await manager.mutation(api.hiringPipeline.ingestKmCandidates, {
          json: exportV2,
        }),
      ).toEqual({
        created: 0,
        updated: 1,
        interviewsCreated: 0,
        interviewsUpdated: 1,
      });
    }
    const [candidates, interviews] = await proof.raw.run(async (ctx) => [
      await ctx.db.query("candidates").collect(),
      await ctx.db.query("interviews").collect(),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fullName: "Lee Linecook",
      email: "lee@example.invalid",
      phone: "555-0100",
      stage: "screening",
    });
    expect(interviews).toHaveLength(1);
    // No ScheduledAt in the re-import: the stored schedule is kept.
    expect(interviews[0]).toMatchObject({
      outcome: "passed",
      scheduledFor: Date.parse("2026-10-01T15:00:00Z"),
    });
    expect(interviews[0]?.rawSourceData).toContain('"Outcome":"passed"');
    expect(
      (await events(proof, "CandidateSourceRefreshed")).map(
        (row) => row.payload,
      ),
    ).toEqual(
      Array(2).fill({
        candidateId: candidates[0]?._id,
        tenantId: "tenant-a",
        sourceSystem: "km_interview",
        externalCandidateId: "km-1",
      }),
    );
    expect(await events(proof, "InterviewSourceRefreshed")).toHaveLength(2);
    expect(await events(proof, "InterviewOutcomeRecorded")).toHaveLength(1);
  });

  it("callers without workforceManageAccess are refused", async () => {
    const proof = harness();
    await actor(proof, "workforce_manager").mutation(
      api.hiringPipeline.ingestKmCandidates,
      { json: exportV1 },
    );
    await expect(
      actor(proof, "manager").mutation(api.hiringPipeline.ingestKmCandidates, {
        json: exportV2,
      }),
    ).rejects.toThrow(/Not authorized/);
    const [candidate] = await proof.raw.run(async (ctx) =>
      ctx.db.query("candidates").collect(),
    );
    await expect(
      actor(proof, "manager").mutation(
        api.mutations.Candidate_refreshFromSource,
        {
          docId: candidate!._id,
          fullName: "X",
          roleAppliedFor: "staff",
          rawSourceData: "{}",
        },
      ),
    ).rejects.toThrow(/Workforce managers may/);
    expect(await events(proof, "CandidateSourceRefreshed")).toHaveLength(0);
  });
});
