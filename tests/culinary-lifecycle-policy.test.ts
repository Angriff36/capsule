import { describe, expect, it } from "vitest";
import { CulinaryLifecyclePolicy } from "../src/features/kitchen/CulinaryLifecyclePolicy";

describe("CulinaryLifecyclePolicy", () => {
  const policy = new CulinaryLifecyclePolicy();

  it("offers one-click delete for live components without a reason prompt path", () => {
    expect(
      policy.componentActions("draft").map((action) => action.key),
    ).toEqual(["publishVersion", "purge"]);
    expect(
      policy.componentActions("published").map((action) => action.key),
    ).toEqual(["retract", "purge"]);
    expect(policy.componentActions("retired", Date.now())).toEqual([]);
    expect(policy.componentActions("retired", null).map((a) => a.key)).toEqual([
      "purge",
    ]);
  });

  it("offers delete without restore-first; restore only when explicitly included", () => {
    expect(
      policy.ingredientActions("active").map((action) => action.key),
    ).toEqual(["purge"]);
    expect(
      policy
        .ingredientActions("discontinued", Date.now())
        .map((action) => action.key),
    ).toEqual([]);
    expect(
      policy
        .ingredientActions("discontinued", Date.now(), { includeRestore: true })
        .map((action) => action.key),
    ).toEqual(["reinstate"]);
    expect(policy.dishActions("active").map((action) => action.key)).toEqual([
      "purge",
    ]);
    expect(
      policy
        .dishActions("retired", Date.now(), { includeRestore: true })
        .map((action) => action.key),
    ).toEqual(["reinstate"]);
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
