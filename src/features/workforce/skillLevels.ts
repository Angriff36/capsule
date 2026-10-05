// Skills matrix levels (Mangia "Utility Skills Matrix Criteria", 10-24-22).

export const SKILL_LEVELS = [
  {
    level: 0,
    name: "No knowledge",
    meaning:
      "Not shown this task yet. Can help someone at level 2 or above, but not ready to be trained on it.",
  },
  {
    level: 1,
    name: "Beginner",
    meaning:
      "Has the task as part of the job and a basic understanding. Works it only with a trainer (level 4).",
  },
  {
    level: 2,
    name: "Independent",
    meaning:
      "Training done. Works the task without a supervisor and answers questions from the written steps.",
  },
  {
    level: 3,
    name: "Expert",
    meaning:
      "Fully efficient without help or the written steps, and brings ideas to improve it.",
  },
  {
    level: 4,
    name: "Trainer",
    meaning:
      "Does the task at a high level and teaches it the Mangia way without straying from the set steps.",
  },
] as const;

export function skillLevelName(level: number): string {
  return SKILL_LEVELS.find((row) => row.level === level)?.name ?? "Not rated";
}

export interface SkillLevelRow {
  _id: string;
  version: number;
  personId: string;
  trainingModuleId: string;
  level: number;
  note?: string | null;
  ratedAt?: number | null;
  deletedAt?: number | null;
}

/** The rating for one person in one area (the newest if there are two). */
export function findSkillLevel(
  rows: readonly SkillLevelRow[],
  personId: string,
  trainingModuleId: string,
): SkillLevelRow | null {
  let found: SkillLevelRow | null = null;
  for (const row of rows) {
    if (row.deletedAt != null || row.ratedAt == null) continue;
    if (row.personId !== personId || row.trainingModuleId !== trainingModuleId)
      continue;
    if (!found || (row.ratedAt ?? 0) > (found.ratedAt ?? 0)) found = row;
  }
  return found;
}

/** People at level 4 in an area: who a beginner must work with. */
export function trainersFor(
  rows: readonly SkillLevelRow[],
  personIds: readonly string[],
  trainingModuleId: string,
): string[] {
  return personIds.filter(
    (personId) => findSkillLevel(rows, personId, trainingModuleId)?.level === 4,
  );
}
