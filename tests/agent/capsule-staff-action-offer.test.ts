import { describe, expect, it } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import {
  announcementStaffActions,
  staffActionNeedsConfirm,
} from "../../src/agent/CapsuleStaffActionOffer";

describe("staff action offers from generated presentation", () => {
  const offers = announcementStaffActions();

  it("offers the human post action with its generated label and fields", () => {
    const post = offers.forPerson("Announcement.post");
    expect(post?.label).toBe("Post");
    expect(post?.exposure).toBe("human");
    expect(post?.confirm).toBe(false);
    const names = post?.fields.map((field) => field.name);
    expect(names).toEqual(["title", "body", "category", "expiresAt"]);
    expect(post?.fields.every((field) => field.required)).toBe(true);
    const category = post?.fields.find((field) => field.name === "category");
    expect(category?.choices?.map((choice) => choice.value)).toEqual([
      "policyUpdate",
      "safety",
      "training",
      "general",
    ]);
  });

  it("hides an internal command from people and still leaves it callable", () => {
    expect(offers.forPerson("IngredientDemand.syncFromContributions")).toBe(
      null,
    );
    expect(
      offers.stillCallableBySystem("IngredientDemand.syncFromContributions"),
    ).toBe(true);
    expect(
      new CapsuleCommandCatalog().has("IngredientDemand.syncFromContributions"),
    ).toBe(true);
  });

  it("asks before a destructive action only when generated confirm is set", () => {
    const remove = offers.forPerson("Announcement.remove");
    expect(remove?.label).toBe("Remove");
    expect(staffActionNeedsConfirm(remove)).toBe(false);
    expect(
      staffActionNeedsConfirm(remove ? { ...remove, confirm: true } : null),
    ).toBe(true);
  });
});
