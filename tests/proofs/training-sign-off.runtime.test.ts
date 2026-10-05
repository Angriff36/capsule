/**
 * Training sign-off (Mangia "Training Doc"): a module holds its steps and
 * quiz; a workforce manager starts a trainee with a trainer, initials steps,
 * finishes with the quiz done, and can reopen it. An end date before the
 * start date is refused.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  rolesFor,
  runner,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;
const tenantId = "tenant-training-sign-off";
const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

type SignOff = {
  version: number;
  trainerPersonId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  initialledSteps: string | null;
  quizDone: boolean;
  note: string | null;
};

describe("runtime proof: training sign-off", () => {
  it("keeps steps and quiz, starts, initials, finishes and reopens", async () => {
    const proof = harness();
    const roles = rolesFor(proof, tenantId);
    const manage = runner(proof, roles.workforce);
    const hire = (givenName: string) =>
      manage(M.Person_createViaHire, {
        givenName,
        familyName: "Crew",
        email: `${givenName.toLowerCase()}@signoff.example`,
        role: "event_staff",
        employmentType: "part_time",
        authSubjectId: `${tenantId}-${givenName}`,
      });
    const trainee = await hire("Tess");
    const trainer = await hire("Rob");
    const module = await manage(M.TrainingModule_createViaDefine, {
      name: "Rebuild kits",
      category: "other",
      passingScore: 80,
      steps: "Go over all kits\n- What is a kit",
      quiz: "Q: What do the red magnets signify?",
    });
    const read = async <T>(id: string) =>
      (await roles.workforce.run(async (ctx) => ctx.db.get(id as never))) as T;
    const defined = await read<{
      version: number;
      steps: string;
      quiz: string;
    }>(module.docId);
    expect(defined.steps).toBe("Go over all kits\n- What is a kit");
    expect(defined.quiz).toBe("Q: What do the red magnets signify?");

    await manage(M.TrainingModule_setTrainingDoc, {
      docId: module.docId,
      version: defined.version,
      steps: "Go over all kits\nKit process when returning",
      quiz: "  ",
    });
    const edited = await read<{ steps: string; quiz: string | null }>(
      module.docId,
    );
    expect(edited.steps).toBe("Go over all kits\nKit process when returning");
    expect(edited.quiz ?? null).toBeNull();

    const started = await manage(M.TrainingSignOff_createViaBeginTraining, {
      personId: trainee.docId,
      trainingModuleId: module.docId,
      trainerPersonId: trainer.docId,
      startedAt: day("2026-10-01"),
    });
    let row = await read<SignOff>(started.docId);
    expect(row.trainerPersonId).toBe(trainer.docId);
    expect(row.startedAt).toBe(day("2026-10-01"));
    expect(row.finishedAt ?? null).toBeNull();
    expect(row.quizDone).toBe(false);

    const initialled = `Go over all kits|RC|${day("2026-10-02")}`;
    await manage(M.TrainingSignOff_initialTrainingSteps, {
      docId: started.docId,
      version: row.version,
      initialledSteps: initialled,
    });
    row = await read<SignOff>(started.docId);
    expect(row.initialledSteps).toBe(initialled);

    await expect(
      manage(M.TrainingSignOff_finishTraining, {
        docId: started.docId,
        version: row.version,
        finishedAt: day("2026-09-30"),
        quizDone: true,
      }),
    ).rejects.toThrow(/end date cannot be before the start date/i);

    await manage(M.TrainingSignOff_finishTraining, {
      docId: started.docId,
      version: row.version,
      finishedAt: day("2026-10-03"),
      quizDone: true,
      note: "  Restocked 2 kits alone  ",
    });
    row = await read<SignOff>(started.docId);
    expect(row.finishedAt).toBe(day("2026-10-03"));
    expect(row.quizDone).toBe(true);
    expect(row.note).toBe("Restocked 2 kits alone");

    await manage(M.TrainingSignOff_reopenTraining, {
      docId: started.docId,
      version: row.version,
    });
    row = await read<SignOff>(started.docId);
    expect(row.finishedAt ?? null).toBeNull();
    expect(row.initialledSteps).toBe(initialled);
  });
});
