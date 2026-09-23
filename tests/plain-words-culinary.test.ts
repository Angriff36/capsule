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

describe("plain words on culinary manifests", () => {
  it("keeps leftover culinary-manifest policy copy free of command jargon", () => {
    const files = [
      "src/culinary/component-import.manifest",
      "src/culinary/component.manifest",
      "src/culinary/dish-container.manifest",
      "src/culinary/dish.manifest",
      "src/culinary/event-dish.manifest",
      "src/culinary/ingredient.manifest",
      "src/culinary/menu-dish.manifest",
      "src/culinary/menu.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute event dish commands",
      "execute ingredient commands",
      "execute dish commands",
      "execute menu commands",
      "execute component commands",
      "execute component import commands",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Managers, sales and kitchen staff may update event dishes",
      "Managers, sales and kitchen staff may change event dishes",
      "Managers and kitchen staff may update event dish overrides",
      "Managers and kitchen staff may change event dish overrides",
      "Kitchen staff may update ingredients",
      "Kitchen staff may change ingredients",
      "Kitchen, inventory and managers may update unit mappings",
      "Kitchen, inventory and managers may change unit mappings",
      "Kitchen staff and managers may update dishes",
      "Kitchen staff and managers may change dishes",
      "Kitchen staff may update dish ingredient lines",
      "Kitchen staff may change dish ingredient lines",
      "Kitchen staff may update dish recipes",
      "Kitchen staff may change dish recipes",
      "Kitchen staff and managers may update dish task templates",
      "Kitchen staff and managers may change dish task templates",
      "Kitchen staff and managers may update task materials",
      "Kitchen staff and managers may change task materials",
      "Kitchen staff may update dish containers",
      "Kitchen staff may change dish containers",
      "Kitchen staff may update recipes",
      "Kitchen staff may change recipes",
      "Kitchen staff may update recipe ingredient lines",
      "Kitchen staff may change recipe ingredient lines",
      "Kitchen staff may update recipe steps",
      "Kitchen staff may change recipe steps",
      "Kitchen staff may update recipe versions",
      "Kitchen staff may change recipe versions",
      "Kitchen staff may update nested recipe lines",
      "Kitchen staff may change nested recipe lines",
      "Kitchen staff may update portion sizes",
      "Kitchen staff may change portion sizes",
      "Kitchen staff may update recipe imports",
      "Kitchen staff may change recipe imports",
      "Kitchen staff may update recipe import lines",
      "Kitchen staff may change recipe import lines",
      "Kitchen staff may update menus",
      "Kitchen staff may change menus",
      "Kitchen staff may update menu dish lines",
      "Kitchen staff may change menu dish lines",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover culinary READ copy free of component jargon", () => {
    const files = [
      "src/culinary/component.manifest",
      "src/culinary/component-import.manifest",
      "src/culinary/dish.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Kitchen staff may read components",
      "Kitchen staff may read component ingredient lines",
      "Kitchen staff may read component steps",
      "Kitchen staff may read component version history",
      "Kitchen staff may read portion specs",
      "Kitchen staff may read component imports",
      "Kitchen staff may read component import lines",
      "Kitchen staff may read dish component composition",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen staff may see recipes",
      "Kitchen staff may see recipe ingredient lines",
      "Kitchen staff may see recipe steps",
      "Kitchen staff may see recipe versions",
      "Kitchen staff may see portion sizes",
      "Kitchen staff may see recipe imports",
      "Kitchen staff may see recipe import lines",
      "Kitchen staff may see dish recipes",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain("Kitchen staff may update recipes");
    expect(visible).toContain("Kitchen staff may update recipe imports");
    expect(visible).toContain("Kitchen staff may update portion sizes");
    expect(visible).toContain("Kitchen staff may update dish recipes");

    // later leftovers stay as-is
    expect(visible).toContain("Kitchen staff may read nested recipe lines");
    expect(visible).toContain("Portion spec name is required");
  });
});
