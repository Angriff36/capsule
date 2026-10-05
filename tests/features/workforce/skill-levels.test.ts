import { describe, expect, it } from "vitest";
import {
  findSkillLevel,
  skillLevelName,
  trainersFor,
  type SkillLevelRow,
} from "../../../src/features/workforce/skillLevels";

const row = (
  over: Partial<SkillLevelRow> & Pick<SkillLevelRow, "personId" | "level">,
): SkillLevelRow => ({
  _id: `${over.personId}-${over.level}`,
  version: 1,
  trainingModuleId: "packing",
  ratedAt: 1,
  ...over,
});

describe("skills matrix levels", () => {
  it("names the five levels", () => {
    expect([0, 1, 2, 3, 4].map(skillLevelName)).toEqual([
      "No knowledge",
      "Beginner",
      "Independent",
      "Expert",
      "Trainer",
    ]);
    expect(skillLevelName(9)).toBe("Not rated");
  });

  it("finds the newest live rating and lists the trainers", () => {
    const rows = [
      row({ personId: "ann", level: 2, ratedAt: 1 }),
      row({ personId: "ann", level: 4, ratedAt: 5 }),
      row({ personId: "ben", level: 4, deletedAt: 3 }),
      row({ personId: "cal", level: 3 }),
      row({ personId: "dee", level: 4, trainingModuleId: "propane" }),
    ];
    expect(findSkillLevel(rows, "ann", "packing")?.level).toBe(4);
    expect(findSkillLevel(rows, "ben", "packing")).toBeNull();
    expect(trainersFor(rows, ["ann", "ben", "cal", "dee"], "packing")).toEqual([
      "ann",
    ]);
  });
});
