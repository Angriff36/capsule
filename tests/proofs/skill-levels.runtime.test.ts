/**
 * Skills matrix (Mangia "Utility Skills Matrix Criteria"): a workforce
 * manager rates a person 0-4 in a training-module area, changes it in place,
 * and a level outside 0-4 is refused.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  rolesFor,
  runner,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;
const tenantId = "tenant-skill-levels";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: skill levels", () => {
  it("rates, re-rates in place, and refuses a level above 4", async () => {
    const proof = harness();
    const roles = rolesFor(proof, tenantId);
    const manage = runner(proof, roles.workforce);
    const person = await manage(M.Person_createViaHire, {
      givenName: "Ann",
      familyName: "Packer",
      email: "ann@skills.example",
      role: "event_staff",
      employmentType: "part_time",
      authSubjectId: `${tenantId}-ann`,
    });
    const module = await manage(M.TrainingModule_createViaDefine, {
      name: "Event packing",
      category: "other",
      passingScore: 80,
    });

    await expect(
      manage(M.SkillLevel_createViaRate, {
        personId: person.docId,
        trainingModuleId: module.docId,
        level: 5,
      }),
    ).rejects.toThrow(/level from 0 to 4/i);

    const rated = await manage(M.SkillLevel_createViaRate, {
      personId: person.docId,
      trainingModuleId: module.docId,
      level: 1,
      note: "  Packed 2 events with a trainer  ",
    });
    const first = (await roles.workforce.run(async (ctx) =>
      ctx.db.get(rated.docId as never),
    )) as {
      level: number;
      note: string | null;
      ratedAt: number | null;
      version: number;
    };
    expect(first.level).toBe(1);
    expect(first.note).toBe("Packed 2 events with a trainer");
    expect(first.ratedAt).toEqual(expect.any(Number));

    await manage(M.SkillLevel_changeLevel, {
      docId: rated.docId,
      version: first.version,
      level: 4,
    });
    const after = (await roles.workforce.run(async (ctx) =>
      ctx.db.get(rated.docId as never),
    )) as { level: number; note: string | null; version: number };
    expect(after.level).toBe(4);
    expect(after.note ?? null).toBeNull();

    await expect(
      manage(M.SkillLevel_changeLevel, {
        docId: rated.docId,
        version: after.version,
        level: -1,
      }),
    ).rejects.toThrow(/level from 0 to 4/i);

    const rows = (await roles.workforce.run(async (ctx) =>
      ctx.db.query("skillLevels" as never).collect(),
    )) as unknown[];
    expect(rows).toHaveLength(1);
  });
});
