import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventMenuUnpricedEstimateLabel } from "../src/features/events/eventMenuCost";

const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");

describe("event menu tab course and cost", () => {
  it("lets a dish course be saved on the event menu tab", () => {
    expect(tab).toContain("useEventDishChangeCourse");
    expect(tab).toContain('name="course"');
    expect(tab).toContain("changeCourse");
  });

  it("always prints estimated cost, even when the dish has none", () => {
    expect(tab).toContain('{" · est. "}');
    expect(tab).toContain("eventMenuDishEstimateKind");
    expect(tab).toContain("eventMenuUnpricedEstimateLabel(estimateKind)");
    expect(tab).toContain('estimateKind === "priced"');
    expect(tab).toContain("formatMoneyExact(estimated)");
    expect(tab).not.toContain(
      '{estimated > 0 ? formatMoneyExact(estimated) : "—"}',
    );
    expect(tab).not.toMatch(
      /estimated > 0\s*\?\s*` · est\. \$\{formatMoneyExact\(estimated\)\}`\s*:\s*""/,
    );
    expect(`est. ${eventMenuUnpricedEstimateLabel("unit_mismatch")}`).toBe(
      "est. — (units not converted)",
    );
    expect(`est. ${eventMenuUnpricedEstimateLabel("unpriced")}`).toBe("est. —");
  });
});
