import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on leftover kitchen Component labels", () => {
  it("keeps leftover kitchen page-guide retire-prompt chat and import Component labels as Recipe", () => {
    const guides = readFileSync("src/app/guide/pageGuides.ts", "utf8");
    const reasonCopy = readFileSync(
      "src/ui/action-prompt/ReasonCopy.ts",
      "utf8",
    );
    const chatLinks = readFileSync(
      "src/features/chat/chatLinkTokens.ts",
      "utf8",
    );
    const operations = readFileSync("convex/lib/culinaryOperations.ts", "utf8");
    // Old words are gone; the retireComponent key, component link kind,
    // /kitchen/components path, and componentImports table are identifiers.
    expect(guides).not.toContain("grouped by component");
    expect(guides).not.toContain("Look for components that consistently");
    expect(reasonCopy).not.toContain("Retire component");
    expect(reasonCopy).not.toContain("Record why this component");
    expect(chatLinks).not.toContain('component: "Component"');
    expect(operations).not.toContain("Component import not found");
    expect(guides).toContain("grouped by recipe.");
    expect(guides).toContain(
      "Look for recipes that consistently under- or over-yield and fix the recipe or the prep.",
    );
    expect(reasonCopy).toContain('title: "Retire recipe"');
    expect(reasonCopy).toContain(
      '"Say why this recipe is leaving the active book."',
    );
    expect(reasonCopy).toContain('confirmLabel: "Retire recipe"');
    expect(chatLinks).toContain('component: "Recipe"');
    expect(operations).toContain('"Recipe import not found"');
    expectPlain("grouped by recipe");
    expectPlain("Retire recipe");
    expectPlain("Say why this recipe is leaving the active book.");
    expectPlain("Recipe");
    expectPlain("Recipe import not found");
  });
});
