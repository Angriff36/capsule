import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/events/EventEquipmentPanel.css", "utf8");
const page = readFileSync(
  "src/features/events/EventEquipmentPanel.tsx",
  "utf8",
);

describe("dispatch board follows html theme tokens", () => {
  it("paints paper/ink from inherited --color-*, not hardcoded cream", () => {
    expect(page).toContain('className="equipment-dispatch"');
    expect(css).toContain("--dispatch-paper: var(--color-panel)");
    expect(css).toContain("--dispatch-ink: var(--color-ink)");
    expect(css).toContain("var(--dispatch-paper)");
    // 174 shipped `.dark .equipment-dispatch { --dispatch-paper: #232b26 }`
    // while `.equipment-dispatch` still set #f2efe5. Prod kept painting
    // cream. Binding to theme tokens is the lock; cream literals fail.
    expect(css).not.toContain("#f2efe5");
    expect(css).not.toContain("#17221d");
    expect(css).not.toContain("#e9e4d5");
  });
});
