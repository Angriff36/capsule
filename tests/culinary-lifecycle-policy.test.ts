import { describe, expect, it } from "vitest";
import { CulinaryLifecyclePolicy } from "../src/features/kitchen/CulinaryLifecyclePolicy";

describe("CulinaryLifecyclePolicy", () => {
  const policy = new CulinaryLifecyclePolicy();

  it("derives recipe actions from generated lifecycle metadata", () => {
    expect(policy.recipeActions("draft").map((action) => action.key)).toEqual([
      "publishVersion",
      "retire",
    ]);
    expect(
      policy.recipeActions("published").map((action) => action.key),
    ).toEqual(["retract", "retire"]);
    expect(policy.recipeActions("retired").map((action) => action.key)).toEqual(
      ["reinstate"],
    );
  });

  it("derives ingredient and dish retirement actions from generated metadata", () => {
    expect(
      policy.ingredientActions("active").map((action) => action.key),
    ).toEqual(["discontinue"]);
    expect(
      policy.ingredientActions("discontinued").map((action) => action.key),
    ).toEqual(["reinstate"]);
    expect(policy.dishActions("active").map((action) => action.key)).toEqual([
      "retire",
    ]);
    expect(policy.dishActions("retired").map((action) => action.key)).toEqual([
      "reinstate",
    ]);
  });

  it("derives menu publishing actions from generated metadata", () => {
    expect(policy.menuActions("draft").map((action) => action.key)).toEqual([
      "markPublished",
      "archive",
    ]);
    expect(policy.menuActions("published").map((action) => action.key)).toEqual(
      ["unpublish", "archive", "restore"],
    );
    expect(policy.menuActions("archived").map((action) => action.key)).toEqual([
      "unpublish",
      "restore",
    ]);
  });
});
