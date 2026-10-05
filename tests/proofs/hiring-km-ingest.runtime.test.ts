/**
 * AC-328 (CF-9.3 hiring pipeline): the KM interview-tool export maps into
 * candidates and interviews, keeping the KM ids and the raw answers, with
 * stages from application to hired/rejected. Importing the same export again
 * updates the same records and creates no duplicate candidate or interview.
 * Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-km-ingest";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const stages = [
  ["km-1", "Applied", "application"],
  ["km-2", "Phone screen", "screening"],
  ["km-3", "Onsite interview", "interview"],
  ["km-4", "Offer decision", "decision"],
  ["km-5", "Hired", "hired"],
  ["km-6", "Rejected", "rejected"],
] as const;

function payload(note: string) {
  return JSON.stringify({
    candidates: stages.map(([id, stage], index) => ({
      CandidateId: id,
      FullName: `Candidate ${index + 1}`,
      Email: `${id}@km.test`,
      Role: "cook",
      Stage: stage,
      Answers: { whyUs: `answer ${index + 1}`, note },
      Interviews: [
        {
          InterviewId: `${id}-int-1`,
          Interviewer: "Chef",
          Outcome: index === 5 ? "Failed" : "Pending",
          Notes: `first talk ${note}`,
        },
      ],
    })),
  });
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId,
      givenName: "Hana",
      familyName: "Proof",
      email: "hana@km.test",
      role: "workforce_manager",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
      authSubjectId: "km-hr",
    } as never);
  });
  return t.withIdentity({
    subject: "km-hr",
    tokenIdentifier: "proof|km-hr",
    tenantId,
  });
}

async function rows(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({
    candidates: (await ctx.db.query("candidates").collect()).filter(
      (row) => row.tenantId === tenantId,
    ),
    interviews: (await ctx.db.query("interviews").collect()).filter(
      (row) => row.tenantId === tenantId,
    ),
  }));
}

describe("AC-328 KM hiring import", () => {
  it("re-importing the same KM payload updates in place and creates no duplicate candidate or interview", async () => {
    const t = convexTest(schema, modules);
    const hr = await seed(t);

    const first = await hr.mutation(api.hiringPipeline.ingestKmCandidates, {
      json: payload("v1"),
    });
    expect(first).toEqual({
      created: 6,
      updated: 0,
      interviewsCreated: 6,
      interviewsUpdated: 0,
    });
    const once = await rows(t);
    expect(once.candidates).toHaveLength(6);
    expect(once.interviews).toHaveLength(6);
    const byExternal = new Map(
      once.candidates.map((row) => [row.externalCandidateId, row]),
    );
    for (const [id, , stage] of stages) {
      const row = byExternal.get(id);
      expect(row).toMatchObject({ sourceSystem: "km_interview", stage });
      expect(JSON.parse(String(row?.rawSourceData))).toMatchObject({
        CandidateId: id,
        Answers: { note: "v1" },
      });
    }
    expect(
      once.interviews.map((row) => row.externalInterviewId).sort(),
    ).toEqual(stages.map(([id]) => `${id}-int-1`).sort());

    const again = await hr.mutation(api.hiringPipeline.ingestKmCandidates, {
      json: payload("v2"),
    });
    expect(again).toEqual({
      created: 0,
      updated: 6,
      interviewsCreated: 0,
      interviewsUpdated: 6,
    });
    const twice = await rows(t);
    expect(twice.candidates.map((row) => row._id).sort()).toEqual(
      once.candidates.map((row) => row._id).sort(),
    );
    expect(twice.interviews.map((row) => row._id).sort()).toEqual(
      once.interviews.map((row) => row._id).sort(),
    );
    for (const row of twice.candidates) {
      expect(JSON.parse(String(row.rawSourceData))).toMatchObject({
        Answers: { note: "v2" },
      });
    }
    for (const row of twice.interviews) {
      expect(JSON.parse(String(row.rawSourceData))).toMatchObject({
        Notes: expect.stringContaining("v2"),
      });
    }
  });
});
