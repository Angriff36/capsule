import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PrepTemplateQuantityCoordinator,
  prepTemplateQuantityMeta,
  prepTemplateWantsQuantity,
} from "../../../src/features/kitchen/PrepTemplateQuantityCoordinator";

const panel = readFileSync(
  "src/features/kitchen/DishPrepTasksPanel.tsx",
  "utf8",
);

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

  it("wires DishPrepTasksPanel through persist (leftover-return lock)", () => {
    expect(panel).toContain("PrepTemplateQuantityCoordinator.persist");
    expect(panel).toContain("prepTemplateQuantityMeta");
    expect(panel).toContain("defaultQuantity: qtySave.defaultQuantity");
    expect(panel).toContain("qtySave.defaultQuantity != null ? unit");
    expect(panel).not.toContain("prepQuantityLabel");
    expect(panel).not.toContain("function templateQuantityMeta");
    expect(panel).not.toMatch(/defaultQuantity:\s*1\b/);
    expect(panel).not.toContain('Number(data.get("defaultQuantity")');
    expect(panel).not.toMatch(/defaultQuantity:\s*perGuest\s*\?\?\s*undefined/);

    const persistAt = panel.indexOf("PrepTemplateQuantityCoordinator.persist");
    expect(persistAt).toBeGreaterThan(-1);
    const persistBlock = panel.slice(persistAt, persistAt + 900);
    expect(persistBlock).toContain("quantityMode");
    expect(persistBlock).toContain("perGuestQty");
    expect(persistBlock).toContain("batchTotalQty");
    expect(persistBlock).toContain("batchServings");
    expect(persistBlock).toContain("defaultQuantity: qtySave.defaultQuantity");
    expect(persistBlock).not.toContain("defaultQuantity: 1");
  });
});
