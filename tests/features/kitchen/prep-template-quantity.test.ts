import { describe, expect, it } from "vitest";
import {
  PrepTemplateQuantityCoordinator,
  prepTemplateQuantityMeta,
  prepTemplateWantsQuantity,
} from "../../../src/features/kitchen/PrepTemplateQuantityCoordinator";
import { quantityForDishTask } from "../../../src/features/kitchen/prepTaskQuantity";

describe("prep template batch-total leftover: persist derived per-guest", () => {
  it("commits 97.50 / 260 as ~0.375, not a default 1", () => {
    const commit = PrepTemplateQuantityCoordinator.commit(
      "batch_total",
      "",
      "97.50",
      "260",
    );
    expect(commit).toEqual({ ok: true, perGuest: 0.375 });
    expect(commit.ok && commit.perGuest).not.toBe(1);

    const persist = PrepTemplateQuantityCoordinator.persist(
      "batch_total",
      "",
      "97.50",
      "260",
    );
    expect(persist).toEqual({ ok: true, defaultQuantity: 0.375 });
    expect(persist.ok && persist.defaultQuantity).not.toBe(1);

    const typed = PrepTemplateQuantityCoordinator.persist(
      "batch_total",
      "1",
      "97.5",
      "260",
    );
    expect(typed).toEqual({ ok: true, defaultQuantity: 0.375 });
  });

  it("per-guest mode still persists the typed per-guest qty", () => {
    expect(
      PrepTemplateQuantityCoordinator.commit("per_guest", "0.375", "", ""),
    ).toEqual({ ok: true, perGuest: 0.375 });
    expect(
      PrepTemplateQuantityCoordinator.persist(
        "per_guest",
        "0.375",
        "97.50",
        "260",
      ),
    ).toEqual({ ok: true, defaultQuantity: 0.375 });
    expect(
      PrepTemplateQuantityCoordinator.persist("per_guest", "1", "", ""),
    ).toEqual({ ok: true, defaultQuantity: 1 });
  });

  it("does not multiply equipment_fixed amounts by guest count", () => {
    expect(quantityForDishTask("equipment_fixed", 6, 98)).toBe(6);
    expect(quantityForDishTask("manual", 0.5, 40)).toBe(20);
    expect(quantityForDishTask("manual", null, 40)).toBe(40);
  });

  it("Fixed mode requires a positive amount and stamps equipment_fixed", () => {
    expect(prepTemplateWantsQuantity("fixed", "", "", "")).toBe(true);
    expect(
      PrepTemplateQuantityCoordinator.persist("fixed", "", "", ""),
    ).toEqual({
      ok: false,
      error: "Fixed amount must be greater than zero.",
    });
    expect(
      PrepTemplateQuantityCoordinator.persist("fixed", "", "12", ""),
    ).toEqual({
      ok: true,
      defaultQuantity: 12,
      taskType: "equipment_fixed",
    });
  });

  it("empty / zero per-guest omits quantity (0 = one each)", () => {
    expect(prepTemplateWantsQuantity("per_guest", "", "", "")).toBe(false);
    expect(prepTemplateWantsQuantity("per_guest", "0", "", "")).toBe(false);
    expect(
      PrepTemplateQuantityCoordinator.persist("per_guest", "0", "", ""),
    ).toEqual({ ok: true, defaultQuantity: undefined });
    expect(prepTemplateWantsQuantity("batch_total", "", "97.50", "260")).toBe(
      true,
    );
  });

  it("shows the stored per-guest rate, not a ceiled 1 each/guest", () => {
    expect(prepTemplateQuantityMeta(0.375, "each")).toBe("0.375 each/guest");
    expect(prepTemplateQuantityMeta(0.375, "each")).not.toBe("1 each/guest");
    expect(prepTemplateQuantityMeta(1, "each")).toBe("1 each/guest");
    expect(prepTemplateQuantityMeta(undefined, "each")).toBeNull();
  });
});
